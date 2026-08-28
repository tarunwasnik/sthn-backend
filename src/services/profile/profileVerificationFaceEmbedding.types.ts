import { YuNetFaceLandmarks } from "./profileVerificationYuNet.types";

export const FACE_EMBEDDING_LANDMARK_ORDER = [
  "rightEye",
  "leftEye",
  "noseTip",
  "rightMouthCorner",
  "leftMouthCorner",
] as const;

export type FaceEmbeddingLandmarks = YuNetFaceLandmarks;

export interface FaceEmbeddingPreprocessingSpecification {
  /** A future approved model supplies this model-specific target geometry. */
  readonly identifier: string;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly targetLandmarks: FaceEmbeddingLandmarks;
}

/** Runtime-only RGB pixels. This type must never be persisted or serialized into a DTO. */
export interface AlignedFaceRuntimeInput {
  readonly pixels: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: 3;
  readonly preprocessingIdentifier: string;
}

export interface FaceEmbeddingModelSpecification {
  readonly identifier: string;
  readonly expectedDimensions: number;
  readonly preprocessing: FaceEmbeddingPreprocessingSpecification;
}

export interface ProfileVerificationFaceEmbeddingAdapter {
  readonly specification: FaceEmbeddingModelSpecification;
  infer(alignedFace: Readonly<AlignedFaceRuntimeInput>): Promise<readonly number[]>;
}
