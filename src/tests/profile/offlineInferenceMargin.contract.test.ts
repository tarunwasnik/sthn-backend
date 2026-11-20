import "./helpers/offlineSFaceIsolation";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fixture, generatedImage, syntheticDetection, hash, connectOfflineDatabase, clearOfflineDatabase, disconnectOfflineDatabase, assertNoActivation } from "./helpers/offlineSFaceFixtures";
import { getAdminProfileVerificationDetail } from "../../services/profile/profileVerificationAdminRead.service";
import { getAdminCreatorVerificationCase } from "../../services/creator/creatorVerificationAdminRead.service";
import { analyseLiveCaptureProfileMediaShadow } from "../../services/profile/profileVerificationLiveMediaShadowAnalysis.service";
import { createProfileVerificationSubmittedMediaSnapshot } from "../../services/profile/profileVerificationSubmittedMedia.service";
import { classifyYuNetDetections } from "../../services/profile/profileVerificationYuNetAdapter";
import { finalizeProfileVerificationInference } from "../../services/profile/profileVerificationInference.service";
import { processNextProfileVerificationJob } from "../../services/profile/profileVerificationJob.service";
import { evaluateProfileVerificationGate3IdentityPolicy } from "../../services/profile/profileVerificationGate3IdentityPolicy.service";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { Y4E_MULTI_FACE_MIN_MARGIN } from "../../evaluation/y4ProfileMediaPolicy.service";

before(connectOfflineDatabase, { timeout: 120_000 });
beforeEach(clearOfflineDatabase);
after(disconnectOfflineDatabase, { timeout: 30_000 });
const pipelineManifest = { kind: "TEST_SYNTHETIC" as const, pipelineVersion: "AI03_MARGIN_CONTRACT_ONLY", runtimeIdentifier: "INJECTED_VECTORS_NOT_MODEL_INFERENCE", runtimeVersion: "1" };

/** Pure numerical vectors isolate the margin contract; this is NOT a real-SFace test. */
async function marginAnalysis() {
  const bytes = await generatedImage(1);
  const snapshot = createProfileVerificationSubmittedMediaSnapshot({ avatar: "fixture-avatar", cover: "fixture-cover", profilePhotos: ["fixture-one", "fixture-two"] });
  let imageIndex = 0; let vectorIndex = 0;
  const unit = (sign: number) => [sign, ...Array<number>(127).fill(0)];
  return analyseLiveCaptureProfileMediaShadow({ snapshot, usableLiveEmbeddings: Array.from({ length: 5 }, () => unit(1)),
    readMedia: async () => bytes,
    detector: async () => {
      const detection = syntheticDetection();
      const count = imageIndex++ === 0 ? 1 : imageIndex === 2 ? 2 : 0;
      return { ...detection, faces: Array.from({ length: count }, () => detection.faces[0]) };
    },
    embedder: async () => unit(vectorIndex++ === 2 ? -1 : 1),
  });
}

const findings = (f: Awaited<ReturnType<typeof fixture>>) => classifyYuNetDetections(f.session.challenges.map((challenge, challengeIndex) => ({ challenge, challengeIndex, detection: syntheticDetection() })));

test("intended numerical contract: sorted cosine scores can yield a margin of 2 and Gate 3 accepts it", async () => {
  const analysis = await marginAnalysis();
  const cover = analysis.media[1];
  assert.equal(cover.bestCandidate?.medianSimilarity, 1);
  assert.equal(cover.secondBestMedianSimilarity, -1);
  assert.equal(cover.bestVsSecondMargin, 2);
  assert.equal(Y4E_MULTI_FACE_MIN_MARGIN, .04);
  assert.equal(evaluateProfileVerificationGate3IdentityPolicy({ gate1Accepted: true, analysis }).optionalMediaWithPersonA, 1);
});

