import "./helpers/offlineSFaceIsolation";
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import * as ort from "onnxruntime-node";
import { Types } from "mongoose";
import { sfacePath, yunetPath } from "./helpers/offlineSFaceIsolation";
import { fixture, observeRealEmbeddings, assertNoActivation, connectOfflineDatabase, clearOfflineDatabase, disconnectOfflineDatabase, syntheticDetection } from "./helpers/offlineSFaceFixtures";
import * as embedding from "../../services/profile/profileVerificationFaceEmbeddingAdapter";
import { cosineSimilarity } from "../../services/profile/profileVerificationFaceEmbedding.service";
import { medianSFaceSimilarity } from "../../services/profile/profileVerificationSFaceShadowAnalysis.service";
import { createSFaceProfileVerificationAdapter } from "../../services/profile/profileVerificationSFaceAdapter";
import { processNextProfileVerificationJob, claimProfileVerificationJob, reconcileProfileVerificationJobs } from "../../services/profile/profileVerificationJob.service";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { ProfileVerificationJob } from "../../models/profileVerificationJob.model";
import { ProfileVerificationInferenceResult } from "../../models/profileVerificationInferenceResult.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { UserProfile } from "../../models/userProfile.model";
import { CreatorApplication } from "../../models/creatorApplication.model";
import { profileVerificationInferenceResultRepository } from "../../repositories/profileVerificationInferenceResult.repository";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { getAdminProfileVerificationDetail } from "../../services/profile/profileVerificationAdminRead.service";
import { getAdminCreatorVerificationCase } from "../../services/creator/creatorVerificationAdminRead.service";
import { toAdminInferenceAdvisory } from "../../dtos/admin/profileVerificationAdvisory.dto";

before(connectOfflineDatabase, { timeout: 120_000 });
beforeEach(async () => { await clearOfflineDatabase(); process.env.STHN_SFACE_MODEL_PATH = sfacePath; });
afterEach(() => { process.env.STHN_SFACE_MODEL_PATH = sfacePath; });
after(disconnectOfflineDatabase, { timeout: 30_000 });

