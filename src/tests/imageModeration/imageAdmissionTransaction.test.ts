import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { ImageAdmissionService } from "../../services/imageModeration/imageAdmission.service";
import { imageModerationRepository, ImageAdmissionTransactionError } from "../../repositories/imageModeration.repository";

const service = new ImageAdmissionService();
const actorId = new Types.ObjectId();
const assetId = new Types.ObjectId();
const original = imageModerationRepository.consumePendingInSession;
const request = (session: unknown) => ({ session, admissionReference: "imauth-test", actorId, assetId, contentSha256: "a".repeat(64), surface: "USER_PROFILE_AVATAR" as const, pendingBinding: `PENDING:${actorId}:USER_PROFILE_AVATAR`, destinationBinding: `UserProfile:${actorId}:avatar` });
test.after(() => { imageModerationRepository.consumePendingInSession = original; });

test("missing session rejects before repository mutation", async () => {
  let called = false;
  imageModerationRepository.consumePendingInSession = (async () => { called = true; throw new Error("unexpected"); }) as never;
  await assert.rejects(() => service.consumePendingAdmissionInSession(request(undefined) as never), /active MongoDB transaction/);
  assert.equal(called, false);
});

test("inactive session rejects", async () => {
  await assert.rejects(() => service.consumePendingAdmissionInSession(request({ inTransaction: () => false }) as never), /active MongoDB transaction/);
});

test("active session propagates trusted binding and returns trusted media reference", async () => {
  let seen: { session: unknown } | undefined;
  imageModerationRepository.consumePendingInSession = (async (value: { session: unknown }) => { seen = value; return { asset: { trustedMediaReference: "https://trusted.example/media" } }; }) as never;
  const session = { inTransaction: () => true };
  const result = await service.consumePendingAdmissionInSession(request(session) as never);
  assert.deepEqual(result, { trustedMediaReference: "https://trusted.example/media" });
  assert.equal(seen?.session, session);
});

test("failed asset promotion propagates instead of returning success", async () => {
  imageModerationRepository.consumePendingInSession = (async () => { throw new ImageAdmissionTransactionError("IMAGE_ADMISSION_ASSET_NOT_PROMOTABLE"); }) as never;
  await assert.rejects(() => service.consumePendingAdmissionInSession(request({ inTransaction: () => true }) as never), (error: unknown) => error instanceof ImageAdmissionTransactionError && error.code === "IMAGE_ADMISSION_ASSET_NOT_PROMOTABLE");
});
