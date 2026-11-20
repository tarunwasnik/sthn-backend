import assert from "node:assert/strict";
import { test } from "node:test";
import { toAdminInferenceAdvisory } from "../../dtos/admin/profileVerificationAdvisory.dto";

const source = (): NonNullable<Parameters<typeof toAdminInferenceAdvisory>[0]> => ({
  pipeline: { kind: "TEST_SYNTHETIC", pipelineVersion: "TEST_ONLY", runtimeIdentifier: "INJECTED", runtimeVersion: "1" },
  findings: { captures: [], crossCapture: { status: "NOT_RUN", usableCaptureCount: 5, outlierCaptureCount: 0 }, avatar: { status: "NOT_RUN" }, antiSpoof: { status: "NOT_RUN" } },
});
const withMedia = () => ({ ...source(), profileMediaShadowAnalysis: {
  status: "COMPLETED" as const, processedAt: new Date(), model: { identifier: "TEST_ONLY", version: "1" },
  summary: { submittedMediaCount: 1, processedMediaCount: 1, mediaWithNoFaceCount: 0, mediaWithUsableFacesCount: 1, multiFaceMediaCount: 1, failedMediaCount: 0 },
  live: { usableCaptureCount: 5, pairwiseComparisonCount: 10 },
  media: [{ role: "COVER" as const, status: "FACE_CANDIDATES_AVAILABLE" as const, detectedFaceCount: 2, usableFaceCount: 2, candidateCount: 2, bestVsSecondMargin: 2 }],
} });

test("missing and historical detector-only evidence never fabricates successful embeddings or comparisons", () => {
  assert.equal(toAdminInferenceAdvisory(null), null);
  const projected = toAdminInferenceAdvisory(source())!;
  assert.equal(projected.detectorUsableCaptureCount, 5);
  assert.equal(projected.embeddedLiveCaptureCount, null);
  assert.equal(projected.profileMediaShadowAnalysis, null);
  assert.equal(projected.genericCrossCaptureStatus, "NOT_RUN");
  assert.equal(projected.genericAvatarStatus, "NOT_RUN");
  assert.equal(projected.antiSpoofStatus, "NOT_RUN");
});

test("historical inaccurate labels remain as recorded with an explicit warning and no rewrite", () => {
  const old = source();
  old.pipeline.pipelineVersion = "STHN_SFACE_SHADOW_MEDIAN_3_NO_THRESHOLD_V2";
  old.pipeline.preprocessingVersion = "YUNET_5PT_SFACE_112_BGR_L2_COSINE_MEDIAN_MIN3_NO_THRESHOLD_V1";
  old.findings.avatar.status = "NO_USABLE_FACE";
  const before = JSON.stringify(old);
  const projected = toAdminInferenceAdvisory(old)!;
  assert.equal(projected.pipeline.metadataStatus, "LEGACY_LABELS_UNRELIABLE");
  assert.equal(projected.pipeline.preprocessingVersion, old.pipeline.preprocessingVersion);
  assert.equal(projected.genericAvatarStatus, null);
  assert.equal(JSON.stringify(old), before);
});

test("historical negative and nonfinite margins are unavailable, while valid scores above one are unchanged", () => {
  for (const margin of [-1, -Number.EPSILON, NaN, Infinity, -Infinity, 2.01, 0, 1, 1.5, 2]) {
    const input = withMedia(); input.profileMediaShadowAnalysis.media[0].bestVsSecondMargin = margin;
    const expected = Number.isFinite(margin) && margin >= 0 && margin <= 2 ? margin : null;
    assert.equal(toAdminInferenceAdvisory(input)?.profileMediaShadowAnalysis?.media[0].bestVsSecondMargin, expected);
    assert.ok(Object.is(input.profileMediaShadowAnalysis.media[0].bestVsSecondMargin, margin));
  }
});

test("Admin projection does not spread arbitrary stored fields or raw evidence into its response", () => {
  const input = withMedia();
  Object.assign(input, { rawVectors: [42], cloudinaryPublicId: "secret" });
  Object.assign(input.pipeline, { token: "secret" });
  Object.assign(input.profileMediaShadowAnalysis, { bytes: "secret" });
  Object.assign(input.profileMediaShadowAnalysis.live, { vectors: [42] });
  Object.assign(input.profileMediaShadowAnalysis.media[0], { sourceReference: "https://secret.test/image", landmarks: [42] });
  const output = JSON.stringify(toAdminInferenceAdvisory(input));
  assert.doesNotMatch(output, /secret|rawVectors|cloudinaryPublicId|token|bytes|vectors|sourceReference|landmarks/);
});

test("zero embedded captures and skipped media stay distinct from detector usability", () => {
  const input: NonNullable<Parameters<typeof toAdminInferenceAdvisory>[0]> = withMedia();
  input.profileMediaShadowAnalysis!.live = { usableCaptureCount: 0, pairwiseComparisonCount: 0 };
  input.profileMediaShadowAnalysis!.reasonCode = "INSUFFICIENT_USABLE_LIVE_CAPTURES";
  input.profileMediaShadowAnalysis!.media = [];
  const projected = toAdminInferenceAdvisory(input)!;
  assert.equal(projected.detectorUsableCaptureCount, 5);
  assert.equal(projected.embeddedLiveCaptureCount, 0);
  assert.equal(projected.profileMediaShadowAnalysis?.reasonCode, "INSUFFICIENT_USABLE_LIVE_CAPTURES");
  assert.equal(projected.profileMediaShadowAnalysis?.live.medianSimilarity, null);
});
