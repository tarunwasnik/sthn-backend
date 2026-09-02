import { readFile } from "node:fs/promises";
import { CalibrationSample, CalibrationSampleResult } from "./sfaceCalibration.types";
import { detectYuNetFaces } from "../services/profile/profileVerificationYuNetRunner";
import { classifyYuNetDetections } from "../services/profile/profileVerificationYuNetAdapter";
import { validateBiometricReferenceDetection } from "../services/profile/profileVerificationReferenceAvatarValidation.service";
import { alignFaceEvidence, cosineSimilarity, normalizeFaceEmbeddingL2 } from "../services/profile/profileVerificationFaceEmbedding.service";
import { getProductionFaceEmbeddingAdapter, SFACE_FACE_EMBEDDING_SPECIFICATION } from "../services/profile/profileVerificationFaceEmbeddingAdapter";
import { medianSFaceSimilarity } from "../services/profile/profileVerificationSFaceShadowAnalysis.service";

/** Development-only explicit-file evaluator. It imports no persistence, worker, request, or decision authority. */
export const evaluateCalibrationSample = async (sample: CalibrationSample): Promise<CalibrationSampleResult> => {
  try {
    const [referenceBytes, ...captureBytes] = await Promise.all([readFile(sample.reference), ...sample.captures.map((file) => readFile(file))]);
    const roles = ["CAPTURE_0", "CAPTURE_1", "CAPTURE_2", "CAPTURE_3", "CAPTURE_4"] as const;
    const captureDetections = await Promise.all(captureBytes.map((bytes, challengeIndex) => detectYuNetFaces(bytes, roles[challengeIndex], false)));
    const referenceDetection = await detectYuNetFaces(referenceBytes, "REFERENCE", false);
    if (!validateBiometricReferenceDetection(referenceDetection).valid) return { sampleId: sample.sampleId, expectedLabel: sample.expectedLabel, scenario: sample.scenario ?? null, status: "REFERENCE_UNUSABLE", usableCaptureCount: 0, captureSimilarities: [], medianSimilarity: null };
    const findings = classifyYuNetDetections(captureDetections.map((detection, challengeIndex) => ({ challengeIndex, challenge: "NEUTRAL" as const, detection })));
    const embedder = getProductionFaceEmbeddingAdapter(); const spec = SFACE_FACE_EMBEDDING_SPECIFICATION;
    const reference = normalizeFaceEmbeddingL2(await embedder.infer(await alignFaceEvidence({ bytes: referenceBytes, landmarks: referenceDetection.faces[0].landmarks, preprocessing: spec.preprocessing })), 128);
    const similarities: number[] = [];
    for (let index = 0; index < captureBytes.length; index += 1) if (findings.captures[index]?.usability === "USABLE" && captureDetections[index].faces.length === 1) {
      try { const embedding = await embedder.infer(await alignFaceEvidence({ bytes: captureBytes[index], landmarks: captureDetections[index].faces[0].landmarks, preprocessing: spec.preprocessing })); similarities.push(cosineSimilarity(reference, embedding, 128)); } catch { /* production-equivalent unusable capture */ }
    }
    return { sampleId: sample.sampleId, expectedLabel: sample.expectedLabel, scenario: sample.scenario ?? null, status: similarities.length >= 3 ? "COMPLETED" : "INSUFFICIENT_USABLE_CAPTURES", usableCaptureCount: similarities.length, captureSimilarities: similarities, medianSimilarity: similarities.length >= 3 ? medianSFaceSimilarity(similarities) : null };
  } catch { return { sampleId: sample.sampleId, expectedLabel: sample.expectedLabel, scenario: sample.scenario ?? null, status: "INPUT_INVALID", usableCaptureCount: 0, captureSimilarities: [], medianSimilarity: null }; }
};
