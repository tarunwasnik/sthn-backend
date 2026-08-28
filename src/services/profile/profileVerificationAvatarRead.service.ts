import { UserProfile } from "../../models/userProfile.model";
import cloudinary, { extractPublicId } from "../../config/cloudinary";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { fingerprintAvatarReference } from "./faceVerificationSession.service";
import { FACE_VERIFICATION_EVIDENCE_MAX_BYTES, FACE_VERIFICATION_EVIDENCE_READ_TIMEOUT_MS } from "./faceVerification.constants";

const trustedAvatarUrl = (value: string) => {
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "res.cloudinary.com" || url.hostname.endsWith(".res.cloudinary.com")); }
  catch { return false; }
};

const readBytes = async (response: Response) => {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > FACE_VERIFICATION_EVIDENCE_MAX_BYTES) throw new ProfileVerificationInferenceError("Avatar exceeds the permitted size", "EVIDENCE_TOO_LARGE", 409);
  if (!response.body) throw new ProfileVerificationInferenceError("Avatar retrieval failed", "EVIDENCE_RETRIEVAL_FAILED", 503, true);
  const reader = response.body.getReader(); const chunks: Buffer[] = []; let total = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; const chunk = Buffer.from(part.value); total += chunk.length; if (total > FACE_VERIFICATION_EVIDENCE_MAX_BYTES) { await reader.cancel(); throw new ProfileVerificationInferenceError("Avatar exceeds the permitted size", "EVIDENCE_TOO_LARGE", 409); } chunks.push(chunk); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
};

/** Reads only the current Cloudinary avatar proven to belong to the exact session submission. */
export const readAuthoritativeProfileVerificationAvatar = async (input: { profileId: string; userId: string; profileSubmissionVersion: number; avatarFingerprint: string }) => {
  const profile = await UserProfile.findById(input.profileId).exec();
  if (!profile || String(profile.userId) !== input.userId || profile.verificationSubmissionVersion !== input.profileSubmissionVersion
    || !profile.avatar || fingerprintAvatarReference(profile.avatar) !== input.avatarFingerprint) {
    throw new ProfileVerificationInferenceError("Avatar submission authority is stale", "STALE_SUBMISSION", 409);
  }
  if (!trustedAvatarUrl(profile.avatar)) throw new ProfileVerificationInferenceError("Avatar media authority is invalid", "EVIDENCE_NOT_AVAILABLE", 409);
  const publicId = extractPublicId(profile.avatar);
  if (!publicId) throw new ProfileVerificationInferenceError("Avatar media authority is invalid", "EVIDENCE_NOT_AVAILABLE", 409);
  // The source remains the exact authoritative avatar; this only bounds its runtime representation.
  const url = cloudinary.url(publicId, {
    secure: true,
    resource_type: "image",
    transformation: [{ width: 2048, height: 2048, crop: "limit", fetch_format: "jpg", quality: "auto" }],
  });
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), FACE_VERIFICATION_EVIDENCE_READ_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "GET", redirect: "error", signal: controller.signal, headers: { accept: "image/jpeg, image/png, image/webp" } });
    if (!response.ok) throw new ProfileVerificationInferenceError("Avatar retrieval failed", "EVIDENCE_RETRIEVAL_FAILED", 503, response.status >= 500);
    return await readBytes(response);
  } catch (error) {
    if (error instanceof ProfileVerificationInferenceError) throw error;
    throw new ProfileVerificationInferenceError("Avatar retrieval failed", "EVIDENCE_RETRIEVAL_FAILED", 503, true);
  } finally { clearTimeout(timer); }
};
