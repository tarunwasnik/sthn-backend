import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";

import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { faceVerificationEvidenceRepository } from "../../repositories/faceVerificationEvidence.repository";
import { reconcileFaceVerificationEvidenceRetention } from "../../services/profile/faceVerificationEvidenceCleanup.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
const storage = require("../../services/profile/faceVerificationEvidenceStorage.service") as { deleteFaceVerificationEvidence: (value: string) => Promise<"DELETED" | "ALREADY_MISSING" | "RETRYABLE_FAILURE" | "PROVIDER_FAILURE"> };
const originalDelete = storage.deleteFaceVerificationEvidence;
before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => { await clearPhase7HDatabase(); storage.deleteFaceVerificationEvidence = originalDelete; });
after(async () => { storage.deleteFaceVerificationEvidence = originalDelete; await disconnectPhase7HDatabase(); }, { timeout: 30_000 });

const evidence = async (suffix: string, cleanupAfter: Date) => FaceVerificationEvidence.create({ evidenceReference: `FACE_EVIDENCE_RETENTION_${suffix}`, sessionId: new Types.ObjectId(), userId: new Types.ObjectId(), profileId: new Types.ObjectId(), challengeIndex: 0, challenge: "NEUTRAL", cloudinaryPublicId: `opaque-${suffix}`, cloudinaryResourceType: "image", status: "STORED", mimeType: "image/jpeg", bytes: 10, format: "jpeg", cleanupAfter });

test("only one concurrent due-evidence claim wins", async () => {
  const item = await evidence("claim", new Date(Date.now() - 1));
  const [left, right] = await Promise.all([faceVerificationEvidenceRepository.claimDueForDeletion(item._id, new Date()), faceVerificationEvidenceRepository.claimDueForDeletion(item._id, new Date())]);
  assert.equal([left, right].filter(Boolean).length, 1);
  assert.equal((await FaceVerificationEvidence.findById(item._id))?.status, "DELETE_PENDING");
});

for (const outcome of ["DELETED", "ALREADY_MISSING", "RETRYABLE_FAILURE", "PROVIDER_FAILURE"] as const) {
  test(`cleanup honors ${outcome} without leaking provider metadata`, async () => {
    const item = await evidence(outcome, new Date(Date.now() - 1));
    storage.deleteFaceVerificationEvidence = async () => outcome;
    const report = await reconcileFaceVerificationEvidenceRetention(new Date());
    const reloaded = await FaceVerificationEvidence.findById(item._id);
    assert.equal("publicId" in report, false);
    if (outcome === "DELETED" || outcome === "ALREADY_MISSING") { assert.equal(reloaded?.status, "DELETED"); assert.ok(reloaded?.deletedAt); }
    else { assert.notEqual(reloaded?.status, "DELETED"); assert.equal(reloaded?.deletedAt, undefined); }
  });
}

test("future STORED evidence is neither selected nor claimed", async () => {
  const item = await evidence("future", new Date(Date.now() + 60_000));
  assert.equal((await faceVerificationEvidenceRepository.listDueForCleanup(new Date())).length, 0);
  assert.equal(await faceVerificationEvidenceRepository.claimDueForDeletion(item._id, new Date()), null);
  assert.equal((await FaceVerificationEvidence.findById(item._id))?.status, "STORED");
});
