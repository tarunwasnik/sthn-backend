import assert from "node:assert/strict";
import test from "node:test";

import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { createTrustedFaceVerificationAvatarReferenceReader } from "../../services/profile/profileVerificationAvatarRead.service";

const reference = "https://res.cloudinary.com/demo/image/upload/v1/sthn/avatar.jpg";
const response = (input: { ok?: boolean; status?: number; contentLength?: string | null; body?: BodyInit | null } = {}): Response => new Response(
  input.body === undefined ? new Uint8Array([1, 2, 3]) : input.body,
  { status: input.status ?? (input.ok === false ? 503 : 200), headers: input.contentLength === undefined ? { "content-length": "3" } : input.contentLength === null ? {} : { "content-length": input.contentLength } },
);

test("candidate reader rejects untrusted references before download", async () => {
  let fetched = false;
  const reader = createTrustedFaceVerificationAvatarReferenceReader({ fetchImplementation: async () => { fetched = true; return response(); } });
  await assert.rejects(() => reader("https://attacker.example/avatar.jpg"), (error: unknown) => error instanceof ProfileVerificationInferenceError && error.code === "EVIDENCE_NOT_AVAILABLE");
  assert.equal(fetched, false);
});

test("candidate reader uses the same bounded trusted-reference download controls", async () => {
  let sawAbortSignal = false;
  const reader = createTrustedFaceVerificationAvatarReferenceReader({
    cloudinaryUrlFactory: () => "https://reader.test/avatar.jpg",
    fetchImplementation: async (_url, init) => {
      sawAbortSignal = init?.signal instanceof AbortSignal;
      return response();
    },
  });
  assert.deepEqual(await reader(reference), Buffer.from([1, 2, 3]));
  assert.equal(sawAbortSignal, true);
});

test("candidate reader enforces declared and streamed size bounds and preserves retrieval failures", async () => {
  const declaredTooLarge = createTrustedFaceVerificationAvatarReferenceReader({ cloudinaryUrlFactory: () => "https://reader.test/avatar.jpg", fetchImplementation: async () => response({ contentLength: String(100 * 1024 * 1024) }) });
  await assert.rejects(() => declaredTooLarge(reference), (error: unknown) => error instanceof ProfileVerificationInferenceError && error.code === "EVIDENCE_TOO_LARGE");
  const streamedTooLarge = createTrustedFaceVerificationAvatarReferenceReader({
    cloudinaryUrlFactory: () => "https://reader.test/avatar.jpg",
    fetchImplementation: async () => response({ contentLength: null, body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(20 * 1024 * 1024)); controller.close(); } }) }),
  });
  await assert.rejects(() => streamedTooLarge(reference), (error: unknown) => error instanceof ProfileVerificationInferenceError && error.code === "EVIDENCE_TOO_LARGE");
  const unavailable = createTrustedFaceVerificationAvatarReferenceReader({ cloudinaryUrlFactory: () => "https://reader.test/avatar.jpg", fetchImplementation: async () => response({ ok: false, status: 503 }) });
  await assert.rejects(() => unavailable(reference), (error: unknown) => error instanceof ProfileVerificationInferenceError && error.code === "EVIDENCE_RETRIEVAL_FAILED" && error.retryable);
});
