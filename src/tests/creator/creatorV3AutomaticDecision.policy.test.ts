import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";
import { SFACE_ARTIFACT } from "../../services/profile/profileVerificationFaceEmbeddingAdapter";
import { YUNET_ARTIFACT } from "../../services/profile/profileVerificationYuNet.constants";
import { CREATOR_V3_AVATAR_SIMILARITY_THRESHOLD, CREATOR_V3_CROSS_CAPTURE_THRESHOLD, CREATOR_V3_MULTI_FACE_MARGIN, evaluateCreatorV3Evidence } from "../../services/creator/creatorV3AutomaticDecision.service";

type FixtureRequest = { _id: Types.ObjectId; targetId: Types.ObjectId; ownerUserId: Types.ObjectId; userId: Types.ObjectId; targetType: string; verificationRevision: number; profileSubmissionVersion: number; verificationPolicy: { key: string; version: string }; submittedMedia: { avatar: object; cover: object; profilePhotos: object[] } };
const request = (): FixtureRequest => {
  const id = new Types.ObjectId(); const userId = new Types.ObjectId();
  return { _id: id, targetType: "CREATOR_APPLICATION", targetId: new Types.ObjectId(), ownerUserId: userId, userId, verificationRevision: 1, profileSubmissionVersion: 1, verificationPolicy: { key: "GATED_MULTI_MEDIA", version: "V3" }, submittedMedia: { avatar: {}, cover: {}, profilePhotos: [] } };
};
const result = (source: FixtureRequest, similarity = CREATOR_V3_AVATAR_SIMILARITY_THRESHOLD, weakest = CREATOR_V3_CROSS_CAPTURE_THRESHOLD) => ({
  targetType: "CREATOR_APPLICATION", verificationRequestId: source._id, targetId: source.targetId, ownerUserId: source.ownerUserId, userId: source.userId, verificationRevision: 1, profileSubmissionVersion: 1,
  pipeline: { kind: "MODEL_RUNTIME", detector: { identifier: YUNET_ARTIFACT.identifier, version: YUNET_ARTIFACT.version }, embedding: { identifier: SFACE_ARTIFACT.identifier, version: SFACE_ARTIFACT.version } },
  findings: { captures: [0, 1, 2, 3, 4].map((challengeIndex) => ({ challengeIndex, faceCount: "ONE", usability: "USABLE" })) },
  gatedPolicyAnalysis: { policy: { key: "GATED_MULTI_MEDIA", version: "V3" }, gate1: { outcome: "PASS", usableCaptureCount: 5, threshold: CREATOR_V3_CROSS_CAPTURE_THRESHOLD, policyVersion: "V1", weakestPeerMedian: weakest }, gate2: { outcome: "READY_FOR_GATE3", avatarAdmission: "VALID_SINGLE_FACE" }, gate3: { conclusion: "LIKELY_MATCH", avatarMembership: "PERSON_A_SUPPORTED", avatarMedianSimilarity: similarity, membershipThreshold: CREATOR_V3_AVATAR_SIMILARITY_THRESHOLD, multiFaceMinMargin: CREATOR_V3_MULTI_FACE_MARGIN, optionalPersonASupportCount: 0, optionalAmbiguousMediaCount: 0, optionalTechnicalFailureCount: 0 } },
  profileMediaShadowAnalysis: { status: "COMPLETED", live: { usableCaptureCount: 5 }, summary: { multiFaceMediaCount: 0 }, media: [] },
} as never);

test("Creator V3 accepts exact similarity and consistency boundaries as a biometric match only", () => {
  const source = request();
  const evaluation = evaluateCreatorV3Evidence(source as never, result(source));
  assert.equal(evaluation.biometricIdentity, "MATCH");
  assert.equal(evaluation.finalAction, "ADMIN_REVIEW");
});

test("Creator V3 rejects deterministic capture failure and reviews below-threshold consistency", () => {
  const source = request();
  assert.equal(evaluateCreatorV3Evidence(source as never, result(source, CREATOR_V3_AVATAR_SIMILARITY_THRESHOLD, CREATOR_V3_CROSS_CAPTURE_THRESHOLD - .001)).finalAction, "ADMIN_REVIEW");
  const malformed = result(source) as { findings: { captures: Array<{ faceCount: string }> } };
  malformed.findings.captures[0].faceCount = "MULTIPLE";
  assert.equal(evaluateCreatorV3Evidence(source as never, malformed as never).finalAction, "REJECT");
});
