import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { ImageTemporaryUploadError, ImageTemporaryUploadService } from "../../services/imageModeration/imageTemporaryUpload.service";
const service = new ImageTemporaryUploadService(undefined, undefined, (async () => { throw new Error("must not upload"); }) as never, (async () => undefined) as never);
const input = { actorId: new Types.ObjectId(), role: "user", bytes: Buffer.from("invalid") };
test("I4 rejects invalid surface and creator surface before any upload", async () => {
  await assert.rejects(() => service.submit({ ...input, surface: "NOT_A_SURFACE" }), (error: unknown) => error instanceof ImageTemporaryUploadError && error.code === "INVALID_SURFACE");
  await assert.rejects(() => service.submit({ ...input, surface: "CREATOR_SERVICE_MEDIA" }), (error: unknown) => error instanceof ImageTemporaryUploadError && error.code === "FORBIDDEN_SURFACE");
});
test("I4 rejects corrupt bytes before Cloudinary and creates no authority", async () => {
  await assert.rejects(() => service.submit({ ...input, surface: "USER_PROFILE_AVATAR" }), (error: unknown) => error instanceof ImageTemporaryUploadError && error.code === "INVALID_IMAGE");
});
