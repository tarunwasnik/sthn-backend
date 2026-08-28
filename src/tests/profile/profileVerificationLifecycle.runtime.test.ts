import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveProfileVerificationLifecycleStage } from "../../services/profile/profileVerificationLifecycle.service";

test("user-facing verification lifecycle stages are derived from canonical profile, request, job, and result state", () => {
  assert.equal(deriveProfileVerificationLifecycleStage({ profileStatus: "incomplete" }), "NOT_SUBMITTED");
  assert.equal(deriveProfileVerificationLifecycleStage({ profileStatus: "pending_verification", requestStatus: "PENDING", jobStatus: "PENDING" }), "SUBMITTED");
  assert.equal(deriveProfileVerificationLifecycleStage({ profileStatus: "pending_verification", requestStatus: "PROCESSING", jobStatus: "RUNNING" }), "PROCESSING");
  assert.equal(deriveProfileVerificationLifecycleStage({ profileStatus: "pending_verification", requestStatus: "PROCESSING", jobStatus: "COMPLETED", hasCompletedInference: true }), "AI_COMPLETED_AWAITING_ADMIN");
  assert.equal(deriveProfileVerificationLifecycleStage({ profileStatus: "pending_verification", requestStatus: "ADMIN_REVIEW_REQUIRED", jobStatus: "FAILED" }), "MANUAL_REVIEW");
  assert.equal(deriveProfileVerificationLifecycleStage({ profileStatus: "rejected" }), "REJECTED");
  assert.equal(deriveProfileVerificationLifecycleStage({ profileStatus: "verified" }), "VERIFIED");
});
