import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { FaceVerificationChallenge } from "../../models/faceVerificationSession.model";
import { readProfileVerificationEvidenceBytes } from "./faceVerificationEvidenceRead.service";
import { ProfileVerificationInferenceAdapter, technicalInferenceFailure } from "./profileVerificationInferenceAdapter";
import { ProfileVerificationInferenceFindings } from "./profileVerificationInference.types";
import { YUNET_ARTIFACT, YUNET_CAPTURE_USABILITY_SCORE_THRESHOLD, YUNET_LIMITS, YUNET_PREPROCESSING_VERSION } from "./profileVerificationYuNet.constants";
import { detectYuNetFaces } from "./profileVerificationYuNetRunner";
import { YuNetDetection } from "./profileVerificationYuNet.types";

const MIN_FACE_AREA_RATIO = 0.03;
const MAX_FACE_AREA_RATIO = 0.65;
const MAX_CENTER_OFFSET_RATIO = 0.35;

type EvidenceReader = typeof readProfileVerificationEvidenceBytes;
type Detector = (encoded: Buffer) => Promise<YuNetDetection>;

const classifyDetection = (input: { challengeIndex: number; challenge: FaceVerificationChallenge; detection: YuNetDetection }) => {
  const { faces, width, height } = input.detection;
  if (faces.length === 0) return { ...input, faceCount: "ZERO" as const, usability: "UNUSABLE" as const, reasonCodes: ["DETECTION_UNCERTAIN" as const] };
  if (faces.length > 1) return { ...input, faceCount: "MULTIPLE" as const, usability: "UNUSABLE" as const, reasonCodes: ["POOR_ALIGNMENT" as const] };
  const face = faces[0];
  const areaRatio = (face.width * face.height) / (width * height);
  const centerOffset = Math.hypot(face.x + face.width / 2 - width / 2, face.y + face.height / 2 - height / 2) / Math.hypot(width / 2, height / 2);
  if (areaRatio < MIN_FACE_AREA_RATIO) return { ...input, faceCount: "ONE" as const, usability: "UNUSABLE" as const, reasonCodes: ["FACE_TOO_SMALL" as const] };
  if (areaRatio > MAX_FACE_AREA_RATIO) return { ...input, faceCount: "ONE" as const, usability: "UNUSABLE" as const, reasonCodes: ["FACE_TOO_LARGE" as const] };
  if (centerOffset > MAX_CENTER_OFFSET_RATIO || face.x <= 0 || face.y <= 0 || face.x + face.width >= width || face.y + face.height >= height) return { ...input, faceCount: "ONE" as const, usability: "UNUSABLE" as const, reasonCodes: ["POOR_ALIGNMENT" as const] };
  if (face.confidence < YUNET_CAPTURE_USABILITY_SCORE_THRESHOLD) return { ...input, faceCount: "ONE" as const, usability: "UNCERTAIN" as const, reasonCodes: ["DETECTION_UNCERTAIN" as const] };
  return { ...input, faceCount: "ONE" as const, usability: "USABLE" as const, reasonCodes: [] };
};

/** Pure, bounded detector-only mapping. It deliberately makes no identity, cross-capture, avatar, or liveness claim. */
export const classifyYuNetDetections = (captures: ReadonlyArray<{ challengeIndex: number; challenge: FaceVerificationChallenge; detection: YuNetDetection }>): ProfileVerificationInferenceFindings => {
  if (captures.length !== 5) throw technicalInferenceFailure("YuNet requires exactly five authoritative captures");
  const findings = captures.map(classifyDetection).sort((left, right) => left.challengeIndex - right.challengeIndex);
  if (findings.some((finding, index) => finding.challengeIndex !== index)) throw technicalInferenceFailure("YuNet capture ordering is invalid");
  return {
    captures: findings.map(({ challengeIndex, challenge, faceCount, usability, reasonCodes }) => ({ challengeIndex, challenge, faceCount, usability, reasonCodes })),
    crossCapture: { status: "NOT_RUN", usableCaptureCount: findings.filter((finding) => finding.usability === "USABLE").length, outlierCaptureCount: 0 },
    avatar: { status: "NOT_RUN" }, antiSpoof: { status: "NOT_RUN" },
  };
};

/**
 * Explicit adapter only: no worker, route, or job registration invokes it in Stage 3F3.
 * It reads protected bytes sequentially and retains only the bounded 3F1 findings.
 */
export const createYuNetProfileVerificationAdapter = (dependencies: { evidenceReader?: EvidenceReader; detector?: Detector } = {}): ProfileVerificationInferenceAdapter => {
  const evidenceReader = dependencies.evidenceReader ?? readProfileVerificationEvidenceBytes;
  const detector = dependencies.detector ?? detectYuNetFaces;
  return {
    pipelineManifest: {
      kind: "MODEL_RUNTIME_DETECTOR_ONLY", pipelineVersion: "STHN_YUNET_DETECTOR_V2", runtimeIdentifier: "onnxruntime-node", runtimeVersion: "1.27.0",
      preprocessingVersion: YUNET_PREPROCESSING_VERSION,
      detector: { identifier: YUNET_ARTIFACT.identifier, version: YUNET_ARTIFACT.version, artifactSha256: YUNET_ARTIFACT.sha256 },
    },
    async infer(input) {
      const source = await evidenceReader({ verificationRequestId: input.verificationRequestId });
      if (source.noOp) throw new ProfileVerificationInferenceError("Verification submission is no longer actionable", source.noOp, 409);
      if (!source.evidence || source.evidence.length !== 5) throw technicalInferenceFailure("YuNet evidence is unavailable");
      const detected = [] as Array<{ challengeIndex: number; challenge: FaceVerificationChallenge; detection: YuNetDetection }>;
      for (const evidence of source.evidence) {
        const expected = input.captures[evidence.challengeIndex];
        if (!expected || expected.challenge !== evidence.challenge) throw technicalInferenceFailure("YuNet evidence binding is inconsistent");
        detected.push({ challengeIndex: evidence.challengeIndex, challenge: evidence.challenge, detection: await detector(evidence.bytes) });
      }
      return classifyYuNetDetections(detected);
    },
  };
};
