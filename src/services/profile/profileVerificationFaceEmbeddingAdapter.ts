import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as ort from "onnxruntime-node";

import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { AlignedFaceRuntimeInput, FaceEmbeddingModelSpecification, ProfileVerificationFaceEmbeddingAdapter } from "./profileVerificationFaceEmbedding.types";
import { validateEmbeddingVector } from "./profileVerificationFaceEmbedding.service";

/** Explicitly synthetic test fixture. It is never selected by production inference. */
export const TEST_ONLY_FACE_EMBEDDING_SPECIFICATION: FaceEmbeddingModelSpecification = Object.freeze({
  identifier: "TEST_ONLY_SYNTHETIC_FACE_EMBEDDING_V1",
  expectedDimensions: 4,
  preprocessing: {
    identifier: "TEST_ONLY_SIMILARITY_RGB_8X8_V1",
    outputWidth: 8,
    outputHeight: 8,
    targetLandmarks: {
      rightEye: { x: 2, y: 2 }, leftEye: { x: 5, y: 2 }, noseTip: { x: 3.5, y: 3.5 },
      rightMouthCorner: { x: 2.5, y: 5.5 }, leftMouthCorner: { x: 4.5, y: 5.5 },
    },
  },
});

export const createDeterministicTestFaceEmbeddingAdapter = (): ProfileVerificationFaceEmbeddingAdapter => ({
  specification: TEST_ONLY_FACE_EMBEDDING_SPECIFICATION,
  async infer(alignedFace: Readonly<AlignedFaceRuntimeInput>) {
    if (alignedFace.width !== 8 || alignedFace.height !== 8 || alignedFace.channels !== 3 || alignedFace.preprocessingIdentifier !== TEST_ONLY_FACE_EMBEDDING_SPECIFICATION.preprocessing.identifier) {
      throw new ProfileVerificationInferenceError("Test face embedding input is invalid", "INVALID_INPUT", 400);
    }
    const sums = [0, 0, 0];
    for (let index = 0; index < alignedFace.pixels.length; index += 3) { sums[0] += alignedFace.pixels[index]; sums[1] += alignedFace.pixels[index + 1]; sums[2] += alignedFace.pixels[index + 2]; }
    return validateEmbeddingVector([sums[0], sums[1], sums[2], alignedFace.pixels.length], TEST_ONLY_FACE_EMBEDDING_SPECIFICATION.expectedDimensions);
  },
});

export const SFACE_FACE_EMBEDDING_SPECIFICATION: FaceEmbeddingModelSpecification = Object.freeze({
  identifier: "OPENCV_ZOO_SFACE",
  expectedDimensions: 128,
  preprocessing: {
    identifier: "OPENCV_ZOO_SFACE_RGB_0_255_NCHW_112X112_V1",
    outputWidth: 112,
    outputHeight: 112,
    targetLandmarks: {
      rightEye: { x: 38.2946, y: 51.6963 }, leftEye: { x: 73.5318, y: 51.5014 }, noseTip: { x: 56.0252, y: 71.7366 },
      rightMouthCorner: { x: 41.5493, y: 92.3655 }, leftMouthCorner: { x: 70.7299, y: 92.2041 },
    },
  },
});

export const SFACE_ARTIFACT = Object.freeze({
  filename: "face_recognition_sface_2021dec.onnx",
  relativePath: "models/face_recognition_sface_2021dec.onnx",
  bytes: 38696353,
  sha256: "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
  identifier: "OPENCV_ZOO_SFACE",
  version: "face_recognition_sface_2021dec",
});

let sfaceSessionPromise: Promise<ort.InferenceSession> | null = null;

const technicalFailure = (message: string) => new ProfileVerificationInferenceError(message, "TECHNICAL_FAILURE", 503, true);

const loadSFaceSession = async () => {
  if (sfaceSessionPromise) return sfaceSessionPromise;
  sfaceSessionPromise = (async () => {
    const configuredPath = process.env.STHN_SFACE_MODEL_PATH?.trim();
    const artifactPath = configuredPath || path.resolve(process.cwd(), SFACE_ARTIFACT.relativePath);
    const bytes = await fs.readFile(artifactPath);
    if (bytes.length !== SFACE_ARTIFACT.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== SFACE_ARTIFACT.sha256) {
      throw technicalFailure("SFace model artifact integrity validation failed");
    }
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ["cpu"] });
    const input = session.inputMetadata[0];
    const output = session.outputMetadata[0];
    if (session.inputNames.length !== 1 || session.inputNames[0] !== "data" || !input?.isTensor || input.type !== "float32" || input.shape.join(",") !== "1,3,112,112"
      || session.outputNames.length !== 1 || session.outputNames[0] !== "fc1" || !output?.isTensor || output.type !== "float32" || output.shape.join(",") !== "1,128") {
      throw technicalFailure("SFace model tensor contract is invalid");
    }
    return session;
  })();
  try { return await sfaceSessionPromise; } catch (error) { sfaceSessionPromise = null; throw error; }
};

/** Test-only cache reset; production keeps a bounded reusable ONNX session. */
export const resetSFaceRunnerForTests = () => { sfaceSessionPromise = null; };

/** Matches OpenCV FaceRecognizerSF::feature: aligned RGB pixels become NCHW float32 RGB, scale 1, zero mean. */
export const createSFaceInputTensor = (alignedFace: Readonly<AlignedFaceRuntimeInput>) => {
  if (alignedFace.width !== 112 || alignedFace.height !== 112 || alignedFace.channels !== 3
    || alignedFace.preprocessingIdentifier !== SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing.identifier
    || alignedFace.pixels.length !== 112 * 112 * 3) throw new ProfileVerificationInferenceError("SFace embedding input is invalid", "INVALID_INPUT", 400);
  const plane = 112 * 112;
  const tensor = new Float32Array(plane * 3);
  for (let pixel = 0; pixel < plane; pixel += 1) {
    tensor[pixel] = alignedFace.pixels[pixel * 3];
    tensor[plane + pixel] = alignedFace.pixels[pixel * 3 + 1];
    tensor[plane * 2 + pixel] = alignedFace.pixels[pixel * 3 + 2];
  }
  return tensor;
};

/** Production SFace adapter. RGB aligned pixels use the OpenCV Zoo NCHW, zero-mean, unit-scale input contract in memory only. */
export const getProductionFaceEmbeddingAdapter = (): ProfileVerificationFaceEmbeddingAdapter => ({
  specification: SFACE_FACE_EMBEDDING_SPECIFICATION,
  async infer(alignedFace: Readonly<AlignedFaceRuntimeInput>) {
    try {
      const tensor = createSFaceInputTensor(alignedFace);
      const output = await (await loadSFaceSession()).run({ data: new ort.Tensor("float32", tensor, [1, 3, 112, 112]) });
      const feature = output.fc1?.data;
      return validateEmbeddingVector(Array.from(feature as Float32Array), SFACE_FACE_EMBEDDING_SPECIFICATION.expectedDimensions);
    } catch (error) {
      if (error instanceof ProfileVerificationInferenceError) throw error;
      throw technicalFailure("SFace embedding inference could not be completed");
    }
  },
});
