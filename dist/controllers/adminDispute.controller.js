"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAdminDisputes = listAdminDisputes;
exports.getAdminDispute = getAdminDispute;
exports.addAdminDisputeFinding = addAdminDisputeFinding;
exports.finalizeAdminDispute = finalizeAdminDispute;
exports.setAdminDisputeInputAccess = setAdminDisputeInputAccess;
exports.createAdminDisputeRequest = createAdminDisputeRequest;
exports.shareAdminDisputeSubmission = shareAdminDisputeSubmission;
exports.getAdminDisputeInvestigation = getAdminDisputeInvestigation;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../models/bookingCreatorSettlement.model");
const bookingEscrowAllocation_model_1 = require("../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../models/bookingFundReservation.model");
const dispute_model_1 = require("../models/dispute.model");
const payment_model_1 = require("../models/payment.model");
const refund_model_1 = require("../models/refund.model");
const appeal_model_1 = require("../models/appeal.model");
const auditLog_service_1 = require("../services/auditLog.service");
const disputeAdminRequest_model_1 = require("../models/disputeAdminRequest.model");
const disputeInvestigationSubmission_model_1 = require("../models/disputeInvestigationSubmission.model");
const disputeDirectEvidence_model_1 = require("../models/disputeDirectEvidence.model");
const disputeFinding_model_1 = require("../models/disputeFinding.model");
const User_1 = __importDefault(require("../models/User"));
const userProfile_model_1 = require("../models/userProfile.model");
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const chat_model_1 = require("../models/chat.model");
const review_model_1 = require("../models/review.model");
const moderationQueue_model_1 = require("../models/moderationQueue.model");
const slot_model_1 = require("../models/slot.model");
const auditLog_model_1 = require("../models/auditLog.model");
const AppError_1 = require("../utils/AppError");
const validStatuses = new Set(["OPEN", "RESOLVED", "REJECTED"]);
const validEscalations = new Set(["NONE", "SOFT", "HARD"]);
const findingSubjects = new Set(["CUSTOMER", "CREATOR", "BOTH"]);
const findingCategories = new Set(["SERVICE_DELIVERY", "SERVICE_SCOPE", "PARTICIPANT_CONDUCT", "SAFETY", "PRIVACY_RECORDING", "ADDITIONAL_PARTICIPANT", "LOCATION", "EVIDENCE_INTEGRITY", "PLATFORM_POLICY", "OTHER"]);
const findingConclusions = new Set(["SUPPORTED", "NOT_SUPPORTED", "INCONCLUSIVE"]);
const outcomes = new Set(["NO_ADVERSE_FINDING", "ADVERSE_FINDING", "MIXED", "INCONCLUSIVE"]);
function integerQuery(value, fallback, maximum) {
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}
function queueItem(dispute) {
    return {
        disputeId: String(dispute._id), bookingId: String(dispute.bookingId), status: dispute.status,
        raisedByRole: dispute.raisedByRole, reasonSummary: dispute.reason.slice(0, 240),
        escalationLevel: dispute.escalationLevel, createdAt: dispute.createdAt,
        escalatedAt: dispute.escalatedAt ?? null, resolvedAt: dispute.resolution?.resolvedAt ?? null,
    };
}
async function listAdminDisputes(req, res) {
    const page = integerQuery(req.query.page, 1, 10000);
    const limit = integerQuery(req.query.limit, 25, 100);
    const status = typeof req.query.status === "string" && validStatuses.has(req.query.status) ? req.query.status : undefined;
    const escalationLevel = typeof req.query.escalationLevel === "string" && validEscalations.has(req.query.escalationLevel) ? req.query.escalationLevel : undefined;
    const bookingReference = typeof req.query.bookingReference === "string" ? req.query.bookingReference.trim() : undefined;
    const query = {};
    if (status)
        query.status = status;
    if (escalationLevel)
        query.escalationLevel = escalationLevel;
    if (bookingReference) {
        const booking = await booking_model_1.Booking.findOne({ bookingReference }).select("_id").lean();
        if (!booking)
            return res.json({ disputes: [], pagination: { page, limit, total: 0 } });
        query.bookingId = booking._id;
    }
    const [disputes, total] = await Promise.all([
        dispute_model_1.Dispute.find(query).select("bookingId status raisedByRole reason escalationLevel createdAt escalatedAt resolution.resolvedAt").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        dispute_model_1.Dispute.countDocuments(query),
    ]);
    const bookings = await booking_model_1.Booking.find({ _id: { $in: disputes.map((dispute) => dispute.bookingId) } }).select("_id bookingReference serviceTitle status").lean();
    const bookingById = new Map(bookings.map((booking) => [String(booking._id), booking]));
    res.json({ disputes: disputes.map((dispute) => ({ ...queueItem(dispute), booking: bookingById.get(String(dispute.bookingId)) ? { bookingReference: bookingById.get(String(dispute.bookingId)).bookingReference ?? null, serviceTitle: bookingById.get(String(dispute.bookingId)).serviceTitle, status: bookingById.get(String(dispute.bookingId)).status } : null })), pagination: { page, limit, total } });
}
async function getAdminDispute(req, res) {
    const { disputeId } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(disputeId))
        throw new AppError_1.AppError("Invalid disputeId", 400);
    const dispute = await dispute_model_1.Dispute.findById(disputeId).select("bookingId raisedByRole reason status slaHours escalatedAt escalationLevel signals resolution customerInput creatorInput createdAt updatedAt").lean();
    if (!dispute)
        throw new AppError_1.AppError("Dispute not found", 404);
    const [booking, payment, reservation, escrow, settlement, refund, finalizedAppeal] = await Promise.all([
        booking_model_1.Booking.findById(dispute.bookingId).select("bookingReference serviceTitle status currency paymentMethod totalAmount serviceAmount platformFeeAmount commissionAmount creatorAmount createdAt completedAt terminatedAt expiresAt settlementEligibleAt").lean(),
        payment_model_1.Payment.findOne({ bookingId: dispute.bookingId }).select("paymentReference status amount currency method authorizedAt releasedAt capturedAt").lean(),
        bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: dispute.bookingId }).select("reservationReference status amount currency authorizedAt releasedAt releaseCause capturedAt captureCause").lean(),
        bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({ bookingId: dispute.bookingId }).select("allocationReference status serviceAmount platformFeeAmount commissionAmount creatorAmount totalAmount currency allocatedAt").lean(),
        bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({ bookingId: dispute.bookingId }).select("settlementReference status creatorAmount currency settledAt").lean(),
        refund_model_1.Refund.findOne({ bookingId: dispute.bookingId }).select("refundReference status amount currency createdAt updatedAt").lean(),
        appeal_model_1.Appeal.exists({ disputeId: dispute._id, status: { $in: ["UPHELD", "REJECTED"] } }),
    ]);
    const allowedActions = dispute.status === "OPEN" && !finalizedAppeal ? ["NO_ACTION"] : [];
    const safeInput = (input) => ({ state: input?.state ?? "OPEN", changedAt: input?.changedAt ?? null });
    res.json({ dispute: { disputeId: String(dispute._id), status: dispute.status, reason: dispute.reason, raisedByRole: dispute.raisedByRole, slaHours: dispute.slaHours, escalationLevel: dispute.escalationLevel, escalatedAt: dispute.escalatedAt ?? null, signals: dispute.signals, createdAt: dispute.createdAt, updatedAt: dispute.updatedAt, resolution: dispute.resolution ? { action: dispute.resolution.action, note: dispute.resolution.note ?? null, resolvedAt: dispute.resolution.resolvedAt } : null, investigation: { customerInput: safeInput(dispute.customerInput), creatorInput: safeInput(dispute.creatorInput) }, allowedActions }, booking: booking ? { bookingReference: booking.bookingReference ?? null, serviceTitle: booking.serviceTitle, status: booking.status, currency: booking.currency, paymentMethod: booking.paymentMethod ?? null, totalAmount: booking.totalAmount, serviceAmount: booking.serviceAmount, customerFeeAmount: booking.platformFeeAmount, creatorCommissionAmount: booking.commissionAmount, creatorNetAmount: booking.creatorAmount, createdAt: booking.createdAt, completedAt: booking.completedAt ?? null, terminatedAt: booking.terminatedAt ?? null, expiresAt: booking.expiresAt, settlementEligibleAt: booking.settlementEligibleAt ?? null } : null, payment: payment ? { paymentReference: payment.paymentReference, status: payment.status, amount: payment.amount, currency: payment.currency, method: payment.method, authorizedAt: payment.authorizedAt ?? null, releasedAt: payment.releasedAt ?? null, capturedAt: payment.capturedAt ?? null } : null, reservation: reservation ? { reservationReference: reservation.reservationReference, status: reservation.status, amount: reservation.amount, currency: reservation.currency, authorizedAt: reservation.authorizedAt ?? null, releasedAt: reservation.releasedAt ?? null, releaseCause: reservation.releaseCause ?? null, capturedAt: reservation.capturedAt ?? null, captureCause: reservation.captureCause ?? null } : null, escrow: escrow ? { allocationReference: escrow.allocationReference, status: escrow.status, serviceAmount: escrow.serviceAmount, customerFeeAmount: escrow.platformFeeAmount, creatorCommissionAmount: escrow.commissionAmount, creatorNetAmount: escrow.creatorAmount, totalAmount: escrow.totalAmount, currency: escrow.currency, allocatedAt: escrow.allocatedAt ?? null } : null, settlement: settlement ? { settlementReference: settlement.settlementReference, status: settlement.status, amount: settlement.creatorAmount, currency: settlement.currency, settledAt: settlement.settledAt ?? null } : null, refund: refund ? { refundReference: refund.refundReference, status: refund.status, amount: refund.amount, currency: refund.currency, createdAt: refund.createdAt, updatedAt: refund.updatedAt } : null });
}
async function addAdminDisputeFinding(req, res) { const admin = adminRequest(req); const { disputeId } = req.params; const { subject, category, conclusion, summary } = req.body; if (!admin)
    throw new AppError_1.AppError("Unauthorized", 401); if (admin.role !== "admin")
    throw new AppError_1.AppError("Forbidden", 403); if (!mongoose_1.default.Types.ObjectId.isValid(disputeId))
    throw new AppError_1.AppError("Invalid disputeId", 400); if (!findingSubjects.has(subject) || !findingCategories.has(category) || !findingConclusions.has(conclusion) || typeof summary !== "string" || !summary.trim() || summary.trim().length > 2000)
    throw new AppError_1.AppError("Invalid finding", 400); const dispute = await dispute_model_1.Dispute.findById(disputeId); if (!dispute)
    throw new AppError_1.AppError("Dispute not found", 404); if (dispute.status !== "OPEN" || dispute.finalDecision)
    throw new AppError_1.AppError("Findings require an OPEN investigation", 409); const finding = await disputeFinding_model_1.DisputeFinding.create({ disputeId: dispute._id, bookingId: dispute.bookingId, subject: subject, category: category, conclusion: conclusion, summary: summary.trim(), createdBy: new mongoose_1.default.Types.ObjectId(admin.id) }); await (0, auditLog_service_1.createAuditLog)({ actorType: "ADMIN", actorId: new mongoose_1.default.Types.ObjectId(admin.id), action: "DISPUTE_FINDING_CREATED", entityType: "DISPUTE", entityId: dispute._id, after: { findingReference: finding.findingReference, subject: subject, category: category, conclusion: conclusion } }); return res.status(201).json({ finding: { findingReference: finding.findingReference, subject: finding.subject, category: finding.category, conclusion: finding.conclusion, summary: finding.summary, createdAt: finding.createdAt } }); }
