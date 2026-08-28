"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const express_1 = __importDefault(require("express"));
const User_1 = __importDefault(require("../../models/User"));
const booking_model_1 = require("../../models/booking.model");
const dispute_model_1 = require("../../models/dispute.model");
const disputeDirectEvidence_model_1 = require("../../models/disputeDirectEvidence.model");
const adminDispute_controller_1 = require("../../controllers/adminDispute.controller");
const disputeDirectEvidence_controller_1 = require("../../controllers/disputeDirectEvidence.controller");
const disputeInvestigation_controller_1 = require("../../controllers/disputeInvestigation.controller");
const upload_middleware_1 = require("../../middlewares/upload.middleware");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
const uploadUtility = require("../../utils/uploadToCloudinary");
const cloudinary = require("../../config/cloudinary").default;
const originalUpload = uploadUtility.uploadToCloudinary;
const originalDestroy = cloudinary.uploader.destroy;
let uploadCount = 0;
let destroyed = [];
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
    uploadCount = 0;
    destroyed = [];
    uploadUtility.uploadToCloudinary = async (_buffer, _folder, resourceType) => ({ secure_url: `https://storage.test/${++uploadCount}`, public_id: `${resourceType}-evidence-${uploadCount}` });
    cloudinary.uploader.destroy = async (publicId, options) => { destroyed.push({ publicId, resourceType: options.resource_type }); return { result: "ok" }; };
});
(0, node_test_1.after)(async () => {
    uploadUtility.uploadToCloudinary = originalUpload;
    cloudinary.uploader.destroy = originalDestroy;
    await (0, database_1.disconnectPhase7HDatabase)();
}, { timeout: 30000 });
function response() {
    const result = {};
    result.response = {
        status: (code) => { result.statusCode = code; return result.response; },
        json: (body) => { result.body = body; return result.response; },
    };
    return result;
}
function file(type, overrides = {}) {
    return {
        buffer: Buffer.from("direct evidence"),
        originalname: overrides.originalname ?? (type === "IMAGE" ? "proof.png" : "proof.pdf"),
        mimetype: overrides.mimetype ?? (type === "IMAGE" ? "image/png" : "application/pdf"),
        size: overrides.size ?? 15,
    };
}
async function fixture() {
    const suffix = new mongoose_1.Types.ObjectId().toString();
    const [customer, creator, admin, stranger] = await Promise.all([
        User_1.default.create({ email: `di2d-customer-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }),
        User_1.default.create({ email: `di2d-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }),
        User_1.default.create({ email: `di2d-admin-${suffix}@test.local`, password: "test", role: "admin", status: "active", governanceState: "ACTIVE" }),
        User_1.default.create({ email: `di2d-stranger-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }),
    ]);
    const booking = await booking_model_1.Booking.create({
        slotIds: [new mongoose_1.Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new mongoose_1.Types.ObjectId(),
        serviceTitle: "DI-2D service", durationMinutes: 30, price: 100, currency: "INR", status: "CANCELLED",
        paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false,
        expiresAt: new Date(Date.now() + 86400000), hasInteracted: true,
        serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100,
    });
    const unrelatedBooking = await booking_model_1.Booking.create({ ...booking.toObject(), _id: new mongoose_1.Types.ObjectId(), bookingReference: undefined, slotIds: [new mongoose_1.Types.ObjectId()], userId: stranger._id, creatorId: creator._id, serviceId: new mongoose_1.Types.ObjectId() });
    const [dispute, unrelatedDispute] = await Promise.all([
        dispute_model_1.Dispute.create({ bookingId: booking._id, raisedBy: customer._id, raisedByRole: "USER", reason: "DI-2D evidence", status: "OPEN" }),
        dispute_model_1.Dispute.create({ bookingId: unrelatedBooking._id, raisedBy: stranger._id, raisedByRole: "USER", reason: "Other", status: "OPEN" }),
    ]);
    return { customer, creator, admin, stranger, booking, dispute, unrelatedDispute };
}
async function upload(handler, actor, disputeId, type, body = {}, fileOverrides = {}) {
    const result = response();
    await handler({ user: actor ? { id: String(actor._id), role: actor.role } : undefined, params: { disputeId }, body, file: file(type, fileOverrides) }, result.response);
    return result;
}
async function participantRead(actor, disputeId) {
    const result = response();
    await (0, disputeInvestigation_controller_1.getParticipantInvestigation)({ user: { id: String(actor._id) }, params: { disputeId }, query: {} }, result.response);
    return result.body;
}
async function multipartResult(kind, mimeType, fileName, size = 4) {
    const app = (0, express_1.default)();
    const middleware = kind === "IMAGE" ? upload_middleware_1.chatImageUpload : upload_middleware_1.chatDocumentUpload;
    app.post("/", middleware.single("file"), (req, res) => res.status(201).json({ mimeType: req.file?.mimetype, size: req.file?.size }));
    app.use((error, _req, res, _next) => res.status(400).json({ message: error.message }));
    const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    try {
        const address = server.address();
        strict_1.default.ok(address && typeof address !== "string");
        const form = new FormData();
        form.set("file", new Blob([Buffer.alloc(size)], { type: mimeType }), fileName);
        const result = await fetch(`http://127.0.0.1:${address.port}/`, { method: "POST", body: form });
        return { status: result.status, body: await result.json() };
    }
    finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}
(0, node_test_1.test)("DI-2D derives Customer and Creator direct-upload identity from the Booking and guards their branches", async () => {
    const data = await fixture();
    const customerImage = await upload(disputeDirectEvidence_controller_1.uploadParticipantImage, data.customer, String(data.dispute._id), "IMAGE", { source: "ADMIN", uploadedBy: String(data.admin._id), audience: "BOTH", url: "https://forged.test" });
    const creatorDocument = await upload(disputeDirectEvidence_controller_1.uploadParticipantDocument, data.creator, String(data.dispute._id), "DOCUMENT", { source: "CUSTOMER", audience: "CREATOR" });
    strict_1.default.equal(customerImage.statusCode, 201);
    strict_1.default.equal(creatorDocument.statusCode, 201);
    const records = await disputeDirectEvidence_model_1.DisputeDirectEvidence.find({ disputeId: data.dispute._id }).sort({ createdAt: 1 }).lean();
    strict_1.default.equal(records.length, 2);
    strict_1.default.deepEqual(records.map((record) => ({ source: record.source, uploadedBy: String(record.uploadedBy), type: record.type, audience: record.audience })), [
        { source: "CUSTOMER", uploadedBy: String(data.customer._id), type: "IMAGE", audience: undefined },
        { source: "CREATOR", uploadedBy: String(data.creator._id), type: "DOCUMENT", audience: undefined },
    ]);
    strict_1.default.equal(records.every((record) => record.url.startsWith("https://storage.test/") && record.evidenceReference.startsWith("DISPUTE_DIRECT_EVIDENCE_") && record.createdAt instanceof Date), true);
    data.dispute.customerInput.state = "CLOSED";
    await data.dispute.save();
    await strict_1.default.rejects(() => upload(disputeDirectEvidence_controller_1.uploadParticipantImage, data.customer, String(data.dispute._id), "IMAGE"), /input is closed/);
    await strict_1.default.rejects(() => upload(disputeDirectEvidence_controller_1.uploadParticipantImage, data.stranger, String(data.dispute._id), "IMAGE"), /Access denied/);
    await strict_1.default.rejects(() => upload(disputeDirectEvidence_controller_1.uploadParticipantImage, data.customer, String(data.unrelatedDispute._id), "IMAGE"), /Access denied/);
    data.dispute.status = "RESOLVED";
    await data.dispute.save();
    await strict_1.default.rejects(() => upload(disputeDirectEvidence_controller_1.uploadParticipantDocument, data.creator, String(data.dispute._id), "DOCUMENT"), /OPEN dispute/);
    data.dispute.status = "REJECTED";
    await data.dispute.save();
    await strict_1.default.rejects(() => upload(disputeDirectEvidence_controller_1.uploadParticipantDocument, data.customer, String(data.dispute._id), "DOCUMENT"), /OPEN dispute/);
});
(0, node_test_1.test)("DI-2D filters participant direct evidence strictly by branch and Admin audience", async () => {
    const data = await fixture();
    const make = async (source, audience) => disputeDirectEvidence_model_1.DisputeDirectEvidence.create({ disputeId: data.dispute._id, bookingId: data.booking._id, source, uploadedBy: source === "CUSTOMER" ? data.customer._id : source === "CREATOR" ? data.creator._id : data.admin._id, type: "IMAGE", ...(audience ? { audience } : {}), url: `https://storage.test/${source}-${audience ?? "private"}`, publicId: `${source}-${audience ?? "private"}`, fileName: "proof.png", mimeType: "image/png", fileSize: 1 });
    await make("CUSTOMER");
    await make("CREATOR");
    await make("ADMIN", "ADMIN_ONLY");
    await make("ADMIN", "CUSTOMER");
    await make("ADMIN", "CREATOR");
    await make("ADMIN", "BOTH");
    const customer = await participantRead(data.customer, String(data.dispute._id));
    const creator = await participantRead(data.creator, String(data.dispute._id));
    strict_1.default.deepEqual(customer.directEvidence.map((item) => item.url), ["https://storage.test/CUSTOMER-private", "https://storage.test/ADMIN-CUSTOMER", "https://storage.test/ADMIN-BOTH"]);
    strict_1.default.deepEqual(creator.directEvidence.map((item) => item.url), ["https://storage.test/CREATOR-private", "https://storage.test/ADMIN-CREATOR", "https://storage.test/ADMIN-BOTH"]);
    strict_1.default.equal(JSON.stringify(customer.directEvidence).includes("publicId"), false);
});
(0, node_test_1.test)("DI-2D Admin uploads accept only explicit audiences, remain independent of participant input closure, and Admin reads all safe evidence", async () => {
    const data = await fixture();
    data.dispute.customerInput.state = "CLOSED";
    data.dispute.creatorInput.state = "CLOSED";
    await data.dispute.save();
    for (const [type, audience] of [["IMAGE", "ADMIN_ONLY"], ["DOCUMENT", "ADMIN_ONLY"], ["IMAGE", "CUSTOMER"], ["DOCUMENT", "CREATOR"], ["IMAGE", "BOTH"]]) {
        const result = await upload(type === "IMAGE" ? disputeDirectEvidence_controller_1.uploadAdminImage : disputeDirectEvidence_controller_1.uploadAdminDocument, data.admin, String(data.dispute._id), type, { audience, source: "CUSTOMER", uploadedBy: String(data.customer._id) });
        strict_1.default.equal(result.statusCode, 201);
        strict_1.default.equal(result.body.evidence.audience, audience);
    }
    await strict_1.default.rejects(() => upload(disputeDirectEvidence_controller_1.uploadAdminImage, data.admin, String(data.dispute._id), "IMAGE", { audience: "FORGED" }), /audience is required/);
    const stored = await disputeDirectEvidence_model_1.DisputeDirectEvidence.find({ disputeId: data.dispute._id, source: "ADMIN" }).lean();
    strict_1.default.equal(stored.length, 5);
    strict_1.default.equal(stored.every((item) => String(item.uploadedBy) === String(data.admin._id)), true);
    const adminRead = response();
    await (0, adminDispute_controller_1.getAdminDisputeInvestigation)({ params: { disputeId: String(data.dispute._id) }, query: {} }, adminRead.response);
    strict_1.default.equal(adminRead.body.adminEvidence.length, 5);
    strict_1.default.deepEqual(new Set(adminRead.body.adminEvidence.map((item) => item.audience)), new Set(["ADMIN_ONLY", "CUSTOMER", "CREATOR", "BOTH"]));
    strict_1.default.equal(JSON.stringify(adminRead.body).includes("publicId"), false);
    data.dispute.status = "RESOLVED";
    await data.dispute.save();
    await strict_1.default.rejects(() => upload(disputeDirectEvidence_controller_1.uploadAdminImage, data.admin, String(data.dispute._id), "IMAGE", { audience: "BOTH" }), /OPEN dispute/);
    data.dispute.status = "REJECTED";
    await data.dispute.save();
    await strict_1.default.rejects(() => upload(disputeDirectEvidence_controller_1.uploadAdminDocument, data.admin, String(data.dispute._id), "DOCUMENT", { audience: "BOTH" }), /OPEN dispute/);
});
(0, node_test_1.test)("DI-2D storage cleanup runs when immutable evidence persistence fails and never reports false success", async () => {
    const data = await fixture();
    const originalCreate = disputeDirectEvidence_model_1.DisputeDirectEvidence.create;
    disputeDirectEvidence_model_1.DisputeDirectEvidence.create = (async () => { throw new Error("persistence failed"); });
    try {
        await strict_1.default.rejects(() => upload(disputeDirectEvidence_controller_1.uploadParticipantDocument, data.customer, String(data.dispute._id), "DOCUMENT"), /persistence failed/);
        strict_1.default.deepEqual(destroyed, [{ publicId: "raw-evidence-1", resourceType: "raw" }]);
        strict_1.default.equal(await disputeDirectEvidence_model_1.DisputeDirectEvidence.countDocuments({ disputeId: data.dispute._id }), 0);
    }
    finally {
        disputeDirectEvidence_model_1.DisputeDirectEvidence.create = originalCreate;
    }
});
(0, node_test_1.test)("DI-2D routes retain the existing bounded MIME/size middleware and expose no evidence mutation route", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const disputeRoutes = fs.readFileSync(path.resolve(__dirname, "../../routes/v1/dispute.routes.ts"), "utf8");
    const adminRoutes = fs.readFileSync(path.resolve(__dirname, "../../routes/v1/admin.routes.ts"), "utf8");
    const uploadMiddleware = fs.readFileSync(path.resolve(__dirname, "../../middlewares/upload.middleware.ts"), "utf8");
    strict_1.default.match(disputeRoutes, /chatImageUpload\.single\("file"\).*uploadParticipantImage/);
    strict_1.default.match(disputeRoutes, /chatDocumentUpload\.single\("file"\).*uploadParticipantDocument/);
    strict_1.default.match(adminRoutes, /authorizeRoles\("admin"\).*chatImageUpload\.single\("file"\).*uploadAdminImage/);
    strict_1.default.match(adminRoutes, /authorizeRoles\("admin"\).*chatDocumentUpload\.single\("file"\).*uploadAdminDocument/);
    strict_1.default.match(uploadMiddleware, /image\/png/);
    strict_1.default.match(uploadMiddleware, /application\/pdf/);
    strict_1.default.match(uploadMiddleware, /fileSize:\s*10 \* 1024 \* 1024/);
    strict_1.default.doesNotMatch(uploadMiddleware, /video\//);
    strict_1.default.doesNotMatch(uploadMiddleware, /audio\//);
    strict_1.default.doesNotMatch(disputeRoutes, /\.patch\([^\n]*evidence|\.delete\([^\n]*evidence/i);
    strict_1.default.doesNotMatch(adminRoutes, /\.patch\([^\n]*evidence|\.delete\([^\n]*evidence/i);
});
(0, node_test_1.test)("DI-2D existing multipart middleware accepts supported files and safely rejects video, audio, and oversize files", async () => {
    const image = await multipartResult("IMAGE", "image/png", "proof.png");
    const document = await multipartResult("DOCUMENT", "application/pdf", "proof.pdf");
    const video = await multipartResult("IMAGE", "video/mp4", "proof.mp4");
    const audio = await multipartResult("DOCUMENT", "audio/mpeg", "proof.mp3");
    const oversize = await multipartResult("IMAGE", "image/png", "large.png", (10 * 1024 * 1024) + 1);
    strict_1.default.equal(image.status, 201);
    strict_1.default.equal(document.status, 201);
    strict_1.default.equal(video.status, 400);
    strict_1.default.match(video.body.message ?? "", /Unsupported image type/);
    strict_1.default.equal(audio.status, 400);
    strict_1.default.match(audio.body.message ?? "", /Unsupported document type/);
    strict_1.default.equal(oversize.status, 400);
    strict_1.default.equal(oversize.body.message, "File too large");
});
