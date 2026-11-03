import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";

import { ImageModerationAttempt } from "../../models/imageModerationAttempt.model";

const base = () => ({
  attemptReference: "imat_test_attempt",
  assetId: new Types.ObjectId(),
  actorId: new Types.ObjectId(),
  surface: "USER_PROFILE_AVATAR",
  entityBinding: "PENDING:test:USER_PROFILE_AVATAR",
  contentSha256: "a".repeat(64),
  expiresAt: new Date("2030-01-01"),
  retentionDeadline: new Date("2030-01-02"),
  policy: { key: "STHN_IMAGE_AI_V1", version: "V1" },
});

test("I3B-4 accepts legacy attempt provenance without V2 fields", () => {
  const attempt = new ImageModerationAttempt({ ...base(), provenanceModel: { identifier: "AdamCodd/vit-base-nsfw-detector", revision: "legacy", artifactSha256: "b".repeat(64) } });
  assert.equal(attempt.validateSync(), undefined);
  assert.equal(attempt.provenanceModel.pipeline, undefined);
});

test("I3B-4 validates immutable V2 pipeline provenance fields", () => {
  const attempt = new ImageModerationAttempt({ ...base(), provenanceModel: { identifier: "STHN_ADAMCODD_V2_INT8", revision: "owner-local-883-v1-avif", artifactSha256: "c".repeat(64), pipeline: "V2", preprocessingId: "STHN_ADAMCODD_V2_ORIGINAL_SHARP_LINEAR_V1", decisionRuleId: "STHN_ADAMCODD_V2_NSFW_SOFTMAX_GTE_THRESHOLD_V1", threshold: 0.3362914399272772 } });
  assert.equal(attempt.validateSync(), undefined);
  assert.equal(attempt.provenanceModel.pipeline, "V2");
  assert.equal(attempt.provenanceModel.threshold, 0.3362914399272772);
  assert.equal(ImageModerationAttempt.schema.path("provenanceModel.pipeline")?.options.immutable, true);
  assert.equal(ImageModerationAttempt.schema.path("provenanceModel.preprocessingId")?.options.immutable, true);
  assert.equal(ImageModerationAttempt.schema.path("provenanceModel.decisionRuleId")?.options.immutable, true);
  assert.equal(ImageModerationAttempt.schema.path("provenanceModel.threshold")?.options.immutable, true);
});
