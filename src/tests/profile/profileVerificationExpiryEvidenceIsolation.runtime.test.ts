import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { ProfileVerificationRequest } from "../../models/profileVerificationRequest.model";
import { FaceVerificationSession } from "../../models/faceVerificationSession.model";
import { FaceVerificationEvidence } from "../../models/faceVerificationEvidence.model";
import { upsertProfile } from "../../controllers/profile.controller";
import { ProfileVerificationInferenceError } from "../../errors/profile/ProfileVerificationInferenceError";
import { readProfileVerificationEvidenceBytes } from "../../services/profile/faceVerificationEvidenceRead.service";
import { FaceVerificationEvidenceStorageReader } from "../../services/profile/faceVerificationEvidenceStorage.service";
import { acceptFaceVerificationCapture, startFaceVerificationSession } from "../../services/profile/faceVerificationSession.service";
import { expireProfileVerificationRequests } from "../../services/profile/profileVerificationRequest.service";
import { FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS } from "../../services/profile/faceVerification.constants";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const storage = require("../../services/profile/faceVerificationEvidenceStorage.service") as {
  storeFaceVerificationEvidence: (input: { buffer: Buffer; publicId: string }) => Promise<unknown>;
};
const originalStore = storage.storeFaceVerificationEvidence;
const avatar = "https://example.test/evidence-isolation-avatar.jpg";
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const captureFile = (index: number) => ({ buffer: Buffer.from([0xff, 0xd8, 0xff, index]), mimetype: "image/jpeg", size: 4, originalname: "capture.jpg" }) as Express.Multer.File;
const submission = {
  username: "evidence-isolation", realName: "Evidence Isolation", dateOfBirth: "1990-01-01",
  mobileCountryCode: "+91", mobileNumber: "9876543210", country: "India", city: "Mumbai",
  languages: ["English"], interests: [], bio: "Cross-attempt evidence isolation.", avatar,
  cover: "https://example.test/cover.jpg", profilePhotos: ["https://example.test/one.jpg", "https://example.test/two.jpg"],
};
const invokeSubmission = (user: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
  const response = { status: () => response, json: () => { resolve(); return response; } } as unknown as Response;
  upsertProfile({ user, body: submission } as unknown as Request, response, reject as NextFunction);
});
const completeSession = async (userId: string, sessionReference: string) => {
  for (let index = 0; index < 5; index += 1) {
    await acceptFaceVerificationCapture({ userId, sessionReference, challengeIndex: String(index), file: captureFile(index) });
  }
};
const countedReader = (): { reader: FaceVerificationEvidenceStorageReader; calls: () => number } => {
  let count = 0;
  return {
    reader: async () => { count += 1; return { bytes: Buffer.from(jpeg), byteLength: jpeg.length, contentType: "image/jpeg" }; },
    calls: () => count,
  };
};

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => {
  await clearPhase7HDatabase();
  storage.storeFaceVerificationEvidence = async (input) => ({ publicId: input.publicId, bytes: input.buffer.length, format: "jpeg", mimeType: "image/jpeg" });
});
after(async () => {
  storage.storeFaceVerificationEvidence = originalStore;
  await disconnectPhase7HDatabase();
}, { timeout: 30_000 });

