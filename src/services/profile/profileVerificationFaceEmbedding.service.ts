import sharp from "sharp";

import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import {
  AlignedFaceRuntimeInput,
  FACE_EMBEDDING_LANDMARK_ORDER,
  FaceEmbeddingLandmarks,
  FaceEmbeddingPreprocessingSpecification,
} from "./profileVerificationFaceEmbedding.types";

export interface FaceSimilarityTransform {
  readonly a: number;
  readonly b: number;
  readonly translateX: number;
  readonly translateY: number;
}

const maximumEmbeddingDimensions = 4096;
const invalidInput = (message: string) => new ProfileVerificationInferenceError(message, "INVALID_INPUT", 400);
const points = (landmarks: FaceEmbeddingLandmarks) => FACE_EMBEDDING_LANDMARK_ORDER.map((key) => landmarks[key]);
const isPoint = (value: unknown): value is { x: number; y: number } => (
  typeof value === "object" && value !== null
  && typeof (value as { x?: unknown }).x === "number" && Number.isFinite((value as { x: number }).x)
  && typeof (value as { y?: unknown }).y === "number" && Number.isFinite((value as { y: number }).y)
);

/** Validates the fixed YuNet five-point semantic shape without persisting geometry. */
export const validateFaceEmbeddingLandmarks = (landmarks: unknown): FaceEmbeddingLandmarks => {
  if (!landmarks || typeof landmarks !== "object") throw invalidInput("Five face landmarks are required");
  const candidate = landmarks as Partial<FaceEmbeddingLandmarks>;
  if (!FACE_EMBEDDING_LANDMARK_ORDER.every((key) => isPoint(candidate[key]))) throw invalidInput("Five face landmarks are invalid");
  const copied: FaceEmbeddingLandmarks = {
    rightEye: { ...candidate.rightEye! },
    leftEye: { ...candidate.leftEye! },
    noseTip: { ...candidate.noseTip! },
    rightMouthCorner: { ...candidate.rightMouthCorner! },
    leftMouthCorner: { ...candidate.leftMouthCorner! },
  };
  const unique = new Set(points(copied).map((point) => `${point.x}:${point.y}`));
  if (unique.size < 3) throw invalidInput("Face landmarks are degenerate");
  return copied;
};

const validatePreprocessing = (specification: FaceEmbeddingPreprocessingSpecification) => {
  if (!specification || typeof specification.identifier !== "string" || specification.identifier.trim().length === 0 || specification.identifier.length > 120
    || !Number.isInteger(specification.outputWidth) || specification.outputWidth < 1 || specification.outputWidth > 2048
    || !Number.isInteger(specification.outputHeight) || specification.outputHeight < 1 || specification.outputHeight > 2048) throw invalidInput("Face embedding preprocessing specification is invalid");
  return { ...specification, identifier: specification.identifier.trim(), targetLandmarks: validateFaceEmbeddingLandmarks(specification.targetLandmarks) };
};

/** Least-squares similarity transform mapping source landmarks into a supplied target template. */
export const calculateFaceSimilarityTransform = (sourceInput: unknown, targetInput: unknown): FaceSimilarityTransform => {
  const source = points(validateFaceEmbeddingLandmarks(sourceInput));
  const target = points(validateFaceEmbeddingLandmarks(targetInput));
  const sourceCenter = source.reduce((total, point) => ({ x: total.x + point.x / source.length, y: total.y + point.y / source.length }), { x: 0, y: 0 });
  const targetCenter = target.reduce((total, point) => ({ x: total.x + point.x / target.length, y: total.y + point.y / target.length }), { x: 0, y: 0 });
  let denominator = 0;
  let scaleRotation = 0;
  let rotation = 0;
  for (let index = 0; index < source.length; index += 1) {
    const sx = source[index].x - sourceCenter.x;
    const sy = source[index].y - sourceCenter.y;
    const tx = target[index].x - targetCenter.x;
    const ty = target[index].y - targetCenter.y;
    denominator += sx * sx + sy * sy;
    scaleRotation += sx * tx + sy * ty;
    rotation += sx * ty - sy * tx;
  }
  if (!Number.isFinite(denominator) || denominator <= Number.EPSILON) throw invalidInput("Face landmarks are degenerate");
  const a = scaleRotation / denominator;
  const b = rotation / denominator;
  const transform = {
    a,
    b,
    translateX: targetCenter.x - a * sourceCenter.x + b * sourceCenter.y,
    translateY: targetCenter.y - b * sourceCenter.x - a * sourceCenter.y,
  };
  if (!Object.values(transform).every(Number.isFinite) || Math.hypot(a, b) <= Number.EPSILON) throw invalidInput("Face similarity transform is invalid");
  return transform;
};

