import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import express from "express";
import type { Request, Response } from "express";

import User from "../../models/User";
import { Booking } from "../../models/booking.model";
import { Dispute } from "../../models/dispute.model";
import { DisputeDirectEvidence } from "../../models/disputeDirectEvidence.model";
import { getAdminDisputeInvestigation } from "../../controllers/adminDispute.controller";
import { uploadAdminDocument, uploadAdminImage, uploadParticipantDocument, uploadParticipantImage } from "../../controllers/disputeDirectEvidence.controller";
import { getParticipantInvestigation } from "../../controllers/disputeInvestigation.controller";
import { chatDocumentUpload, chatImageUpload } from "../../middlewares/upload.middleware";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

type MockResponse = { body?: any; statusCode?: number; response: Response };
type Actor = { _id: Types.ObjectId; role?: string };
type EvidenceType = "IMAGE" | "DOCUMENT";

const uploadUtility = require("../../utils/uploadToCloudinary") as { uploadToCloudinary: (buffer: Buffer, folder: string, resourceType: string) => Promise<{ secure_url: string; public_id: string }> };
const cloudinary = require("../../config/cloudinary").default as { uploader: { destroy: (publicId: string, options: { resource_type: string }) => Promise<unknown> } };
const originalUpload = uploadUtility.uploadToCloudinary;
const originalDestroy = cloudinary.uploader.destroy;
let uploadCount = 0;
let destroyed: Array<{ publicId: string; resourceType: string }> = [];

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => {
  await clearPhase7HDatabase();
  uploadCount = 0;
  destroyed = [];
  uploadUtility.uploadToCloudinary = async (_buffer, _folder, resourceType) => ({ secure_url: `https://storage.test/${++uploadCount}`, public_id: `${resourceType}-evidence-${uploadCount}` });
  cloudinary.uploader.destroy = async (publicId, options) => { destroyed.push({ publicId, resourceType: options.resource_type }); return { result: "ok" }; };
});
after(async () => {
  uploadUtility.uploadToCloudinary = originalUpload;
  cloudinary.uploader.destroy = originalDestroy;
  await disconnectPhase7HDatabase();
}, { timeout: 30_000 });

function response(): MockResponse {
  const result = {} as MockResponse;
  result.response = {
    status: (code: number) => { result.statusCode = code; return result.response; },
    json: (body: unknown) => { result.body = body; return result.response; },
  } as unknown as Response;
  return result;
}

function file(type: EvidenceType, overrides: Partial<{ originalname: string; mimetype: string; size: number }> = {}) {
  return {
    buffer: Buffer.from("direct evidence"),
    originalname: overrides.originalname ?? (type === "IMAGE" ? "proof.png" : "proof.pdf"),
    mimetype: overrides.mimetype ?? (type === "IMAGE" ? "image/png" : "application/pdf"),
    size: overrides.size ?? 15,
  };
}

