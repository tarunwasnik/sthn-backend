import { AppError } from "../../utils/AppError";
import { readBoundProfileVerificationAvatar } from "./profileVerificationAvatarRead.service";
import { detectYuNetFaces } from "./profileVerificationYuNetRunner";
import { YuNetDetection } from "./profileVerificationYuNet.types";

export type BiometricReferenceAvatarValidation = { valid: true } | { valid: false; reason: "NO_FACE" | "MULTIPLE_FACES" | "INVALID_GEOMETRY" | "INVALID_LANDMARKS" };
type Reader = typeof readBoundProfileVerificationAvatar;
type Detector = (bytes: Buffer) => Promise<YuNetDetection>;
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
  if (!Number.isFinite(areaRatio) || areaRatio < 0.03 || areaRatio > 0.65) return { valid: false, reason: "INVALID_GEOMETRY" };
  return validLandmarks(face) ? { valid: true } : { valid: false, reason: "INVALID_LANDMARKS" };
};

/** Runtime-only reference gate: it retains no image, score, geometry, or detector output. */
export const validateBiometricReferenceAvatar = async (input: { profileId: string; userId: string; avatarFingerprint: string }, dependencies: { reader?: Reader; detector?: Detector } = {}): Promise<BiometricReferenceAvatarValidation> => {
  const selected = { ...testDependencies, ...dependencies };
  const detection = await (selected.detector ?? detectYuNetFaces)(await (selected.reader ?? readBoundProfileVerificationAvatar)(input));
  return validateBiometricReferenceDetection(detection);
};

export const requireBiometricReferenceAvatar = async (input: { profileId: string; userId: string; avatarFingerprint: string }) => {
  const result = await validateBiometricReferenceAvatar(input);
  if (result.valid) return;
  throw new AppError(result.reason === "MULTIPLE_FACES" ? "This profile photo cannot be used for face verification. Choose a clear photo containing only you." : "This profile photo cannot be used for face verification. Choose a clear photo showing only your face.", 409);
};
