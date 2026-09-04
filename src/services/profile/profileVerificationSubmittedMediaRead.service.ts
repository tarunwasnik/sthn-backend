import cloudinary, { extractPublicId } from "../../config/cloudinary";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { ProfileVerificationSubmittedMediaItem } from "../../models/profileVerificationRequest.model";
import { FACE_VERIFICATION_EVIDENCE_MAX_BYTES, FACE_VERIFICATION_EVIDENCE_READ_TIMEOUT_MS } from "./faceVerification.constants";
import { fingerprintProfileMediaReference } from "./profileVerificationSubmittedMedia.service";

const trusted = (reference: string) => {
  try { const url = new URL(reference); return url.protocol === "https:" && (url.hostname === "res.cloudinary.com" || url.hostname.endsWith(".res.cloudinary.com")); }
  catch { return false; }
};

/** Reads only the immutable request-bound media reference; it never queries UserProfile. */
export const readProfileVerificationSubmittedMedia = async (item: ProfileVerificationSubmittedMediaItem): Promise<Buffer> => {
  if (fingerprintProfileMediaReference(item.sourceReference) !== item.fingerprint || !trusted(item.sourceReference)) throw new ProfileVerificationInferenceError("Submitted profile media authority is invalid", "STALE_SUBMISSION", 409);
  const publicId = extractPublicId(item.sourceReference);
  if (!publicId) throw new ProfileVerificationInferenceError("Submitted profile media authority is invalid", "STALE_SUBMISSION", 409);
  const url = cloudinary.url(publicId, { secure: true, resource_type: "image", transformation: [{ width: 2048, height: 2048, crop: "limit", fetch_format: "jpg", quality: "auto" }] });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), FACE_VERIFICATION_EVIDENCE_READ_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "GET", redirect: "error", signal: controller.signal, headers: { accept: "image/jpeg, image/png, image/webp" } });
    if (!response.ok || !response.body) throw new Error("media retrieval failed");
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > FACE_VERIFICATION_EVIDENCE_MAX_BYTES) throw new Error("media too large");
    const reader = response.body.getReader(); const chunks: Buffer[] = []; let total = 0;
    try { while (true) { const next = await reader.read(); if (next.done) break; const chunk = Buffer.from(next.value); total += chunk.length; if (total > FACE_VERIFICATION_EVIDENCE_MAX_BYTES) throw new Error("media too large"); chunks.push(chunk); } }
    finally { reader.releaseLock(); }
    return Buffer.concat(chunks, total);
  } catch (error) {
    if (error instanceof ProfileVerificationInferenceError) throw error;
    throw new ProfileVerificationInferenceError("Submitted profile media retrieval failed", "EVIDENCE_RETRIEVAL_FAILED", 503, true);
  } finally { clearTimeout(timeout); }
};