test("expired V1 evidence remains physically present but cannot satisfy fresh V2 protected evidence authority", async () => {
  const user = await User.create({ email: "evidence-isolation@test.local", password: "test-password", status: "pending_profile", governanceState: "ACTIVE" });
  const s1 = await startFaceVerificationSession({ userId: String(user._id), avatar });
  await completeSession(String(user._id), s1.sessionReference);
  await invokeSubmission({ id: String(user._id), role: "user", status: "pending_profile" });

  const profileAfterV1 = await UserProfile.findById(s1.profileId);
  const v1 = await ProfileVerificationRequest.findOne({ profileId: s1.profileId, isActive: true });
  assert.equal(profileAfterV1?.verificationSubmissionVersion, 1);
  assert.equal(v1?.profileSubmissionVersion, 1);
  assert.equal((await FaceVerificationSession.findById(s1._id))?.status, "CAPTURE_COMPLETE");
  assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: s1._id, verificationRequestId: v1?._id, status: "STORED" }), 5);

  const v1Reader = countedReader();
  const v1Read = await readProfileVerificationEvidenceBytes({ verificationRequestId: String(v1?._id), storageReader: v1Reader.reader });
  assert.deepEqual(v1Read.evidence?.map((item) => item.challengeIndex), [0, 1, 2, 3, 4]);
  assert.equal(v1Reader.calls(), 5);

  await expireProfileVerificationRequests(new Date(v1!.submittedAt.getTime() + FACE_VERIFICATION_REQUEST_MAX_RETENTION_MS));
  const [expiredV1, expiredS1] = await Promise.all([ProfileVerificationRequest.findById(v1!._id), FaceVerificationSession.findById(s1._id)]);
  assert.equal(expiredV1?.status, "EXPIRED");
  assert.equal(expiredV1?.isActive, false);
  assert.equal(expiredS1?.isCurrent, false);
  assert.equal(expiredS1?.invalidationCode, "REQUEST_RETENTION_EXPIRED");
  assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: s1._id, status: "STORED" }), 5);

  const expiredReader = countedReader();
  const expiredRead = await readProfileVerificationEvidenceBytes({ verificationRequestId: String(v1!._id), storageReader: expiredReader.reader });
  assert.equal(expiredRead.evidence, null);
  assert.equal(expiredRead.noOp, "TERMINAL_REQUEST");
  assert.equal(expiredReader.calls(), 0);

  const recoveredProfile = await UserProfile.findById(s1.profileId);
  assert.equal(recoveredProfile?.profileStatus, "incomplete");
  assert.equal(recoveredProfile?.verificationSubmissionVersion, 1);
  const s2 = await startFaceVerificationSession({ userId: String(user._id), avatar });
  assert.notEqual(String(s2._id), String(s1._id));
  assert.equal(s2.profileSubmissionVersion, 2);
  await completeSession(String(user._id), s2.sessionReference);
  await invokeSubmission({ id: String(user._id), role: "user", status: "active" });

  const [v2, persistedV2, e2] = await Promise.all([
    ProfileVerificationRequest.findOne({ profileId: s2.profileId, isActive: true }),
    UserProfile.findById(s2.profileId),
    FaceVerificationEvidence.find({ sessionId: s2._id, status: "STORED" }).sort({ challengeIndex: 1 }).exec(),
  ]);
  assert.notEqual(String(v2?._id), String(v1?._id));
  assert.equal(persistedV2?.verificationSubmissionVersion, 2);
  assert.equal(v2?.profileSubmissionVersion, 2);
  assert.equal(e2.length, 5);
  assert.ok(e2.every((record, index) => record.challengeIndex === index && String(record.verificationRequestId) === String(v2?._id) && String(record.sessionId) === String(s2._id)));

  const v2Reader = countedReader();
  const v2Read = await readProfileVerificationEvidenceBytes({ verificationRequestId: String(v2?._id), storageReader: v2Reader.reader });
  assert.deepEqual(v2Read.evidence?.map((item) => item.challengeIndex), [0, 1, 2, 3, 4]);
  assert.equal(v2Read.evidence?.length, 5);
  assert.equal(v2Reader.calls(), 5);
  assert.equal(JSON.stringify(v2Read.evidence?.map(({ challengeIndex, challenge, mimeType, format, byteLength }) => ({ challengeIndex, challenge, mimeType, format, byteLength }))).match(/url|publicid|assetid|credential/i), null);

  await FaceVerificationEvidence.deleteOne({ sessionId: s2._id, challengeIndex: 4 });
  const mixedReader = countedReader();
  await assert.rejects(
    () => readProfileVerificationEvidenceBytes({ verificationRequestId: String(v2?._id), storageReader: mixedReader.reader }),
    (error: unknown) => error instanceof ProfileVerificationInferenceError && error.code === "EVIDENCE_INCOMPLETE",
  );
  assert.equal(mixedReader.calls(), 0);
  assert.equal(await FaceVerificationEvidence.countDocuments({ sessionId: s1._id, challengeIndex: 4, status: "STORED" }), 1);
});
