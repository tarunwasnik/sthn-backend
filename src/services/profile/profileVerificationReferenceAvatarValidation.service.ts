import { AppError } from "../../utils/AppError";
import { readBoundProfileVerificationAvatar } from "./profileVerificationAvatarRead.service";
import { detectYuNetFaces, YuNetDecisionScoreSummary } from "./profileVerificationYuNetRunner";
import { YuNetDetection } from "./profileVerificationYuNet.types";
import { logger } from "../../utils/logger";
import { YUNET_ARTIFACT, YUNET_LIMITS } from "./profileVerificationYuNet.constants";

export type BiometricReferenceAvatarValidation = { valid: true } | { valid: false; reason: "NO_FACE" | "MULTIPLE_FACES" | "INVALID_GEOMETRY" | "INVALID_LANDMARKS" };
export type ReferenceAvatarPreflightReasonCode = "REFERENCE_AVATAR_NO_FACE" | "REFERENCE_AVATAR_MULTIPLE_FACES" | "REFERENCE_AVATAR_INVALID_GEOMETRY" | "REFERENCE_AVATAR_INVALID_LANDMARKS";
type Reader = typeof readBoundProfileVerificationAvatar;
type Detector = typeof detectYuNetFaces;
const REFERENCE_FACE_AREA = { min: 0.03, max: 0.65 } as const;
let testDependencies: { reader?: Reader; detector?: Detector } | undefined;

/** Test-only dependency seam for lifecycle fixtures; production always uses protected reader and YuNet. */
export const setBiometricReferenceAvatarValidationDependenciesForTests = (dependencies?: { reader?: Reader; detector?: Detector }) => {
  if (process.env.NODE_ENV !== "test") throw new Error("Reference validation test dependencies are unavailable outside tests");
  testDependencies = dependencies;
};

const validLandmarks = (face: YuNetDetection["faces"][number]) => !!face.landmarks && Object.values(face.landmarks).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

/** Shared production reference-face rule used before capture and before SFace alignment. */
export const validateBiometricReferenceDetection = (detection: YuNetDetection): BiometricReferenceAvatarValidation => {
  if (detection.faces.length === 0) return { valid: false, reason: "NO_FACE" };
  if (detection.faces.length !== 1) return { valid: false, reason: "MULTIPLE_FACES" };
  const face = detection.faces[0];
  if (![detection.width, detection.height, face.x, face.y, face.width, face.height].every(Number.isFinite) || detection.width <= 0 || detection.height <= 0 || face.width <= 0 || face.height <= 0) return { valid: false, reason: "INVALID_GEOMETRY" };
  const areaRatio = (face.width * face.height) / (detection.width * detection.height);
  if (!Number.isFinite(areaRatio) || areaRatio < REFERENCE_FACE_AREA.min || areaRatio > REFERENCE_FACE_AREA.max) return { valid: false, reason: "INVALID_GEOMETRY" };
  return validLandmarks(face) ? { valid: true } : { valid: false, reason: "INVALID_LANDMARKS" };
};

const preflightReasonCodes: Record<Exclude<BiometricReferenceAvatarValidation, { valid: true }>['reason'], ReferenceAvatarPreflightReasonCode> = {
  NO_FACE: "REFERENCE_AVATAR_NO_FACE",
  MULTIPLE_FACES: "REFERENCE_AVATAR_MULTIPLE_FACES",
  INVALID_GEOMETRY: "REFERENCE_AVATAR_INVALID_GEOMETRY",
  INVALID_LANDMARKS: "REFERENCE_AVATAR_INVALID_LANDMARKS",
};

export const referenceAvatarPreflightReasonCode = (reason: Exclude<BiometricReferenceAvatarValidation, { valid: true }>['reason']): ReferenceAvatarPreflightReasonCode => preflightReasonCodes[reason];

/** Only bounded operational metadata leaves this runtime-only reference gate. */
export const validateBiometricReferenceAvatar = async (input: { profileId: string; userId: string; avatarFingerprint: string }, dependencies: { reader?: Reader; detector?: Detector } = {}): Promise<BiometricReferenceAvatarValidation> => {
  const selected = { ...testDependencies, ...dependencies };
  let scores: YuNetDecisionScoreSummary | undefined;
  const detection = await (selected.detector ?? detectYuNetFaces)(await (selected.reader ?? readBoundProfileVerificationAvatar)(input), "REFERENCE", true, (summary) => { scores = summary; });
  const result = validateBiometricReferenceDetection(detection);
  if (scores) {
    const revision = process.env.RENDER_GIT_COMMIT;
    try {
      logger.info(JSON.stringify({
        event: "REFERENCE_AVATAR_PREFLIGHT_DIAGNOSTIC",
        detectorModelId: YUNET_ARTIFACT.identifier,
        detectorModelVersion: YUNET_ARTIFACT.version,
        artifactSha256: YUNET_ARTIFACT.sha256,
        confidenceThreshold: YUNET_LIMITS.scoreThreshold,
        nmsThreshold: YUNET_LIMITS.nmsThreshold,
        referenceFaceAreaMin: REFERENCE_FACE_AREA.min,
        referenceFaceAreaMax: REFERENCE_FACE_AREA.max,
        transformedWidth: detection.width,
        transformedHeight: detection.height,
        maxRawConfidence: scores.maxRawConfidence,
        rawFiniteCandidateCount: scores.rawFiniteCandidateCount,
        candidatesAtThreshold: scores.candidatesAtThreshold,
        postNmsFaceCount: detection.faces.length,
        classification: result.valid ? "VALID" : result.reason,
        ...(revision && /^[a-f0-9]{40}$/i.test(revision) ? { deploymentRevision: revision } : {}),
      }));
    } catch { /* Logging must not affect reference validation or public errors. */ }
  }
  return result;
};

export const requireBiometricReferenceAvatar = async (input: { profileId: string; userId: string; avatarFingerprint: string }) => {
  const result = await validateBiometricReferenceAvatar(input);
  if (result.valid) return;
  throw new AppError(
    result.reason === "MULTIPLE_FACES"
      ? "This profile photo cannot be used for face verification. Choose a clear photo containing only you."
      : "This profile photo cannot be used for face verification. Choose a clear photo showing only your face.",
    409,
    referenceAvatarPreflightReasonCode(result.reason),
  );
};
