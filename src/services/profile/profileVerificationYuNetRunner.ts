import crypto from "node:crypto";
import fs from "node:fs/promises";
import pathModule from "node:path";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

import { YUNET_RUNTIME_CONFIG } from "../../config/yunetRuntimeConfig";
import { technicalInferenceFailure } from "./profileVerificationInferenceAdapter";
import { YUNET_ARTIFACT, YUNET_LIMITS } from "./profileVerificationYuNet.constants";
import { YuNetDetection, YuNetFace } from "./profileVerificationYuNet.types";
import { createYuNetRunnerAudit, updateYuNetRunnerAudit, YuNetRunnerRole } from "./profileVerificationYuNetRuntimeAudit.service";

type Output = Record<string, { data: unknown; dispose?: () => void }>;
type YuNetCandidate = { score: number; stride: number; index: number; row: number; column: number; bbox: Float32Array; kps: Float32Array };
export type YuNetPreFilterScoreSummary = {
  finiteScoreCount: number;
  nonFiniteScoreCount: number;
  topScores: number[];
  thresholdCounts: Record<"0.30" | "0.40" | "0.50" | "0.55" | "0.60" | "0.65" | "0.70" | "0.80" | "0.90", number>;
};
let sessionPromise: Promise<ort.InferenceSession> | null = null;

const disposeOutput = (output: Output) => {
  for (const tensor of Object.values(output)) tensor.dispose?.();
};

const iou = (a: YuNetFace, b: YuNetFace) => {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return (w * h) / Math.max(1, a.width * a.height + b.width * b.height - w * h);
};
const nms = (faces: YuNetFace[]) => {
  const kept: YuNetFace[] = [];
  for (const face of [...faces].sort((a, b) => b.confidence - a.confidence)) if (kept.every((other) => iou(face, other) < YUNET_LIMITS.nmsThreshold)) kept.push(face);
  return kept;
};

const loadSession = async (role: YuNetRunnerRole, auditEnabled = true) => {
  if (sessionPromise) {
    if (!auditEnabled) return sessionPromise;
    const path = YUNET_RUNTIME_CONFIG.configuredPath;
    const resolvedPath = YUNET_RUNTIME_CONFIG.resolvedPath;
    const exists = resolvedPath ? await fs.access(resolvedPath).then(() => true).catch(() => false) : false;
    await createYuNetRunnerAudit({ role, value: path, resolvedPath, resolvedPathExists: exists, outcome: "SESSION_LOAD_SUCCEEDED" });
    return sessionPromise;
  }
  sessionPromise = (async () => {
    const path = YUNET_RUNTIME_CONFIG.configuredPath;
    const resolvedPath = YUNET_RUNTIME_CONFIG.resolvedPath;
    const exists = resolvedPath ? await fs.access(resolvedPath).then(() => true).catch(() => false) : false;
    const audit = auditEnabled ? await createYuNetRunnerAudit({ role, value: path, resolvedPath, resolvedPathExists: exists, outcome: path ? (exists ? "PATH_RESOLVED" : "MODEL_FILE_MISSING") : "ENV_ABSENT" }) : null;
    if (!path) throw technicalInferenceFailure("YuNet model artifact is not configured");
    let bytes: Buffer;
    try { bytes = await fs.readFile(path); } catch { if (audit) await updateYuNetRunnerAudit(audit._id, "MODEL_READ_FAILED"); throw technicalInferenceFailure(); }
    if (bytes.length !== YUNET_ARTIFACT.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== YUNET_ARTIFACT.sha256) throw technicalInferenceFailure("YuNet model artifact integrity validation failed");
    let session: ort.InferenceSession;
    try {
      session = await ort.InferenceSession.create(bytes, {
        executionProviders: ["cpu"],
        // YuNet accepts dynamic image dimensions. Do not retain its largest
        // per-image allocation in the process-wide CPU arena or memory pattern.
        enableCpuMemArena: false,
        enableMemPattern: false,
      });
    }
    catch { if (audit) await updateYuNetRunnerAudit(audit._id, "SESSION_LOAD_FAILED"); throw technicalInferenceFailure(); }
    const metadata = session.inputMetadata[0];
    if (session.inputNames.length !== 1 || session.inputNames[0] !== "input" || !metadata?.isTensor || metadata.shape.join(",") !== "1,3,height,width") throw technicalInferenceFailure("YuNet model input contract is invalid");
    if (audit) await updateYuNetRunnerAudit(audit._id, "SESSION_LOAD_SUCCEEDED"); return session;
  })();
  try { return await sessionPromise; } catch (error) { sessionPromise = null; throw error; }
};