async function fixture() {
  const suffix = new Types.ObjectId().toString();
  const [customer, creator, admin, stranger] = await Promise.all([
    User.create({ email: `di2d-customer-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }),
    User.create({ email: `di2d-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }),
    User.create({ email: `di2d-admin-${suffix}@test.local`, password: "test", role: "admin", status: "active", governanceState: "ACTIVE" }),
    User.create({ email: `di2d-stranger-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }),
  ]);
  const booking = await Booking.create({
    slotIds: [new Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new Types.ObjectId(),
    serviceTitle: "DI-2D service", durationMinutes: 30, price: 100, currency: "INR", status: "CANCELLED",
    paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false,
    expiresAt: new Date(Date.now() + 86_400_000), hasInteracted: true,
    serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100,
  });
  const unrelatedBooking = await Booking.create({ ...booking.toObject(), _id: new Types.ObjectId(), bookingReference: undefined, slotIds: [new Types.ObjectId()], userId: stranger._id, creatorId: creator._id, serviceId: new Types.ObjectId() });
  const [dispute, unrelatedDispute] = await Promise.all([
    Dispute.create({ bookingId: booking._id, raisedBy: customer._id, raisedByRole: "USER", reason: "DI-2D evidence", status: "OPEN" }),
    Dispute.create({ bookingId: unrelatedBooking._id, raisedBy: stranger._id, raisedByRole: "USER", reason: "Other", status: "OPEN" }),
  ]);
  return { customer, creator, admin, stranger, booking, dispute, unrelatedDispute };
}

async function upload(handler: (req: Request, res: Response) => Promise<unknown>, actor: Actor | undefined, disputeId: string, type: EvidenceType, body: Record<string, unknown> = {}, fileOverrides: Partial<{ originalname: string; mimetype: string; size: number }> = {}) {
  const result = response();
  await handler({ user: actor ? { id: String(actor._id), role: actor.role } : undefined, params: { disputeId }, body, file: file(type, fileOverrides) } as unknown as Request, result.response);
  return result;
}

async function participantRead(actor: Actor, disputeId: string) {
  const result = response();
  await getParticipantInvestigation({ user: { id: String(actor._id) }, params: { disputeId }, query: {} } as unknown as Request, result.response);
  return result.body;
}

async function multipartResult(kind: "IMAGE" | "DOCUMENT", mimeType: string, fileName: string, size = 4) {
  const app = express();
  const middleware = kind === "IMAGE" ? chatImageUpload : chatDocumentUpload;
  app.post("/", middleware.single("file"), (req, res) => res.status(201).json({ mimeType: req.file?.mimetype, size: req.file?.size }));
  app.use((error: Error, _req: Request, res: Response, _next: express.NextFunction) => res.status(400).json({ message: error.message }));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const form = new FormData();
    form.set("file", new Blob([Buffer.alloc(size)], { type: mimeType }), fileName);
    const result = await fetch(`http://127.0.0.1:${address.port}/`, { method: "POST", body: form });
    return { status: result.status, body: await result.json() as { message?: string; mimeType?: string; size?: number } };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("DI-2D derives Customer and Creator direct-upload identity from the Booking and guards their branches", async () => {
  const data = await fixture();
  const customerImage = await upload(uploadParticipantImage, data.customer, String(data.dispute._id), "IMAGE", { source: "ADMIN", uploadedBy: String(data.admin._id), audience: "BOTH", url: "https://forged.test" });
  const creatorDocument = await upload(uploadParticipantDocument, data.creator, String(data.dispute._id), "DOCUMENT", { source: "CUSTOMER", audience: "CREATOR" });
  assert.equal(customerImage.statusCode, 201);
  assert.equal(creatorDocument.statusCode, 201);
  const records = await DisputeDirectEvidence.find({ disputeId: data.dispute._id }).sort({ createdAt: 1 }).lean();
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => ({ source: record.source, uploadedBy: String(record.uploadedBy), type: record.type, audience: record.audience })), [
    { source: "CUSTOMER", uploadedBy: String(data.customer._id), type: "IMAGE", audience: undefined },
    { source: "CREATOR", uploadedBy: String(data.creator._id), type: "DOCUMENT", audience: undefined },
  ]);
  assert.equal(records.every((record) => record.url.startsWith("https://storage.test/") && record.evidenceReference.startsWith("DISPUTE_DIRECT_EVIDENCE_") && record.createdAt instanceof Date), true);

  data.dispute.customerInput.state = "CLOSED";
  await data.dispute.save();
  await assert.rejects(() => upload(uploadParticipantImage, data.customer, String(data.dispute._id), "IMAGE"), /input is closed/);
  await assert.rejects(() => upload(uploadParticipantImage, data.stranger, String(data.dispute._id), "IMAGE"), /Access denied/);
  await assert.rejects(() => upload(uploadParticipantImage, data.customer, String(data.unrelatedDispute._id), "IMAGE"), /Access denied/);
  data.dispute.status = "RESOLVED";
  await data.dispute.save();
  await assert.rejects(() => upload(uploadParticipantDocument, data.creator, String(data.dispute._id), "DOCUMENT"), /OPEN dispute/);
  data.dispute.status = "REJECTED";
  await data.dispute.save();
  await assert.rejects(() => upload(uploadParticipantDocument, data.customer, String(data.dispute._id), "DOCUMENT"), /OPEN dispute/);
});

test("DI-2D filters participant direct evidence strictly by branch and Admin audience", async () => {
  const data = await fixture();
  const make = async (source: "CUSTOMER" | "CREATOR" | "ADMIN", audience?: "ADMIN_ONLY" | "CUSTOMER" | "CREATOR" | "BOTH") => DisputeDirectEvidence.create({ disputeId: data.dispute._id, bookingId: data.booking._id, source, uploadedBy: source === "CUSTOMER" ? data.customer._id : source === "CREATOR" ? data.creator._id : data.admin._id, type: "IMAGE", ...(audience ? { audience } : {}), url: `https://storage.test/${source}-${audience ?? "private"}`, publicId: `${source}-${audience ?? "private"}`, fileName: "proof.png", mimeType: "image/png", fileSize: 1 });
  await make("CUSTOMER"); await make("CREATOR"); await make("ADMIN", "ADMIN_ONLY"); await make("ADMIN", "CUSTOMER"); await make("ADMIN", "CREATOR"); await make("ADMIN", "BOTH");
  const customer = await participantRead(data.customer, String(data.dispute._id));
  const creator = await participantRead(data.creator, String(data.dispute._id));
  assert.deepEqual(customer.directEvidence.map((item: { source: string; url: string }) => item.url), ["https://storage.test/CUSTOMER-private", "https://storage.test/ADMIN-CUSTOMER", "https://storage.test/ADMIN-BOTH"]);
  assert.deepEqual(creator.directEvidence.map((item: { source: string; url: string }) => item.url), ["https://storage.test/CREATOR-private", "https://storage.test/ADMIN-CREATOR", "https://storage.test/ADMIN-BOTH"]);
  assert.equal(JSON.stringify(customer.directEvidence).includes("publicId"), false);
});

test("DI-2D Admin uploads accept only explicit audiences, remain independent of participant input closure, and Admin reads all safe evidence", async () => {
  const data = await fixture();
  data.dispute.customerInput.state = "CLOSED";
  data.dispute.creatorInput.state = "CLOSED";
  await data.dispute.save();
  for (const [type, audience] of [["IMAGE", "ADMIN_ONLY"], ["DOCUMENT", "ADMIN_ONLY"], ["IMAGE", "CUSTOMER"], ["DOCUMENT", "CREATOR"], ["IMAGE", "BOTH"]] as const) {
    const result = await upload(type === "IMAGE" ? uploadAdminImage : uploadAdminDocument, data.admin, String(data.dispute._id), type, { audience, source: "CUSTOMER", uploadedBy: String(data.customer._id) });
    assert.equal(result.statusCode, 201);
    assert.equal(result.body.evidence.audience, audience);
  }
  await assert.rejects(() => upload(uploadAdminImage, data.admin, String(data.dispute._id), "IMAGE", { audience: "FORGED" }), /audience is required/);
  const stored = await DisputeDirectEvidence.find({ disputeId: data.dispute._id, source: "ADMIN" }).lean();
  assert.equal(stored.length, 5);
  assert.equal(stored.every((item) => String(item.uploadedBy) === String(data.admin._id)), true);
  const adminRead = response();
  await getAdminDisputeInvestigation({ params: { disputeId: String(data.dispute._id) }, query: {} } as unknown as Request, adminRead.response);
  assert.equal(adminRead.body.adminEvidence.length, 5);
  assert.deepEqual(new Set(adminRead.body.adminEvidence.map((item: { audience: string }) => item.audience)), new Set(["ADMIN_ONLY", "CUSTOMER", "CREATOR", "BOTH"]));
  assert.equal(JSON.stringify(adminRead.body).includes("publicId"), false);
  data.dispute.status = "RESOLVED";
  await data.dispute.save();
  await assert.rejects(() => upload(uploadAdminImage, data.admin, String(data.dispute._id), "IMAGE", { audience: "BOTH" }), /OPEN dispute/);
  data.dispute.status = "REJECTED";
  await data.dispute.save();
  await assert.rejects(() => upload(uploadAdminDocument, data.admin, String(data.dispute._id), "DOCUMENT", { audience: "BOTH" }), /OPEN dispute/);
});

test("DI-2D storage cleanup runs when immutable evidence persistence fails and never reports false success", async () => {
  const data = await fixture();
  const originalCreate = DisputeDirectEvidence.create;
  DisputeDirectEvidence.create = (async () => { throw new Error("persistence failed"); }) as typeof DisputeDirectEvidence.create;
  try {
    await assert.rejects(() => upload(uploadParticipantDocument, data.customer, String(data.dispute._id), "DOCUMENT"), /persistence failed/);
    assert.deepEqual(destroyed, [{ publicId: "raw-evidence-1", resourceType: "raw" }]);
    assert.equal(await DisputeDirectEvidence.countDocuments({ disputeId: data.dispute._id }), 0);
  } finally {
    DisputeDirectEvidence.create = originalCreate;
  }
});

test("DI-2D routes retain the existing bounded MIME/size middleware and expose no evidence mutation route", async () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const disputeRoutes = fs.readFileSync(path.resolve(__dirname, "../../routes/v1/dispute.routes.ts"), "utf8");
  const adminRoutes = fs.readFileSync(path.resolve(__dirname, "../../routes/v1/admin.routes.ts"), "utf8");
  const uploadMiddleware = fs.readFileSync(path.resolve(__dirname, "../../middlewares/upload.middleware.ts"), "utf8");
  assert.match(disputeRoutes, /chatImageUpload\.single\("file"\).*uploadParticipantImage/);
  assert.match(disputeRoutes, /chatDocumentUpload\.single\("file"\).*uploadParticipantDocument/);
  assert.match(adminRoutes, /authorizeRoles\("admin"\).*chatImageUpload\.single\("file"\).*uploadAdminImage/);
  assert.match(adminRoutes, /authorizeRoles\("admin"\).*chatDocumentUpload\.single\("file"\).*uploadAdminDocument/);
  assert.match(uploadMiddleware, /image\/png/);
  assert.match(uploadMiddleware, /application\/pdf/);
  assert.match(uploadMiddleware, /fileSize:\s*10 \* 1024 \* 1024/);
  assert.doesNotMatch(uploadMiddleware, /video\//);
  assert.doesNotMatch(uploadMiddleware, /audio\//);
  assert.doesNotMatch(disputeRoutes, /\.patch\([^\n]*evidence|\.delete\([^\n]*evidence/i);
  assert.doesNotMatch(adminRoutes, /\.patch\([^\n]*evidence|\.delete\([^\n]*evidence/i);
});

test("DI-2D existing multipart middleware accepts supported files and safely rejects video, audio, and oversize files", async () => {
  const image = await multipartResult("IMAGE", "image/png", "proof.png");
  const document = await multipartResult("DOCUMENT", "application/pdf", "proof.pdf");
  const video = await multipartResult("IMAGE", "video/mp4", "proof.mp4");
  const audio = await multipartResult("DOCUMENT", "audio/mpeg", "proof.mp3");
  const oversize = await multipartResult("IMAGE", "image/png", "large.png", (10 * 1024 * 1024) + 1);
  assert.equal(image.status, 201);
  assert.equal(document.status, 201);
  assert.equal(video.status, 400);
  assert.match(video.body.message ?? "", /Unsupported image type/);
  assert.equal(audio.status, 400);
  assert.match(audio.body.message ?? "", /Unsupported document type/);
  assert.equal(oversize.status, 400);
  assert.equal(oversize.body.message, "File too large");
});
