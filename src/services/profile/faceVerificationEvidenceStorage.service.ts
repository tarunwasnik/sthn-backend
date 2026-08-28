import cloudinary from "../../config/cloudinary";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";

export interface FaceEvidenceStoredAsset { publicId: string; bytes: number; format: string; mimeType: string; }
export interface FaceVerificationEvidenceStorageReadResult { bytes: Buffer; contentType: string | null; byteLength: number; }
export type FaceVerificationEvidenceStorageReader = (input: { publicId: string; format: string; maximumBytes: number; timeoutMs: number }) => Promise<FaceVerificationEvidenceStorageReadResult>;

type FetchResponse = Pick<Response, "ok" | "status" | "headers" | "body">;
type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<FetchResponse>;
export interface FaceVerificationEvidenceStorageReadDependencies {
  fetchImplementation?: FetchImplementation;
  privateDownloadUrlFactory?: (publicId: string, format: string) => string;
}

export const storeFaceVerificationEvidence = (input: { buffer: Buffer; publicId: string }): Promise<FaceEvidenceStoredAsset> => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream({ public_id: input.publicId, resource_type: "image", type: "authenticated", overwrite: false, unique_filename: false, headers: "X-Robots-Tag: noindex" }, (error, result) => {
    if (error || !result) return reject(error ?? new Error("Face evidence upload failed."));
    resolve({ publicId: result.public_id, bytes: result.bytes, format: result.format, mimeType: `image/${result.format}` });
  });
  stream.end(input.buffer);
});

export type FaceVerificationEvidenceDeleteOutcome = "DELETED" | "ALREADY_MISSING" | "RETRYABLE_FAILURE" | "PROVIDER_FAILURE";

export const deleteFaceVerificationEvidence = async (publicId: string): Promise<FaceVerificationEvidenceDeleteOutcome> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "authenticated", invalidate: true });
    if (result?.result === "ok") return "DELETED";
    if (result?.result === "not found") return "ALREADY_MISSING";
    return "PROVIDER_FAILURE";
  } catch (error) {
    const status = typeof error === "object" && error !== null && "http_code" in error ? Number((error as { http_code?: unknown }).http_code) : 0;
    return status === 0 || status >= 500 ? "RETRYABLE_FAILURE" : "PROVIDER_FAILURE";
  }
};

const contentLength = (value: string | null) => {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const readResponseBytes = async (response: FetchResponse, maximumBytes: number): Promise<Buffer> => {
  const declaredLength = contentLength(response.headers.get("content-length"));
  if (declaredLength !== null && declaredLength > maximumBytes) {
    throw new ProfileVerificationInferenceError("Face evidence exceeds the permitted size", "EVIDENCE_TOO_LARGE", 409);
  }
  if (!response.body) throw new ProfileVerificationInferenceError("Face evidence could not be retrieved", "EVIDENCE_RETRIEVAL_FAILED", 503, true);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      total += chunk.length;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new ProfileVerificationInferenceError("Face evidence exceeds the permitted size", "EVIDENCE_TOO_LARGE", 409);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
};

/** Cloudinary URLs are deliberately scoped to this storage implementation. */
export const createFaceVerificationEvidenceStorageReader = (dependencies: FaceVerificationEvidenceStorageReadDependencies = {}): FaceVerificationEvidenceStorageReader => async (input) => {
  const privateDownloadUrl = (dependencies.privateDownloadUrlFactory ?? ((publicId: string, format: string) => cloudinary.utils.private_download_url(publicId, format, {
    resource_type: "image", type: "authenticated", expires_at: Math.floor(Date.now() / 1000) + 60,
  })))(input.publicId, input.format);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await (dependencies.fetchImplementation ?? (fetch as FetchImplementation))(privateDownloadUrl, { method: "GET", signal: controller.signal, headers: { accept: "image/jpeg, image/png, image/webp" } });
    if (response.status === 404) throw new ProfileVerificationInferenceError("Face evidence is not available", "EVIDENCE_NOT_AVAILABLE", 409);
    if (!response.ok) throw new ProfileVerificationInferenceError("Face evidence retrieval failed", "EVIDENCE_RETRIEVAL_FAILED", 503, response.status >= 500);
    const bytes = await readResponseBytes(response, input.maximumBytes);
    return { bytes, contentType: response.headers.get("content-type"), byteLength: bytes.length };
  } catch (error) {
    if (error instanceof ProfileVerificationInferenceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProfileVerificationInferenceError("Face evidence retrieval timed out", "EVIDENCE_RETRIEVAL_TIMEOUT", 503, true);
    }
    throw new ProfileVerificationInferenceError("Face evidence retrieval failed", "EVIDENCE_RETRIEVAL_FAILED", 503, true);
  } finally {
    clearTimeout(timer);
  }
};

export const readFaceVerificationEvidenceAsset = createFaceVerificationEvidenceStorageReader();

// Deliberately service-only in Stage 3D. A future Admin detail controller must
// authorize the request/profile relationship before returning this short-lived URL.
export const generateFaceVerificationEvidenceAdminDownloadUrl = (publicId: string, format: string) => cloudinary.utils.private_download_url(publicId, format, {
  resource_type: "image",
  type: "authenticated",
  expires_at: Math.floor(Date.now() / 1000) + 60,
});