/** Test-only cache reset; production never changes the configured artifact at runtime. */
export const resetYuNetRunnerForTests = () => { sessionPromise = null; };

const runYuNetInference = async (encoded: Buffer, role: YuNetRunnerRole, auditEnabled = true) => {
  const source = sharp(encoded, { limitInputPixels: YUNET_LIMITS.maxPixels, limitInputChannels: YUNET_LIMITS.maxChannels, pages: 1, animated: false, failOn: "warning" });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || metadata.width > YUNET_LIMITS.maxWidth || metadata.height > YUNET_LIMITS.maxHeight || metadata.width * metadata.height > YUNET_LIMITS.maxPixels || (metadata.pages && metadata.pages !== 1)) throw technicalInferenceFailure("Face evidence decode limits exceeded");
  const right = (YUNET_LIMITS.divisor - (metadata.width % YUNET_LIMITS.divisor)) % YUNET_LIMITS.divisor;
  const bottom = (YUNET_LIMITS.divisor - (metadata.height % YUNET_LIMITS.divisor)) % YUNET_LIMITS.divisor;
  const raw = await source.rotate().removeAlpha().toColourspace("srgb").extend({ right, bottom, background: { r: 0, g: 0, b: 0, alpha: 1 } }).raw().toBuffer({ resolveWithObject: true });
  if (raw.info.channels !== 3) throw technicalInferenceFailure("Face evidence decoded channel contract is invalid");
  const tensor = new Float32Array(raw.info.width * raw.info.height * 3);
  for (let pixel = 0; pixel < raw.info.width * raw.info.height; pixel += 1) { tensor[pixel] = raw.data[pixel * 3 + 2]; tensor[raw.info.width * raw.info.height + pixel] = raw.data[pixel * 3 + 1]; tensor[2 * raw.info.width * raw.info.height + pixel] = raw.data[pixel * 3]; }
  const input = new ort.Tensor("float32", tensor, [1, 3, raw.info.height, raw.info.width]);
  try {
    const output = await (await loadSession(role, auditEnabled)).run({ input });
    return { output, raw, metadata };
  } finally {
    input.dispose();
  }
};

export type YuNetDecisionScoreSummary = { maxRawConfidence: number | null; rawFiniteCandidateCount: number; candidatesAtThreshold: number };

export const detectYuNetFaces = async (encoded: Buffer, role: YuNetRunnerRole = "UNSPECIFIED", auditEnabled = true, observeScores?: (summary: YuNetDecisionScoreSummary) => void): Promise<YuNetDetection> => {
  try {
    const { output, raw, metadata } = await runYuNetInference(encoded, role, auditEnabled);
    try {
      const faces = decodeYuNetOutput(output, raw.info.width, raw.info.height, metadata.width!, metadata.height!);
      if (observeScores) {
        const summary: YuNetDecisionScoreSummary = { maxRawConfidence: null, rawFiniteCandidateCount: 0, candidatesAtThreshold: 0 };
        forEachYuNetCandidate(output, raw.info.width, raw.info.height, ({ score }) => {
          if (!Number.isFinite(score)) return;
          summary.rawFiniteCandidateCount += 1;
          summary.maxRawConfidence = Math.max(summary.maxRawConfidence ?? score, score);
          if (score >= YUNET_LIMITS.scoreThreshold) summary.candidatesAtThreshold += 1;
        });
        // Observability must never change a successful detector decision.
        try { observeScores(summary); } catch { /* Preserve detection behavior. */ }
      }
      return { width: metadata.width!, height: metadata.height!, decodedBytes: raw.data.length, faces };
    } finally {
      disposeOutput(output);
    }
  } catch (error) { if (error instanceof Error && error.name === "ProfileVerificationInferenceError") throw error; throw technicalInferenceFailure(); }
};

