import crypto from "node:crypto";
import fs from "node:fs/promises";
import pathModule from "node:path";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

import { technicalInferenceFailure } from "./profileVerificationInferenceAdapter";
import { YUNET_ARTIFACT, YUNET_LIMITS } from "./profileVerificationYuNet.constants";
import { YuNetDetection, YuNetFace } from "./profileVerificationYuNet.types";
import { createYuNetRunnerAudit, updateYuNetRunnerAudit, YuNetRunnerRole } from "./profileVerificationYuNetRuntimeAudit.service";

type Output = Record<string, { data: unknown }>;
let sessionPromise: Promise<ort.InferenceSession> | null = null;

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

const loadSession = async (role: YuNetRunnerRole) => {
  if (sessionPromise) {
    const path = process.env.STHN_YUNET_MODEL_PATH;
    const resolvedPath = path ? pathModule.resolve(path) : undefined;
    const exists = resolvedPath ? await fs.access(resolvedPath).then(() => true).catch(() => false) : false;
    await createYuNetRunnerAudit({ role, value: path, resolvedPath, resolvedPathExists: exists, outcome: "SESSION_LOAD_SUCCEEDED" });
    return sessionPromise;
  }
  sessionPromise = (async () => {
    const path = process.env.STHN_YUNET_MODEL_PATH;
    const resolvedPath = path ? pathModule.resolve(path) : undefined;
    const exists = resolvedPath ? await fs.access(resolvedPath).then(() => true).catch(() => false) : false;
    const audit = await createYuNetRunnerAudit({ role, value: path, resolvedPath, resolvedPathExists: exists, outcome: path ? (exists ? "PATH_RESOLVED" : "MODEL_FILE_MISSING") : "ENV_ABSENT" });
    if (!path) throw technicalInferenceFailure("YuNet model artifact is not configured");
    let bytes: Buffer;
    try { bytes = await fs.readFile(path); } catch { await updateYuNetRunnerAudit(audit._id, "MODEL_READ_FAILED"); throw technicalInferenceFailure(); }
    if (bytes.length !== YUNET_ARTIFACT.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== YUNET_ARTIFACT.sha256) throw technicalInferenceFailure("YuNet model artifact integrity validation failed");
    let session: ort.InferenceSession;
    try { session = await ort.InferenceSession.create(bytes, { executionProviders: ["cpu"] }); }
    catch { await updateYuNetRunnerAudit(audit._id, "SESSION_LOAD_FAILED"); throw technicalInferenceFailure(); }
    const metadata = session.inputMetadata[0];
    if (session.inputNames.length !== 1 || session.inputNames[0] !== "input" || !metadata?.isTensor || metadata.shape.join(",") !== "1,3,height,width") throw technicalInferenceFailure("YuNet model input contract is invalid");
    await updateYuNetRunnerAudit(audit._id, "SESSION_LOAD_SUCCEEDED"); return session;
  })();
  try { return await sessionPromise; } catch (error) { sessionPromise = null; throw error; }
};

/** Test-only cache reset; production never changes the configured artifact at runtime. */
export const resetYuNetRunnerForTests = () => { sessionPromise = null; };

export const detectYuNetFaces = async (encoded: Buffer, role: YuNetRunnerRole = "UNSPECIFIED"): Promise<YuNetDetection> => {
  try {
    const source = sharp(encoded, { limitInputPixels: YUNET_LIMITS.maxPixels, limitInputChannels: YUNET_LIMITS.maxChannels, pages: 1, animated: false, failOn: "warning" });
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height || metadata.width > YUNET_LIMITS.maxWidth || metadata.height > YUNET_LIMITS.maxHeight || metadata.width * metadata.height > YUNET_LIMITS.maxPixels || (metadata.pages && metadata.pages !== 1)) throw technicalInferenceFailure("Face evidence decode limits exceeded");
    const right = (YUNET_LIMITS.divisor - (metadata.width % YUNET_LIMITS.divisor)) % YUNET_LIMITS.divisor;
    const bottom = (YUNET_LIMITS.divisor - (metadata.height % YUNET_LIMITS.divisor)) % YUNET_LIMITS.divisor;
    const raw = await source.rotate().removeAlpha().toColourspace("srgb").extend({ right, bottom, background: { r: 0, g: 0, b: 0, alpha: 1 } }).raw().toBuffer({ resolveWithObject: true });
    if (raw.info.channels !== 3) throw technicalInferenceFailure("Face evidence decoded channel contract is invalid");
    const tensor = new Float32Array(raw.info.width * raw.info.height * 3);
    for (let pixel = 0; pixel < raw.info.width * raw.info.height; pixel += 1) { tensor[pixel] = raw.data[pixel * 3 + 2]; tensor[raw.info.width * raw.info.height + pixel] = raw.data[pixel * 3 + 1]; tensor[2 * raw.info.width * raw.info.height + pixel] = raw.data[pixel * 3]; }
    const output = await (await loadSession(role)).run({ input: new ort.Tensor("float32", tensor, [1, 3, raw.info.height, raw.info.width]) });
    const faces = decodeYuNetOutput(output, raw.info.width, raw.info.height, metadata.width, metadata.height);
    return { width: metadata.width, height: metadata.height, decodedBytes: raw.data.length, faces };
  } catch (error) { if (error instanceof Error && error.name === "ProfileVerificationInferenceError") throw error; throw technicalInferenceFailure(); }
};

/** Internal runtime decoder; exported for deterministic tensor-contract certification only. */
export const decodeYuNetOutput = (output: Output, paddedWidth: number, paddedHeight: number, width: number, height: number) => {
  const candidates: YuNetFace[] = [];
  for (const stride of [8, 16, 32]) {
    const cls = output[`cls_${stride}`]?.data as Float32Array | undefined; const obj = output[`obj_${stride}`]?.data as Float32Array | undefined; const bbox = output[`bbox_${stride}`]?.data as Float32Array | undefined; const kps = output[`kps_${stride}`]?.data as Float32Array | undefined;
    const cols = paddedWidth / stride; const rows = paddedHeight / stride; const expected = cols * rows;
    if (!cls || !obj || !bbox || !kps || cls.length !== expected || obj.length !== expected || bbox.length !== expected * 4 || kps.length !== expected * 10) throw technicalInferenceFailure("YuNet model output contract is invalid");
    for (let index = 0; index < expected; index += 1) {
      const score = Math.sqrt(Math.max(0, Math.min(1, cls[index])) * Math.max(0, Math.min(1, obj[index])));
      if (score < YUNET_LIMITS.scoreThreshold) continue;
      const row = Math.floor(index / cols);
      const column = index % cols;
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
    }
  }
  return nms(candidates).slice(0, YUNET_LIMITS.topK).map((face) => {
    const left = Math.max(0, face.x); const top = Math.max(0, face.y);
    const right = Math.min(width, face.x + face.width); const bottom = Math.min(height, face.y + face.height);
    return { ...face, x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  });
};