for (const target of ["USER_PROFILE", "CREATOR_APPLICATION"] as const) {
test(`${target}: valid producer margin 2 persists unchanged and remains advisory`, async t => {
  const f = await fixture(t, target, "LEGACY_AVATAR_ONLY_V1");
  const analysis = await marginAnalysis();
  const adapter = { pipelineManifest, infer: async () => ({ findings: findings(f), profileMediaShadowAnalysis: analysis }) };
  const result = await processNextProfileVerificationJob({ workerId: "margin-contract", adapterFactory: () => adapter });
  assert.equal(result?.completed, true); assert.ok(result?.result);
  const stored = await ProfileVerificationInferenceResult.findById(result.result._id).orFail();
  assert.equal(stored.profileMediaShadowAnalysis?.media[1].bestVsSecondMargin, 2);
  assert.equal(stored.targetType, target);
  assert.equal(String(stored.targetId), String(f.application?._id ?? f.profile._id));
  assert.equal(String(stored.ownerUserId), String(f.user._id));
  assert.equal(stored.verificationRevision, 1);
  const detail = target === "USER_PROFILE" ? await getAdminProfileVerificationDetail(f.request.verificationReference) : await getAdminCreatorVerificationCase(f.request.verificationReference);
  assert.equal(detail.inferenceAdvisory?.profileMediaShadowAnalysis?.media[1].bestVsSecondMargin, 2);
  assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: f.request._id }), 1);
  assert.equal((await ProfileVerificationRequest.findById(f.request._id))?.status, "ADMIN_REVIEW_REQUIRED");
  await assertNoActivation(f);
});

// Finite sorted cosine differences are [0, 2]; optional historical absence remains valid.
for (const [label, margin, accepted] of [
  ["negative one", -1, false],
  ["negative epsilon", -Number.EPSILON, false],
  ["zero", 0, true], ["policy boundary .04", .04, true], ["one", 1, true],
  ["just above one", 1 + Number.EPSILON, true],
  ["two", 2, true],
  ["above two", 2.01, false], ["below minus one", -1.01, false],
  ["NaN", NaN, false], ["infinity", Infinity, false], ["negative infinity", -Infinity, false],
  ["absent", undefined, true],
  ["null is not a numeric margin", null, false],
] as const) {
  test(`${target} margin runtime/schema contract: ${label}`, async t => {
    const f = await fixture(t, target, "LEGACY_AVATAR_ONLY_V1");
    const analysis = await marginAnalysis();
    // Intentionally exercise the invalid null input as well as typed numeric values.
    analysis.media[1].bestVsSecondMargin = margin as number | undefined;
    const output = { findings: findings(f), profileMediaShadowAnalysis: analysis };
    const doc = new ProfileVerificationInferenceResult({
      inferenceReference: `AI03_MARGIN_${f.request._id}`, inferenceRunFingerprint: hash(String(f.request._id)), verificationRequestId: f.request._id,
      profileId: f.profile._id, userId: f.user._id, profileSubmissionVersion: 1, faceVerificationSessionId: f.session._id,
      targetType: target, targetId: f.application?._id ?? f.profile._id, ownerUserId: f.user._id, verificationRevision: 1,
      evidenceSetFingerprint: hash("evidence"), pipelineManifestFingerprint: hash("pipeline"), pipeline: pipelineManifest,
      ...output, retentionDeadline: new Date(Date.now() + 86_400_000),
    });
    const action = () => finalizeProfileVerificationInference({ verificationRequestId: String(f.request._id), adapter: { pipelineManifest, infer: async () => output } });
    if (accepted) { await doc.validate(); const persisted = (await action()).result; assert.ok(persisted); assert.equal(persisted.profileMediaShadowAnalysis?.media[1].bestVsSecondMargin, margin); }
    else { await assert.rejects(doc.validate()); await assert.rejects(action(), (e: unknown) => (e as { code: string }).code === "FINDINGS_INVALID"); }
    await assertNoActivation(f);
  });
}
}

test("invalid margin cannot bypass runtime validation when bestCandidate is absent", async t => {
  const f = await fixture(t, "USER_PROFILE", "LEGACY_AVATAR_ONLY_V1");
  const analysis = await marginAnalysis();
  delete analysis.media[1].bestCandidate;
  analysis.media[1].bestVsSecondMargin = -1;
  await assert.rejects(finalizeProfileVerificationInference({ verificationRequestId: String(f.request._id), adapter: { pipelineManifest, infer: async () => ({ findings: findings(f), profileMediaShadowAnalysis: analysis }) } }), (e: unknown) => (e as { code: string }).code === "FINDINGS_INVALID");
});

test("existing optional multi-face policy boundary distinguishes .04 from just below without altering thresholds", async () => {
  const analysis = await marginAnalysis();
  const cover = analysis.media[1];
  cover.bestVsSecondMargin = .04;
  assert.equal(evaluateProfileVerificationGate3IdentityPolicy({ gate1Accepted: true, analysis }).optionalMediaWithPersonA, 1);
  cover.bestVsSecondMargin = .04 - Number.EPSILON;
  assert.equal(evaluateProfileVerificationGate3IdentityPolicy({ gate1Accepted: true, analysis }).optionalAmbiguousMediaCount, 1);
});
