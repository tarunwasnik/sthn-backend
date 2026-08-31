const rawThreshold = process.env.STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD;
const normalizedThreshold = typeof rawThreshold === "string" ? rawThreshold.trim() : "";
const parsedThreshold = normalizedThreshold === "" ? undefined : Number(normalizedThreshold);

if (parsedThreshold !== undefined && (!Number.isFinite(parsedThreshold) || parsedThreshold < -1 || parsedThreshold > 1)) {
  throw new Error("STHN_SFACE_IDENTITY_APPROVAL_THRESHOLD must be a finite cosine similarity between -1 and 1");
}

console.info("[SFaceIdentityApprovalThreshold]", {
  configured: parsedThreshold !== undefined,
  rawLength: typeof rawThreshold === "string" ? rawThreshold.length : 0,
  parsedThreshold: parsedThreshold ?? null,
});

/** Explicit process-lifetime authority; absence deliberately disables AI approval. */
export const SFACE_IDENTITY_APPROVAL_THRESHOLD = parsedThreshold;
