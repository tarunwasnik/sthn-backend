import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { classifyYuNetDetections } from "../services/profile/profileVerificationYuNetAdapter";
import { detectYuNetFaces } from "../services/profile/profileVerificationYuNetRunner";
import { alignFaceEvidence, cosineSimilarity, normalizeFaceEmbeddingL2 } from "../services/profile/profileVerificationFaceEmbedding.service";
import { createSFaceInputTensor, getProductionFaceEmbeddingAdapter, SFACE_FACE_EMBEDDING_SPECIFICATION } from "../services/profile/profileVerificationFaceEmbeddingAdapter";
import { medianSFaceSimilarity } from "../services/profile/profileVerificationSFaceShadowAnalysis.service";
import { CalibrationSample } from "../evaluation/sfaceCalibration.types";

if (process.env.NODE_ENV === "production") throw new Error("SFace calibration diagnosis is development-only");
const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: node -r ts-node/register src/scripts/diagnoseSFaceCalibration.ts <manifest.json>");

const hash = (bytes: Uint8Array) => crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16);
const stats = (input: Float32Array | number[]) => {
  const values = Array.from(input);
  const mean = values.reduce((total: number, value: number) => total + value, 0) / values.length;
  const variance = values.reduce((total: number, value: number) => total + (value - mean) ** 2, 0) / values.length;
  return { min: Math.min(...values), max: Math.max(...values), mean, standardDeviation: Math.sqrt(variance) };
};
const norm = (values: readonly number[]) => Math.sqrt(values.reduce((total, value) => total + value * value, 0));

(async () => {
  const base = path.dirname(path.resolve(manifestPath));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { samples: CalibrationSample[] };
  const samples = ["VGG2_TA_M_001", "VGG2_TA_M_002", "VGG2_TA_M_007"].map((id) => manifest.samples.find((sample) => sample.sampleId === id)).filter((sample): sample is CalibrationSample => Boolean(sample));
  if (samples.length !== 3) throw new Error("Three bounded MATCH diagnostic samples are required");
  const embedder = getProductionFaceEmbeddingAdapter();
  const cache = new Map<string, ReturnType<typeof inspect>>();
  async function inspect(file: string) {
    const bytes = await readFile(file); const decoded = await sharp(bytes).rotate().removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    const detection = await detectYuNetFaces(bytes, "UNSPECIFIED", false);
    if (detection.faces.length !== 1) throw new Error("Bounded diagnostic image lacks exactly one detected face");
    const aligned = await alignFaceEvidence({ bytes, landmarks: detection.faces[0].landmarks, preprocessing: SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing });
    const tensor = createSFaceInputTensor(aligned); const rawEmbedding = await embedder.infer(aligned); const embedding = normalizeFaceEmbeddingL2(rawEmbedding, 128);
    return { sourceHash: hash(bytes), decode: { width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels, hash: hash(decoded.data) }, alignedHash: hash(aligned.pixels), tensor: { shape: [1, 3, 112, 112], dtype: "float32", ...stats(tensor), channels: [stats(tensor.slice(0, 112 * 112)), stats(tensor.slice(112 * 112, 2 * 112 * 112)), stats(tensor.slice(2 * 112 * 112))] }, rawEmbedding, embedding };
  }
  const load = (relative: string) => { const absolute = path.resolve(base, relative); if (!cache.has(absolute)) cache.set(absolute, inspect(absolute)); return cache.get(absolute)!; };
  const matrix = [] as Array<{ reference: string; captureSet: string; median: number; usableCaptures: number }>;
  for (const referenceSample of samples) for (const captureSample of samples) {
    const reference = await load(referenceSample.reference); const captures = await Promise.all(captureSample.captures.map(load));
    const detections = await Promise.all(captureSample.captures.map(async (capture, challengeIndex) => ({ challengeIndex, challenge: "NEUTRAL" as const, detection: await detectYuNetFaces(await readFile(path.resolve(base, capture)), "UNSPECIFIED", false) })));
    const usable = classifyYuNetDetections(detections).captures.map((finding, index) => finding.usability === "USABLE" ? index : -1).filter((index) => index >= 0);
    const values = usable.map((index) => cosineSimilarity(reference.embedding, captures[index].embedding, 128));
    matrix.push({ reference: referenceSample.sampleId, captureSet: captureSample.sampleId, median: values.length >= 3 ? medianSFaceSimilarity(values) : Number.NaN, usableCaptures: values.length });
  }
  const primary = samples[0]; const reference = await load(primary.reference); const same = await load(primary.captures[0]); const different = await load(samples[1].captures[0]);
  const files = [reference, same, different];
  const dot = reference.embedding.reduce((total, value, index) => total + value * different.embedding[index], 0);
  console.log(JSON.stringify({ schemaVersion: "STHN_SFACE_BOUNDED_DIAGNOSTIC_V1", samples: files.map((file, index) => ({ role: ["REFERENCE", "SAME_CAPTURE", "DIFFERENT_CAPTURE"][index], sourceHash: file.sourceHash, decode: file.decode, alignedHash: file.alignedHash, tensor: file.tensor, embedding: { dimension: file.embedding.length, finite: file.embedding.every(Number.isFinite), preNormalizationNorm: norm(file.rawEmbedding), postNormalizationNorm: norm(file.embedding) } })), aliasing: { sourceDistinct: new Set(files.map((file) => file.sourceHash)).size === 3, decodedDistinct: new Set(files.map((file) => file.decode.hash)).size === 3, alignedDistinct: new Set(files.map((file) => file.alignedHash)).size === 3 }, controls: { sameImageCosine: cosineSimilarity(reference.embedding, reference.embedding, 128), sameIdentityCosine: cosineSimilarity(reference.embedding, same.embedding, 128), differentIdentityCosine: cosineSimilarity(reference.embedding, different.embedding, 128), normalizedDotVsCosineDifference: Math.abs(dot - cosineSimilarity(reference.embedding, different.embedding, 128)) }, matrix }, null, 2));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
