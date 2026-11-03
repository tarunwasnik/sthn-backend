import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { Types } from "mongoose";
import { ADAMCODD_V2_PIPELINE_PROVENANCE } from "../../services/imageModeration/adamCoddV2ImageSafety.service";
import { ImageTemporaryUploadService } from "../../services/imageModeration/imageTemporaryUpload.service";

const image = () => sharp({ create: { width: 32, height: 32, channels: 3, background: "#1677ff" } }).jpeg().toBuffer();
const upload = async (bytes: Buffer, id: string) => ({ secure_url: `https://isolated.test/${id}.jpg`, public_id: id, resource_type: "image" as const, bytes: bytes.length, format: "jpg", original_filename: "ignored" });
const instance = (decision: "PASS" | "BLOCK" | "UNAVAILABLE", observe?: (input: Buffer) => void) => new ImageTemporaryUploadService(
  { registerTrustedTemporaryAsset: async () => ({ _id: new Types.ObjectId(), assetReference: "ima_asset" }), createAttempt: async () => ({ attemptReference: "imat_attempt" }), recordDecision: async () => decision === "PASS" ? { admission: { admissionReference: "imauth_pass", expiresAt: new Date("2030-01-01") } } : { admission: null } } as never,
  { provenance: ADAMCODD_V2_PIPELINE_PROVENANCE, classify: async (bytes: Buffer) => { observe?.(bytes); return { decision, reasonCode: decision === "UNAVAILABLE" ? "IMAGE_SAFETY_UNAVAILABLE" : "IMAGE_POLICY" }; } } as never,
  upload, async () => undefined,
);

test("V2 receives original validated bytes and PASS creates an admission", async () => {
  const bytes = await image(); let received: Buffer | undefined;
  const result = await instance("PASS", (value) => { received = value; }).submit({ actorId: new Types.ObjectId(), role: "user", surface: "USER_PROFILE_AVATAR", bytes });
  assert.equal(result.decision, "PASS"); assert.equal(received, bytes); assert.ok("admissionReference" in result);
});

test("V2 BLOCK and UNAVAILABLE create no admission", async () => {
  for (const decision of ["BLOCK", "UNAVAILABLE"] as const) {
    const result = await instance(decision).submit({ actorId: new Types.ObjectId(), role: "user", surface: "USER_PROFILE_AVATAR", bytes: await image() });
    assert.equal(result.decision, decision); assert.equal("admissionReference" in result, false);
  }
});