const forEachYuNetCandidate = (output: Output, paddedWidth: number, paddedHeight: number, visit: (candidate: YuNetCandidate) => void) => {
  for (const stride of [8, 16, 32]) {
    const cls = output[`cls_${stride}`]?.data as Float32Array | undefined; const obj = output[`obj_${stride}`]?.data as Float32Array | undefined; const bbox = output[`bbox_${stride}`]?.data as Float32Array | undefined; const kps = output[`kps_${stride}`]?.data as Float32Array | undefined;
    const cols = paddedWidth / stride; const rows = paddedHeight / stride; const expected = cols * rows;
    if (!cls || !obj || !bbox || !kps || cls.length !== expected || obj.length !== expected || bbox.length !== expected * 4 || kps.length !== expected * 10) throw technicalInferenceFailure("YuNet model output contract is invalid");
    for (let index = 0; index < expected; index += 1) {
      const score = Math.sqrt(Math.max(0, Math.min(1, cls[index])) * Math.max(0, Math.min(1, obj[index])));
      visit({ score, stride, index, row: Math.floor(index / cols), column: index % cols, bbox, kps });
    }
  }
};

/** Internal runtime decoder; exported for deterministic tensor-contract certification only. */
export const decodeYuNetOutput = (output: Output, paddedWidth: number, paddedHeight: number, width: number, height: number) => {
  const candidates: YuNetFace[] = [];
  forEachYuNetCandidate(output, paddedWidth, paddedHeight, ({ score, stride, index, row, column, bbox, kps }) => {
      if (score < YUNET_LIMITS.scoreThreshold) return;
      const w = Math.exp(bbox[index * 4 + 2]) * stride;
      const h = Math.exp(bbox[index * 4 + 3]) * stride;
      const point = (pointIndex: number) => ({
        x: (column + kps[index * 10 + pointIndex * 2]) * stride,
        y: (row + kps[index * 10 + pointIndex * 2 + 1]) * stride,
      });
      candidates.push({
        x: (column + bbox[index * 4]) * stride - w / 2,
        y: (row + bbox[index * 4 + 1]) * stride - h / 2,
        width: w,
        height: h,
        confidence: score,
        landmarks: {
          rightEye: point(0),
          leftEye: point(1),
          noseTip: point(2),
          rightMouthCorner: point(3),
          leftMouthCorner: point(4),
        },
      });
  });
  return nms(candidates).slice(0, YUNET_LIMITS.topK).map((face) => {
    const left = Math.max(0, face.x); const top = Math.max(0, face.y);
    const right = Math.min(width, face.x + face.width); const bottom = Math.min(height, face.y + face.height);
    return { ...face, x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  });
};

/** Internal bounded diagnostic; it shares production score calculation and never materializes candidates or invokes NMS. */
export const summarizeYuNetPreFilterScores = (output: Output, paddedWidth: number, paddedHeight: number): YuNetPreFilterScoreSummary => {
  const thresholds = [0.30, 0.40, 0.50, 0.55, 0.60, 0.65, 0.70, 0.80, 0.90] as const;
  const summary: YuNetPreFilterScoreSummary = { finiteScoreCount: 0, nonFiniteScoreCount: 0, topScores: [], thresholdCounts: { "0.30": 0, "0.40": 0, "0.50": 0, "0.55": 0, "0.60": 0, "0.65": 0, "0.70": 0, "0.80": 0, "0.90": 0 } };
  forEachYuNetCandidate(output, paddedWidth, paddedHeight, ({ score }) => {
    if (!Number.isFinite(score)) { summary.nonFiniteScoreCount += 1; return; }
    summary.finiteScoreCount += 1;
    for (const threshold of thresholds) if (score >= threshold) summary.thresholdCounts[threshold.toFixed(2) as keyof typeof summary.thresholdCounts] += 1;
    if (summary.topScores.length < 10 || score > summary.topScores[summary.topScores.length - 1]) {
      summary.topScores.push(score);
      summary.topScores.sort((a, b) => b - a);
      if (summary.topScores.length > 10) summary.topScores.pop();
    }
  });
  return summary;
};

/** Internal diagnostic entry point using exact production preprocessing and ONNX execution, with no NMS. */
export const inspectYuNetPreFilterScores = async (encoded: Buffer, role: YuNetRunnerRole = "UNSPECIFIED") => {
  try {
    const { output, raw } = await runYuNetInference(encoded, role);
    try {
      return summarizeYuNetPreFilterScores(output, raw.info.width, raw.info.height);
    } finally {
      disposeOutput(output);
    }
  } catch (error) { if (error instanceof Error && error.name === "ProfileVerificationInferenceError") throw error; throw technicalInferenceFailure(); }
};