const sampleBilinear = (pixels: Buffer, width: number, height: number, x: number, y: number, channel: number) => {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 0;
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(width - 1, left + 1);
  const bottom = Math.min(height - 1, top + 1);
  const horizontal = x - left;
  const vertical = y - top;
  const value = (column: number, row: number) => pixels[(row * width + column) * 3 + channel];
  return (value(left, top) * (1 - horizontal) + value(right, top) * horizontal) * (1 - vertical)
    + (value(left, bottom) * (1 - horizontal) + value(right, bottom) * horizontal) * vertical;
};

/**
 * Decodes protected bytes and emits only an in-memory RGB aligned face. The supplied
 * template is model-specific, so Stage 3F4C provides no production default template.
 */
export const alignFaceEvidence = async (input: {
  readonly bytes: Buffer;
  readonly landmarks: unknown;
  readonly preprocessing: FaceEmbeddingPreprocessingSpecification;
}): Promise<AlignedFaceRuntimeInput> => {
  if (!Buffer.isBuffer(input.bytes) || input.bytes.length === 0) throw invalidInput("Face evidence bytes are required");
  const sourceLandmarks = validateFaceEmbeddingLandmarks(input.landmarks);
  const preprocessing = validatePreprocessing(input.preprocessing);
  const decoded = await sharp(input.bytes, { pages: 1, animated: false, failOn: "warning" }).rotate().removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.channels !== 3 || !decoded.info.width || !decoded.info.height) throw invalidInput("Face evidence image is invalid");
  const transform = calculateFaceSimilarityTransform(sourceLandmarks, preprocessing.targetLandmarks);
  const determinant = transform.a * transform.a + transform.b * transform.b;
  const output = Buffer.alloc(preprocessing.outputWidth * preprocessing.outputHeight * 3);
  for (let y = 0; y < preprocessing.outputHeight; y += 1) {
    for (let x = 0; x < preprocessing.outputWidth; x += 1) {
      const translatedX = x - transform.translateX;
      const translatedY = y - transform.translateY;
      const sourceX = (transform.a * translatedX + transform.b * translatedY) / determinant;
      const sourceY = (-transform.b * translatedX + transform.a * translatedY) / determinant;
      for (let channel = 0; channel < 3; channel += 1) output[(y * preprocessing.outputWidth + x) * 3 + channel] = Math.round(sampleBilinear(decoded.data, decoded.info.width, decoded.info.height, sourceX, sourceY, channel));
    }
  }
  return Object.freeze({ pixels: output, width: preprocessing.outputWidth, height: preprocessing.outputHeight, channels: 3 as const, preprocessingIdentifier: preprocessing.identifier });
};

export const validateEmbeddingVector = (value: unknown, expectedDimensions: number): number[] => {
  if (!Number.isInteger(expectedDimensions) || expectedDimensions < 1 || expectedDimensions > maximumEmbeddingDimensions
    || !Array.isArray(value) || value.length !== expectedDimensions
    || !value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) throw invalidInput("Face embedding output is invalid");
  return [...value];
};

export const normalizeFaceEmbeddingL2 = (value: unknown, expectedDimensions: number): number[] => {
  const embedding = validateEmbeddingVector(value, expectedDimensions);
  const squaredNorm = embedding.reduce((total, entry) => total + entry * entry, 0);
  if (!Number.isFinite(squaredNorm) || squaredNorm <= Number.EPSILON) throw invalidInput("Face embedding norm is invalid");
  const norm = Math.sqrt(squaredNorm);
  return embedding.map((entry) => entry / norm);
};

/** Mathematical runtime primitive only. It sets no identity threshold or decision. */
export const cosineSimilarity = (left: unknown, right: unknown, expectedDimensions: number): number => {
  const normalizedLeft = normalizeFaceEmbeddingL2(left, expectedDimensions);
  const normalizedRight = normalizeFaceEmbeddingL2(right, expectedDimensions);
  const similarity = normalizedLeft.reduce((total, value, index) => total + value * normalizedRight[index], 0);
  if (!Number.isFinite(similarity)) throw invalidInput("Face embedding similarity is invalid");
  return Math.max(-1, Math.min(1, similarity));
};
