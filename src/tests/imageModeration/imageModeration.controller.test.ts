import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { submitImageModeration } from "../../controllers/imageModeration.controller";
import { ImageTemporaryUploadError, imageTemporaryUploadService } from "../../services/imageModeration/imageTemporaryUpload.service";
import { AppError } from "../../utils/AppError";

test("I8-H5 maps byte-validation failures to the existing bounded HTTP 400 response", async () => {
  const originalSubmit = imageTemporaryUploadService.submit.bind(imageTemporaryUploadService);
  imageTemporaryUploadService.submit = async () => {
    throw new ImageTemporaryUploadError("INVALID_IMAGE", "Image is invalid or unsupported.", "DECODE_FAILED");
  };
  try {
    const error = await new Promise<unknown>((resolve) => {
      submitImageModeration({
        user: { id: new Types.ObjectId().toString(), role: "user" },
        file: { buffer: Buffer.from("jpeg") },
        body: { surface: "USER_PROFILE_AVATAR" },
      } as never, {} as never, resolve as never);
    });
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.message, "Image is invalid or unsupported.");
    assert.equal(error.code, undefined);
  } finally {
    imageTemporaryUploadService.submit = originalSubmit;
  }
});
