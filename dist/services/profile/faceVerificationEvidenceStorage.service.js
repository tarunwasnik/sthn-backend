"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFaceVerificationEvidenceAdminDownloadUrl = exports.readFaceVerificationEvidenceAsset = exports.createFaceVerificationEvidenceStorageReader = exports.deleteFaceVerificationEvidence = exports.storeFaceVerificationEvidence = void 0;
const cloudinary_1 = __importDefault(require("../../config/cloudinary"));
const ProfileVerificationInferenceError_1 = require("../../errors/profile/ProfileVerificationInferenceError");
const storeFaceVerificationEvidence = (input) => new Promise((resolve, reject) => {
    const stream = cloudinary_1.default.uploader.upload_stream({ public_id: input.publicId, resource_type: "image", type: "authenticated", overwrite: false, unique_filename: false, headers: "X-Robots-Tag: noindex" }, (error, result) => {
        if (error || !result)
            return reject(error ?? new Error("Face evidence upload failed."));
        resolve({ publicId: result.public_id, bytes: result.bytes, format: result.format, mimeType: `image/${result.format}` });
    });
    stream.end(input.buffer);
});
exports.storeFaceVerificationEvidence = storeFaceVerificationEvidence;
const deleteFaceVerificationEvidence = async (publicId) => {
    try {
        const result = await cloudinary_1.default.uploader.destroy(publicId, { resource_type: "image", type: "authenticated", invalidate: true });
        return result?.result === "not found" ? "ALREADY_MISSING" : "DELETED";
    }
    catch (error) {
        const status = typeof error === "object" && error !== null && "http_code" in error ? Number(error.http_code) : 0;
        return status === 0 || status >= 500 ? "RETRYABLE_FAILURE" : "PROVIDER_FAILURE";
    }
};
exports.deleteFaceVerificationEvidence = deleteFaceVerificationEvidence;
const contentLength = (value) => {
    if (!value || !/^\d+$/.test(value.trim()))
        return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
};
const readResponseBytes = async (response, maximumBytes) => {
    const declaredLength = contentLength(response.headers.get("content-length"));
    if (declaredLength !== null && declaredLength > maximumBytes) {
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence exceeds the permitted size", "EVIDENCE_TOO_LARGE", 409);
    }
    if (!response.body)
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence could not be retrieved", "EVIDENCE_RETRIEVAL_FAILED", 503, true);
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done)
                break;
            const chunk = Buffer.from(next.value);
            total += chunk.length;
            if (total > maximumBytes) {
                await reader.cancel();
                throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence exceeds the permitted size", "EVIDENCE_TOO_LARGE", 409);
            }
            chunks.push(chunk);
        }
    }
    finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
};
/** Cloudinary URLs are deliberately scoped to this storage implementation. */
const createFaceVerificationEvidenceStorageReader = (dependencies = {}) => async (input) => {
    const privateDownloadUrl = (dependencies.privateDownloadUrlFactory ?? ((publicId, format) => cloudinary_1.default.utils.private_download_url(publicId, format, {
        resource_type: "image", type: "authenticated", expires_at: Math.floor(Date.now() / 1000) + 60,
    })))(input.publicId, input.format);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
        const response = await (dependencies.fetchImplementation ?? fetch)(privateDownloadUrl, { method: "GET", signal: controller.signal, headers: { accept: "image/jpeg, image/png, image/webp" } });
        if (response.status === 404)
            throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence is not available", "EVIDENCE_NOT_AVAILABLE", 409);
        if (!response.ok)
            throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence retrieval failed", "EVIDENCE_RETRIEVAL_FAILED", 503, response.status >= 500);
        const bytes = await readResponseBytes(response, input.maximumBytes);
        return { bytes, contentType: response.headers.get("content-type"), byteLength: bytes.length };
    }
    catch (error) {
        if (error instanceof ProfileVerificationInferenceError_1.ProfileVerificationInferenceError)
            throw error;
        if (error instanceof Error && error.name === "AbortError") {
            throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence retrieval timed out", "EVIDENCE_RETRIEVAL_TIMEOUT", 503, true);
        }
        throw new ProfileVerificationInferenceError_1.ProfileVerificationInferenceError("Face evidence retrieval failed", "EVIDENCE_RETRIEVAL_FAILED", 503, true);
    }
    finally {
        clearTimeout(timer);
    }
};
exports.createFaceVerificationEvidenceStorageReader = createFaceVerificationEvidenceStorageReader;
exports.readFaceVerificationEvidenceAsset = (0, exports.createFaceVerificationEvidenceStorageReader)();
// Deliberately service-only in Stage 3D. A future Admin detail controller must
// authorize the request/profile relationship before returning this short-lived URL.
const generateFaceVerificationEvidenceAdminDownloadUrl = (publicId, format) => cloudinary_1.default.utils.private_download_url(publicId, format, {
    resource_type: "image",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 60,
});
exports.generateFaceVerificationEvidenceAdminDownloadUrl = generateFaceVerificationEvidenceAdminDownloadUrl;