const run = (f: Awaited<ReturnType<typeof fixture>>, adapter = f.makeAdapter(), now?: Date) => processNextProfileVerificationJob({ workerId: "ai03-worker", adapterFactory: () => adapter, now });
// Production normalizes vectors at multiple boundaries; compare numerical results within roundoff.
const close = (actual: number | undefined, expected: number) => { assert.ok(actual !== undefined && Number.isFinite(actual)); assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`); };

for (const target of ["USER_PROFILE", "CREATOR_APPLICATION"] as const) {
  for (const policy of ["LEGACY_AVATAR_ONLY_V1", "GATED_MULTI_MEDIA_V1"]) {
    test(`${target} ${policy}: real SFace with GENERATED pixels and INJECTED landmarks persists advisory fields`, async t => {
      const f = await fixture(t, target, policy);
      const vectors = observeRealEmbeddings(t);
      const result = await run(f);
      assert.equal(result?.completed, true); assert.ok(result.result);
      const persisted = await ProfileVerificationInferenceResult.findById(result.result._id).orFail();
      assert.equal(String(persisted.verificationRequestId), String(f.request._id));
      assert.equal(persisted.targetType, target);
      assert.equal(String(persisted.targetId), String(f.application?._id ?? f.profile._id));
      assert.equal(String(persisted.ownerUserId), String(f.user._id));
      assert.equal(persisted.verificationRevision, 1); assert.equal(persisted.profileSubmissionVersion, 1);
      assert.equal(persisted.pipeline.detector?.identifier, "TEST_ONLY_SYNTHETIC_LANDMARKS");
      assert.equal(persisted.pipeline.embedding?.artifactSha256, embedding.SFACE_ARTIFACT.sha256);
      assert.deepEqual(f.captureReads, [0, 1, 2, 3, 4]);
      assert.deepEqual(f.detectorRoles.slice(0, 5), ["CAPTURE_0", "CAPTURE_1", "CAPTURE_2", "CAPTURE_3", "CAPTURE_4"]);
      assert.deepEqual(f.mediaReads, f.references);
      assert.equal(vectors.length, policy.startsWith("LEGACY") ? 19 : 13);
      const live = persisted.profileMediaShadowAnalysis!.live;
      assert.equal(live.usableCaptureCount, 5); assert.equal(live.pairwiseComparisonCount, 10);
      const scores: number[] = [];
      for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) scores.push(cosineSimilarity(vectors[i], vectors[j], 128));
      close(live.minimumSimilarity, Math.min(...scores));
      close(live.maximumSimilarity, Math.max(...scores));
      close(live.medianSimilarity, medianSFaceSimilarity(scores));
      const media = persisted.profileMediaShadowAnalysis!.media;
      assert.equal(media.length, 8);
      for (const [index, item] of media.entries()) {
        assert.equal(item.status, "FACE_CANDIDATES_AVAILABLE");
        assert.equal(item.bestCandidate?.comparisonCount, 5);
        const expected = medianSFaceSimilarity(vectors.slice(0, 5).map(v => cosineSimilarity(v, vectors[5 + index], 128)));
        close(item.bestCandidate?.medianSimilarity, expected);
      }
      assert.equal(persisted.findings.crossCapture.status, "NOT_RUN");
      assert.equal(persisted.findings.avatar.status, "MATCH_UNCERTAIN");
      assert.equal(persisted.findings.antiSpoof.status, "NOT_RUN");
      const detail = target === "USER_PROFILE" ? await getAdminProfileVerificationDetail(f.request.verificationReference) : await getAdminCreatorVerificationCase(f.request.verificationReference);
      assert.equal(detail.inferenceAdvisory?.detectorUsableCaptureCount, 5);
      assert.equal(detail.inferenceAdvisory?.embeddedLiveCaptureCount, 5);
      assert.equal(detail.inferenceAdvisory?.profileMediaShadowAnalysis?.live.pairwiseComparisonCount, 10);
      assert.equal(detail.inferenceAdvisory?.profileMediaShadowAnalysis?.media.length, 8);
      assert.equal(detail.inferenceAdvisory?.pipeline.detector?.identifier, "TEST_ONLY_SYNTHETIC_LANDMARKS");
      assert.equal(detail.inferenceAdvisory?.pipeline.embedding?.artifactSha256, embedding.SFACE_ARTIFACT.sha256);
      assert.equal(detail.inferenceAdvisory?.antiSpoofStatus, "NOT_RUN");
      assert.doesNotMatch(JSON.stringify(detail.inferenceAdvisory), /"(?:pixels|landmarks|vectors|bytes|sourceReference|cloudinaryPublicId)":/);
      if ("shadowIdentityAnalysis" in detail) assert.equal(detail.shadowIdentityAnalysis.usableCaptureCount, null);
      if (policy.startsWith("LEGACY")) {
        assert.equal(persisted.shadowIdentityAnalysis?.reasonCode, "THRESHOLD_NOT_CONFIGURED");
        assert.equal(persisted.shadowIdentityAnalysis?.conclusion, "UNABLE_TO_DETERMINE");
        close(persisted.shadowIdentityAnalysis?.similarity, medianSFaceSimilarity(vectors.slice(14, 19).map(v => cosineSimilarity(v, vectors[13], 128))));
      } else {
        assert.equal(persisted.gatedPolicyAnalysis?.gate1.outcome, "PASS");
        assert.equal(persisted.gatedPolicyAnalysis?.gate2?.outcome, "READY_FOR_GATE3");
        assert.equal(persisted.gatedPolicyAnalysis?.gate3?.avatarMedianSimilarity, media[0].bestCandidate?.medianSimilarity);
      }
      assert.doesNotMatch(JSON.stringify(persisted.toObject()), /"(?:pixels|landmarks|vectors|bytes|sourceReference)":/);
      const request = await ProfileVerificationRequest.findById(f.request._id).orFail();
      assert.equal(request.status, "ADMIN_REVIEW_REQUIRED"); assert.equal(request.decision, undefined); assert.equal(request.decisionAuthority, undefined);
      await assertNoActivation(f);
      const beforeReplay = vectors.length;
      assert.equal(await run(f), null); assert.equal(vectors.length, beforeReplay);
      assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: f.request._id }), 1);
    });
  }

  test(`${target}: concurrent workers claim once and recovered lease executes the real adapter`, async t => {
    const f = await fixture(t, target);
    const claimed = await claimProfileVerificationJob({ workerId: "dead-worker" }); assert.ok(claimed);
    const future = new Date(Date.now() + 5 * 60_000 + 1000);
    await reconcileProfileVerificationJobs(future);
    let calls = 0;
    const base = f.makeAdapter();
    const factory = () => ({ ...base, infer: async (input: Parameters<typeof base.infer>[0]) => { calls++; return base.infer(input); } });
    const results = await Promise.all([processNextProfileVerificationJob({ workerId: "a", now: future, adapterFactory: factory }), processNextProfileVerificationJob({ workerId: "b", now: future, adapterFactory: factory })]);
    assert.equal(calls, 1); assert.equal(results.filter(r => r?.result).length, 1);
    assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: f.request._id }), 1);
    await assertNoActivation(f);
  });

  test(`${target}: missing capture record prevents any inference/storage read`, async t => {
    const f = await fixture(t, target);
    await FaceVerificationEvidence.deleteOne({ _id: f.records[4]._id });
    const result = await run(f);
    assert.equal(result?.result, null); assert.ok(result && "failure" in result); assert.equal(result.failure?.lastErrorCode, "EVIDENCE_INCOMPLETE");
    assert.deepEqual(f.captureReads, []); assert.deepEqual(f.detectorRoles, []);
    await assertNoActivation(f);
  });

  test(`${target}: stale bound session revision cannot produce an inference`, async t => {
    const f = await fixture(t, target);
    await FaceVerificationSession.updateOne({ _id: f.session._id }, { $set: { profileSubmissionVersion: 99 } });
    const result = await run(f);
    assert.equal(result?.completed, false); assert.equal(result?.result, null);
    assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: f.request._id }), 0);
    await assertNoActivation(f);
  });

  test(`${target}: replaced avatar reference is rejected by existing authority checks`, async t => {
    const f = await fixture(t, target, "LEGACY_AVATAR_ONLY_V1");
    if (f.application) await CreatorApplication.updateOne({ _id: f.application._id }, { $set: { avatarUrl: f.references[1] } });
    else await UserProfile.updateOne({ _id: f.profile._id }, { $set: { avatar: f.references[1] } });
    const result = await run(f);
    assert.equal(result?.result, null);
    assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: f.request._id }), 0);
    await assertNoActivation(f);
  });

  test(`${target}: terminal request during real inference rejects late output`, async t => {
    const f = await fixture(t, target);
    const base = f.makeAdapter();
    const result = await run(f, { ...base, infer: async input => {
      const output = await base.infer(input);
      await ProfileVerificationRequest.updateOne({ _id: f.request._id }, { $set: { status: "EXPIRED", isActive: false } });
      return output;
    } });
    assert.equal(result?.result, null);
    assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: f.request._id }), 0);
    await assertNoActivation(f);
  });

  test(`${target}: request revision changed during real inference rejects late output`, async t => {
    const f = await fixture(t, target);
    const base = f.makeAdapter();
    const result = await run(f, { ...base, infer: async input => {
      const output = await base.infer(input);
      await ProfileVerificationRequest.updateOne({ _id: f.request._id }, { $inc: { profileSubmissionVersion: 1, verificationRevision: 1 } });
      return output;
    } });
    assert.equal(result?.result, null);
    assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: f.request._id }), 0);
    await assertNoActivation(f);
  });

  test(`${target}: four detector-usable faces are distinct from five required gated embeddings`, async t => {
    const f = await fixture(t, target);
    const result = await run(f, f.makeAdapter(async (_bytes, role) => role === "CAPTURE_4" ? { ...syntheticDetection(), faces: [] } : syntheticDetection()));
    assert.ok(result?.result);
    assert.equal(result.result.findings.crossCapture.usableCaptureCount, 4);
    assert.equal(result.result.profileMediaShadowAnalysis?.live.usableCaptureCount, 4);
    assert.equal(result.result.gatedPolicyAnalysis?.gate1.outcome, "LIVE_CAPTURE_TECHNICAL_FAILURE");
    assert.equal(result.result.gatedPolicyAnalysis?.gate3, undefined);
    assert.equal(result.result.findings.avatar.status, "NOT_RUN");
    await assertNoActivation(f);
  });

  test(`${target}: injected detector outage retries three times then escalates without activation`, async t => {
    const f = await fixture(t, target);
    let now = new Date();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await run(f, f.makeAdapter(async () => { throw new ProfileVerificationInferenceError("Injected detector outage", "TECHNICAL_FAILURE", 503, true); }), now);
      assert.equal(result?.result, null);
      const job = await ProfileVerificationJob.findOne({ verificationRequestId: f.request._id }).orFail();
      assert.equal(job.attemptCount, attempt); assert.equal(job.status, attempt === 3 ? "FAILED" : "RETRY_WAIT");
      now = new Date(job.nextAttemptAt.getTime() + 1);
    }
    assert.equal((await ProfileVerificationRequest.findById(f.request._id))?.status, "ADMIN_REVIEW_REQUIRED");
    assert.equal(await ProfileVerificationInferenceResult.countDocuments({ verificationRequestId: f.request._id }), 0);
    await assertNoActivation(f);
  });
}

for (const fault of ["missing", "wrong-integrity", "initialization", "nonfinite", "wrong-dimensions", "zero-norm"] as const) {
  test(`SFace ${fault}: unavailable embeddings remain technical advisory evidence, not a match`, async t => {
    embedding.resetSFaceRunnerForTests();
    t.after(() => embedding.resetSFaceRunnerForTests());
    const f = await fixture(t, "USER_PROFILE");
    let faultCalls = 0;
    if (fault === "missing") process.env.STHN_SFACE_MODEL_PATH = `${sfacePath}.ai03-missing`;
    if (fault === "wrong-integrity") process.env.STHN_SFACE_MODEL_PATH = yunetPath;
    if (fault === "initialization") t.mock.method(ort.InferenceSession, "create", async () => { faultCalls++; throw new Error("Injected initialization failure"); });
    if (["nonfinite", "wrong-dimensions", "zero-norm"].includes(fault)) {
      // Existing runtime test seam injects bad output, never a successful fake embedding.
      t.mock.method(embedding, "getProductionFaceEmbeddingAdapter", () => embedding.createProductionFaceEmbeddingAdapter({
        createInputTensor: values => new ort.Tensor("float32", values, [1, 3, 112, 112]),
        loadSession: async () => ({ run: async () => {
          faultCalls++;
          const values = fault === "wrong-dimensions" ? new Float32Array(127) : new Float32Array(128).fill(fault === "nonfinite" ? NaN : 0);
          return { fc1: new ort.Tensor("float32", values, [1, values.length]) };
        } }) as Pick<ort.InferenceSession, "run">,
      }));
    }
    const result = await run(f);
    assert.ok(result?.result);
    assert.equal(result.result.findings.crossCapture.usableCaptureCount, 5, "Detector usability is not embedding success");
    assert.equal(result.result.profileMediaShadowAnalysis?.live.usableCaptureCount, 0);
    assert.equal(result.result.gatedPolicyAnalysis?.gate1.outcome, "LIVE_CAPTURE_TECHNICAL_FAILURE");
    assert.equal(result.result.gatedPolicyAnalysis?.gate3, undefined);
    assert.equal(result.result.findings.antiSpoof.status, "NOT_RUN");
    const advisory = toAdminInferenceAdvisory(result.result);
    assert.equal(advisory?.detectorUsableCaptureCount, 5);
    assert.equal(advisory?.embeddedLiveCaptureCount, 0);
    assert.equal(advisory?.profileMediaShadowAnalysis?.reasonCode, "INSUFFICIENT_USABLE_LIVE_CAPTURES");
    assert.equal(advisory?.genericAvatarStatus, "NOT_RUN");
    if (!["missing", "wrong-integrity"].includes(fault)) assert.equal(faultCalls, 5);
    await assertNoActivation(f);
  });
}

test("Creator revision changed after real inference rejects stale output before persistence", async t => {
  const f = await fixture(t, "CREATOR_APPLICATION");
  const base = f.makeAdapter();
  const result = await run(f, { ...base, infer: async input => {
    const output = await base.infer(input);
    await CreatorApplication.updateOne({ _id: f.application!._id }, { $inc: { verificationRevision: 1 } });
    return output;
  } });
  assert.equal(result?.result, null); assert.ok(result && "failure" in result); assert.equal(result.failure?.lastErrorCode, "STALE_SUBMISSION");
  await assertNoActivation(f);
});

test("Creator target/owner substitution is rejected at job and result persistence boundaries", async t => {
  const f = await fixture(t, "CREATOR_APPLICATION");
  const success = await run(f); assert.ok(success?.result);
  const source = success.result.toObject();
  for (const replacement of [{ targetId: new Types.ObjectId() }, { ownerUserId: new Types.ObjectId() }]) {
    await assert.rejects(profileVerificationInferenceResultRepository.createForTarget({ ...source, targetType: "CREATOR_APPLICATION", targetId: f.application!._id, ownerUserId: f.user._id, verificationRevision: 1, avatarReference: f.references[0], avatarFingerprint: f.session.avatarFingerprint, ...replacement }), /target does not match/);
  }
  const bad = await fixture(t, "CREATOR_APPLICATION");
  await ProfileVerificationJob.updateOne({ verificationRequestId: bad.request._id }, { $set: { ownerUserId: new Types.ObjectId() } });
  const rejected = await run(bad);
  assert.equal(rejected?.result, null); assert.deepEqual(bad.captureReads, []);
  await assertNoActivation(bad);
});

test("generic NOT_RUN findings without detailed identity evidence never finalize User verification", async t => {
  const f = await fixture(t, "USER_PROFILE", "LEGACY_AVATAR_ONLY_V1");
  const base = f.makeAdapter();
  const result = await run(f, { ...base, infer: async input => ({ findings: { ...(await base.infer(input) as import("../../services/profile/profileVerificationInference.types").ProfileVerificationInferenceOutput).findings, avatar: { status: "NOT_RUN" } } }) });
  assert.ok(result?.result);
  assert.equal(result.result.findings.crossCapture.status, "NOT_RUN");
  assert.equal((await ProfileVerificationRequest.findById(f.request._id))?.status, "ADMIN_REVIEW_REQUIRED");
  await assertNoActivation(f);
});

for (const [scenario, expected] of [["no-face", "NO_USABLE_FACE"], ["multiple", "MULTIPLE_FACES"], ["unavailable", "NOT_RUN"]] as const) {
  test(`gated avatar ${scenario} is reported without inventing a successful identity comparison`, async t => {
    const f = await fixture(t, "USER_PROFILE");
    let mediaIndex = 0;
    const result = await run(f, f.makeAdapter(async (_bytes, role) => {
      const detection = syntheticDetection();
      if (role === "UNSPECIFIED" && mediaIndex++ === 0) {
        if (scenario === "unavailable") throw new Error("Injected unavailable avatar detection");
        return { ...detection, faces: scenario === "no-face" ? [] : [detection.faces[0], detection.faces[0]] };
      }
      return detection;
    }));
    assert.ok(result?.result);
    assert.equal(result.result.findings.avatar.status, expected);
    assert.equal(result.result.gatedPolicyAnalysis?.gate2?.outcome, "AVATAR_INVALID");
    assert.equal(result.result.gatedPolicyAnalysis?.gate3, undefined);
    assert.equal(result.result.findings.antiSpoof.status, "NOT_RUN");
    await assertNoActivation(f);
  });
}

test("legacy unavailable reference does not falsely claim no detected avatar face", async t => {
  const f = await fixture(t, "USER_PROFILE", "LEGACY_AVATAR_ONLY_V1");
  const result = await run(f, f.makeAdapter(async (_bytes, role) => {
    if (role === "REFERENCE") throw new Error("Injected reference failure");
    return syntheticDetection();
  }));
  assert.equal(result?.result?.findings.avatar.status, "NOT_RUN");
  assert.equal(result?.result?.shadowIdentityAnalysis?.reasonCode, "REFERENCE_AVATAR_UNAVAILABLE");
  await assertNoActivation(f);
});

test("metadata contract separates YuNet BGR and SFace RGB without claiming a capture minimum or no thresholds", () => {
  const manifest = createSFaceProfileVerificationAdapter().pipelineManifest;
  assert.equal(manifest.pipelineVersion, "STHN_SFACE_ADVISORY_MULTI_MEDIA_V3");
  assert.equal(manifest.preprocessingVersion, "YUNET_BGR_5PT_ALIGN_SFACE_112_RGB_NCHW_L2_COSINE_V2");
  assert.doesNotMatch(manifest.preprocessingVersion!, /MIN3|NO_THRESHOLD/);
  const pixels = Buffer.alloc(112 * 112 * 3); pixels[0] = 11; pixels[1] = 22; pixels[2] = 33;
  const tensor = embedding.createSFaceInputTensor({ pixels, width: 112, height: 112, channels: 3, preprocessingIdentifier: embedding.SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing.identifier });
  assert.deepEqual([tensor[0], tensor[112 * 112], tensor[2 * 112 * 112]], [11, 22, 33]);
});