async function finalizeAdminDispute(req, res) { const admin = adminRequest(req); const { disputeId } = req.params; const body = req.body; if (!admin)
    throw new AppError_1.AppError("Unauthorized", 401); if (admin.role !== "admin")
    throw new AppError_1.AppError("Forbidden", 403); if (!mongoose_1.default.Types.ObjectId.isValid(disputeId))
    throw new AppError_1.AppError("Invalid disputeId", 400); const strings = ["customerOutcome", "customerSummary", "creatorOutcome", "creatorSummary", "summary"]; if (!outcomes.has(body.customerOutcome) || !outcomes.has(body.creatorOutcome) || strings.slice(1).some(key => typeof body[key] !== "string" || !body[key].trim() || body[key].trim().length > (key === "summary" ? 4000 : 2000)) || typeof body.financialReviewRequired !== "boolean" || typeof body.governanceReviewRequired !== "boolean")
    throw new AppError_1.AppError("Invalid final decision", 400); const session = await mongoose_1.default.startSession(); let result; try {
    await session.withTransaction(async () => { const dispute = await dispute_model_1.Dispute.findById(disputeId).session(session); if (!dispute)
        throw new AppError_1.AppError("Dispute not found", 404); if (dispute.finalDecision) {
        result = { decision: dispute.finalDecision, replayed: true };
        return;
    } if (dispute.status !== "OPEN" || dispute.customerInput.state !== "CLOSED" || dispute.creatorInput.state !== "CLOSED")
        throw new AppError_1.AppError("Both participant inputs must be closed before finalization", 409); const now = new Date(); dispute.finalDecision = { customerOutcome: body.customerOutcome, customerSummary: body.customerSummary.trim(), creatorOutcome: body.creatorOutcome, creatorSummary: body.creatorSummary.trim(), summary: body.summary.trim(), financialReviewRequired: body.financialReviewRequired, governanceReviewRequired: body.governanceReviewRequired, finalizedBy: new mongoose_1.default.Types.ObjectId(admin.id), finalizedAt: now }; dispute.status = "RESOLVED"; await dispute.save({ session }); await (0, auditLog_service_1.createAuditLog)({ actorType: "ADMIN", actorId: new mongoose_1.default.Types.ObjectId(admin.id), action: "DISPUTE_FINALIZED", entityType: "DISPUTE", entityId: dispute._id, after: { financialReviewRequired: body.financialReviewRequired, governanceReviewRequired: body.governanceReviewRequired } }); result = { decision: dispute.finalDecision, replayed: false }; });
}
finally {
    await session.endSession();
} return res.json(result); }
async function setAdminDisputeInputAccess(req, res) {
    const admin = req.user;
    const { disputeId } = req.params;
    const { participantRole, state } = req.body;
    if (!admin)
        throw new AppError_1.AppError("Unauthorized", 401);
    if (admin.role !== "admin")
        throw new AppError_1.AppError("Forbidden", 403);
    if (!mongoose_1.default.Types.ObjectId.isValid(disputeId))
        throw new AppError_1.AppError("Invalid disputeId", 400);
    if (participantRole !== "CUSTOMER" && participantRole !== "CREATOR")
        throw new AppError_1.AppError("participantRole must be CUSTOMER or CREATOR", 400);
    if (state !== "OPEN" && state !== "CLOSED")
        throw new AppError_1.AppError("state must be OPEN or CLOSED", 400);
    const dispute = await dispute_model_1.Dispute.findById(disputeId);
    if (!dispute)
        throw new AppError_1.AppError("Dispute not found", 404);
    if (dispute.status !== "OPEN")
        throw new AppError_1.AppError("Participant input can only change while a dispute is OPEN", 409);
    const input = participantRole === "CUSTOMER" ? dispute.customerInput : dispute.creatorInput;
    const before = input.state;
    if (before === state) {
        return res.json({ disputeId: String(dispute._id), participantRole, state, changed: false, changedAt: input.changedAt ?? null });
    }
    const now = new Date();
    input.state = state;
    input.changedAt = now;
    input.changedBy = new mongoose_1.default.Types.ObjectId(admin.id);
    await dispute.save();
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(admin.id),
        action: "DISPUTE_INPUT_ACCESS_CHANGED",
        entityType: "DISPUTE",
        entityId: dispute._id,
        before: { participantRole, state: before },
        after: { participantRole, state },
    });
    return res.json({ disputeId: String(dispute._id), participantRole, state, changed: true, changedAt: now });
}
const adminRequest = (req) => req.user;
const safeInvestigationSubmission = (item) => ({ submissionReference: item.submissionReference, branch: item.branch, kind: item.kind, text: item.text ?? null, evidence: item.evidence.map((e) => ({ evidenceReference: e.evidenceReference, type: e.type, url: e.url, fileName: e.fileName, mimeType: e.mimeType, fileSize: e.fileSize, caption: e.caption ?? null })), createdAt: item.createdAt, sharedWithCounterpartyAt: item.sharedWithCounterpartyAt ?? null });
async function createAdminDisputeRequest(req, res) {
    const admin = adminRequest(req);
    const { disputeId } = req.params;
    const { target, text } = req.body;
    if (!admin)
        throw new AppError_1.AppError("Unauthorized", 401);
    if (admin.role !== "admin")
        throw new AppError_1.AppError("Forbidden", 403);
    if (!mongoose_1.default.Types.ObjectId.isValid(disputeId))
        throw new AppError_1.AppError("Invalid disputeId", 400);
    if (target !== "CUSTOMER" && target !== "CREATOR" && target !== "BOTH")
        throw new AppError_1.AppError("target must be CUSTOMER, CREATOR, or BOTH", 400);
    if (typeof text !== "string" || !text.trim() || text.trim().length > 4000)
        throw new AppError_1.AppError("A bounded request text is required", 400);
    const dispute = await dispute_model_1.Dispute.findById(disputeId);
    if (!dispute)
        throw new AppError_1.AppError("Dispute not found", 404);
    if (dispute.status !== "OPEN")
        throw new AppError_1.AppError("Investigation requests require an OPEN dispute", 409);
    const created = await disputeAdminRequest_model_1.DisputeAdminRequest.create({ disputeId: dispute._id, requestedBy: admin.id, target, text: text.trim() });
    await (0, auditLog_service_1.createAuditLog)({ actorType: "ADMIN", actorId: new mongoose_1.default.Types.ObjectId(admin.id), action: "DISPUTE_INVESTIGATION_REQUEST_CREATED", entityType: "DISPUTE", entityId: dispute._id, after: { target, requestReference: created.requestReference } });
    return res.status(201).json({ request: { requestReference: created.requestReference, target: created.target, text: created.text, createdAt: created.createdAt } });
}
async function shareAdminDisputeSubmission(req, res) {
    const admin = adminRequest(req);
    const { disputeId } = req.params;
    const { submissionReference } = req.body;
    if (!admin)
        throw new AppError_1.AppError("Unauthorized", 401);
    if (admin.role !== "admin")
        throw new AppError_1.AppError("Forbidden", 403);
    if (!mongoose_1.default.Types.ObjectId.isValid(disputeId))
        throw new AppError_1.AppError("Invalid disputeId", 400);
    if (typeof submissionReference !== "string" || !submissionReference.trim())
        throw new AppError_1.AppError("submissionReference is required", 400);
    const dispute = await dispute_model_1.Dispute.findById(disputeId);
    if (!dispute)
        throw new AppError_1.AppError("Dispute not found", 404);
    if (dispute.status !== "OPEN")
        throw new AppError_1.AppError("Investigation sharing requires an OPEN dispute", 409);
    const submission = await disputeInvestigationSubmission_model_1.DisputeInvestigationSubmission.findOne({ disputeId: dispute._id, submissionReference: submissionReference.trim() });
    if (!submission)
        throw new AppError_1.AppError("Submission not found", 404);
    if (submission.sharedWithCounterpartyAt)
        return res.json({ submissionReference: submission.submissionReference, shared: true, changed: false, sharedAt: submission.sharedWithCounterpartyAt });
    // Chat-derived attachments have no sensitivity classification or redaction
    // contract yet. Do not expose evidence cross-branch by default.
    if (submission.evidence.length)
        throw new AppError_1.AppError("Evidence sharing is unavailable until sensitivity classification is implemented", 409);
    const destination = submission.branch === "CUSTOMER" ? "CREATOR" : "CUSTOMER";
    submission.sharedWithCounterpartyAt = new Date();
    submission.sharedBy = new mongoose_1.default.Types.ObjectId(admin.id);
    await submission.save();
    await (0, auditLog_service_1.createAuditLog)({ actorType: "ADMIN", actorId: new mongoose_1.default.Types.ObjectId(admin.id), action: "DISPUTE_SUBMISSION_SHARED", entityType: "DISPUTE", entityId: dispute._id, after: { submissionReference: submission.submissionReference, sourceBranch: submission.branch, destination } });
    return res.json({ submissionReference: submission.submissionReference, shared: true, changed: true, sharedAt: submission.sharedWithCounterpartyAt });
}
async function getAdminDisputeInvestigation(req, res) {
    const { disputeId } = req.params;
    if (!mongoose_1.default.Types.ObjectId.isValid(disputeId))
        throw new AppError_1.AppError("Invalid disputeId", 400);
    const dispute = await dispute_model_1.Dispute.findById(disputeId).select("bookingId status customerInput creatorInput finalDecision").lean();
    if (!dispute)
        throw new AppError_1.AppError("Dispute not found", 404);
    const parsed = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const [customerBranch, creatorBranch, requests, adminEvidence, booking, findings] = await Promise.all([
        disputeInvestigationSubmission_model_1.DisputeInvestigationSubmission.find({ disputeId, branch: "CUSTOMER" }).sort({ createdAt: 1, _id: 1 }).limit(parsed).lean(),
        disputeInvestigationSubmission_model_1.DisputeInvestigationSubmission.find({ disputeId, branch: "CREATOR" }).sort({ createdAt: 1, _id: 1 }).limit(parsed).lean(),
        disputeAdminRequest_model_1.DisputeAdminRequest.find({ disputeId }).sort({ createdAt: 1, _id: 1 }).limit(parsed).lean(),
        disputeDirectEvidence_model_1.DisputeDirectEvidence.find({ disputeId }).sort({ createdAt: 1, _id: 1 }).limit(parsed).lean(),
        booking_model_1.Booking.findById(dispute.bookingId).select("bookingReference userId creatorId serviceId serviceSnapshot serviceTitle durationMinutes price currency status paymentStatus createdAt completedAt terminatedAt expiresAt slotIds").lean(),
        disputeFinding_model_1.DisputeFinding.find({ disputeId }).select("findingReference subject category conclusion summary createdAt").sort({ createdAt: 1, _id: 1 }).limit(parsed).lean(),
    ]);
    const requestDto = (item) => ({ requestReference: item.requestReference, target: item.target, text: item.text, createdAt: item.createdAt });
    const evidenceDto = (item) => ({ evidenceReference: item.evidenceReference, source: item.source, type: item.type, audience: item.audience ?? null, url: item.url, fileName: item.fileName, mimeType: item.mimeType, fileSize: item.fileSize, note: item.note ?? null, createdAt: item.createdAt });
    const emptyContext = { customer: null, creator: null, booking: null, chat: { messages: [], limit: parsed }, reviews: [], moderation: [], previousDisputes: { customer: [], creator: [] }, history: [] };
    if (!booking)
        return res.json({ dispute: { disputeId, status: dispute.status, investigation: { customerInput: { state: dispute.customerInput?.state ?? "OPEN", changedAt: dispute.customerInput?.changedAt ?? null }, creatorInput: { state: dispute.creatorInput?.state ?? "OPEN", changedAt: dispute.creatorInput?.changedAt ?? null } } }, findings, finalDecision: null, customerBranch: customerBranch.map(safeInvestigationSubmission), creatorBranch: creatorBranch.map(safeInvestigationSubmission), directEvidence: adminEvidence.filter((item) => item.source !== "ADMIN").map(evidenceDto), adminEvidence: adminEvidence.filter((item) => item.source === "ADMIN").map(evidenceDto), sharedAdminRequests: requests.filter((item) => item.target === "BOTH").map(requestDto), customerAdminRequests: requests.filter((item) => item.target === "CUSTOMER").map(requestDto), creatorAdminRequests: requests.filter((item) => item.target === "CREATOR").map(requestDto), context: emptyContext, limit: parsed });
    const [customerUser, creatorUser, customerProfile, creatorProfile, slots, chat, reviews, moderation, customerHistory, creatorHistory, audit] = await Promise.all([
        User_1.default.findById(booking.userId).select("email role status governanceState abuseScore userCooldownUntil creatorCooldownUntil").lean(), User_1.default.findById(booking.creatorId).select("email role status governanceState abuseScore userCooldownUntil creatorCooldownUntil").lean(), userProfile_model_1.UserProfile.findOne({ userId: booking.userId }).select("username avatar profileStatus").lean(), creatorProfile_model_1.CreatorProfile.findOne({ userId: booking.creatorId }).select("slug displayName avatarUrl status primaryCategory categories country city currency languages rating reviewCount creatorCooldownUntil").lean(), slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }).select("startTime endTime status").sort({ startTime: 1 }).lean(), chat_model_1.Chat.find({ bookingId: booking._id }).select("senderId senderRole type message location attachment.url attachment.fileName attachment.mimeType attachment.fileSize attachment.resourceType replyTo reactions aiFlags isDeleted deletedAt createdAt").sort({ createdAt: -1, _id: -1 }).limit(parsed).lean(), review_model_1.Review.find({ bookingId: booking._id }).select("reviewerId revieweeId role rating comment reportFlag verified isFlagged createdAt").sort({ createdAt: 1 }).limit(parsed).lean(), moderationQueue_model_1.ModerationQueue.find({ bookingId: booking._id }).select("chatId offenderId severity reasons reviewed createdAt").sort({ createdAt: -1 }).limit(parsed).lean(), dispute_model_1.Dispute.find({ _id: { $ne: dispute._id }, $or: [{ raisedBy: booking.userId }, { bookingId: { $in: await booking_model_1.Booking.find({ $or: [{ userId: booking.userId }, { creatorId: booking.userId }] }).distinct("_id") } }] }).select("bookingId raisedByRole status createdAt resolution.resolvedAt").sort({ createdAt: -1 }).limit(10).lean(), dispute_model_1.Dispute.find({ _id: { $ne: dispute._id }, $or: [{ raisedBy: booking.creatorId }, { bookingId: { $in: await booking_model_1.Booking.find({ $or: [{ userId: booking.creatorId }, { creatorId: booking.creatorId }] }).distinct("_id") } }] }).select("bookingId raisedByRole status createdAt resolution.resolvedAt").sort({ createdAt: -1 }).limit(10).lean(), auditLog_model_1.AuditLog.find({ $or: [{ entityType: "DISPUTE", entityId: dispute._id }, { entityType: "BOOKING", entityId: booking._id }] }).select("action entityType before after createdAt").sort({ createdAt: -1 }).limit(25).lean(),
    ]);
    const person = (user, profile, creator = false) => { if (!user)
        return null; const common = { userId: String(user._id), displayName: creator ? profile?.displayName ?? profile?.slug ?? user.email : profile?.username ?? user.email, avatar: creator ? profile?.avatarUrl ?? null : profile?.avatar ?? null, status: user.status, governanceState: user.governanceState, abuseScore: user.abuseScore, userCooldownUntil: user.userCooldownUntil ?? null, creatorCooldownUntil: user.creatorCooldownUntil ?? null }; return creator ? { ...common, creatorProfile: profile ? { slug: profile.slug, status: profile.status, categories: profile.categories ?? [profile.primaryCategory], location: [profile.city, profile.country].filter(Boolean).join(", "), currency: profile.currency, languages: profile.languages ?? [], rating: profile.rating, reviewCount: profile.reviewCount } : null } : { ...common, profileStatus: profile?.profileStatus ?? null }; };
    const context = { customer: person(customerUser, customerProfile), creator: person(creatorUser, creatorProfile, true), booking: { bookingReference: booking.bookingReference ?? null, status: booking.status, paymentStatus: booking.paymentStatus, serviceTitle: booking.serviceTitle, durationMinutes: booking.durationMinutes, price: booking.price, currency: booking.currency, createdAt: booking.createdAt, completedAt: booking.completedAt ?? null, terminatedAt: booking.terminatedAt ?? null, expiresAt: booking.expiresAt, slots: slots.map(s => ({ startTime: s.startTime, endTime: s.endTime, status: s.status })), serviceSnapshot: booking.serviceSnapshot ? { serviceId: String(booking.serviceSnapshot.serviceId), title: booking.serviceSnapshot.title, description: booking.serviceSnapshot.description, durationMinutes: booking.serviceSnapshot.durationMinutes, price: booking.serviceSnapshot.price, currency: booking.serviceSnapshot.currency, media: booking.serviceSnapshot.media } : null }, chat: { messages: chat.reverse().map(m => ({ senderId: String(m.senderId), senderRole: m.senderRole, type: m.type, message: m.message, location: m.location ?? null, attachment: m.attachment ? { url: m.attachment.url, fileName: m.attachment.fileName, mimeType: m.attachment.mimeType, fileSize: m.attachment.fileSize, resourceType: m.attachment.resourceType } : null, replyTo: m.replyTo ?? null, reactions: m.reactions, aiFlags: m.aiFlags, isDeleted: m.isDeleted, deletedAt: m.deletedAt ?? null, createdAt: m.createdAt })), limit: parsed }, reviews: reviews.map(r => ({ reviewerId: String(r.reviewerId), revieweeId: String(r.revieweeId), role: r.role, rating: r.rating, comment: r.comment ?? null, reportFlag: r.reportFlag, isFlagged: r.isFlagged, createdAt: r.createdAt })), moderation: moderation.map(m => ({ chatId: String(m.chatId), offenderId: String(m.offenderId), severity: m.severity, reasons: m.reasons, reviewed: m.reviewed, createdAt: m.createdAt })), previousDisputes: { customer: customerHistory.map(d => ({ disputeId: String(d._id), bookingId: String(d.bookingId), raisedByRole: d.raisedByRole, status: d.status, createdAt: d.createdAt, resolvedAt: d.resolution?.resolvedAt ?? null })), creator: creatorHistory.map(d => ({ disputeId: String(d._id), bookingId: String(d.bookingId), raisedByRole: d.raisedByRole, status: d.status, createdAt: d.createdAt, resolvedAt: d.resolution?.resolvedAt ?? null })) }, history: audit.map(a => ({ action: a.action, entityType: a.entityType, createdAt: a.createdAt })) };
    return res.json({ dispute: { disputeId, status: dispute.status, investigation: { customerInput: { state: dispute.customerInput?.state ?? "OPEN", changedAt: dispute.customerInput?.changedAt ?? null }, creatorInput: { state: dispute.creatorInput?.state ?? "OPEN", changedAt: dispute.creatorInput?.changedAt ?? null } } }, findings: findings.map(f => ({ findingReference: f.findingReference, subject: f.subject, category: f.category, conclusion: f.conclusion, summary: f.summary, createdAt: f.createdAt })), finalDecision: dispute.finalDecision ? { customerOutcome: dispute.finalDecision.customerOutcome, customerSummary: dispute.finalDecision.customerSummary, creatorOutcome: dispute.finalDecision.creatorOutcome, creatorSummary: dispute.finalDecision.creatorSummary, summary: dispute.finalDecision.summary, financialReviewRequired: dispute.finalDecision.financialReviewRequired, governanceReviewRequired: dispute.finalDecision.governanceReviewRequired, finalizedAt: dispute.finalDecision.finalizedAt } : null, customerBranch: customerBranch.map(safeInvestigationSubmission), creatorBranch: creatorBranch.map(safeInvestigationSubmission), directEvidence: adminEvidence.filter((item) => item.source !== "ADMIN").map(evidenceDto), adminEvidence: adminEvidence.filter((item) => item.source === "ADMIN").map(evidenceDto), sharedAdminRequests: requests.filter((item) => item.target === "BOTH").map(requestDto), customerAdminRequests: requests.filter((item) => item.target === "CUSTOMER").map(requestDto), creatorAdminRequests: requests.filter((item) => item.target === "CREATOR").map(requestDto), context, limit: parsed });
}
