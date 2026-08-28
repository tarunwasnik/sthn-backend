"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const User_1 = __importDefault(require("../../models/User"));
const auditLog_model_1 = require("../../models/auditLog.model");
const booking_model_1 = require("../../models/booking.model");
const bookingFundReservation_model_1 = require("../../models/bookingFundReservation.model");
const dispute_model_1 = require("../../models/dispute.model");
const ledgerEntry_model_1 = require("../../models/ledgerEntry.model");
const payment_model_1 = require("../../models/payment.model");
const wallet_model_1 = require("../../models/wallet.model");
const adminDispute_controller_1 = require("../../controllers/adminDispute.controller");
const dispute_controller_1 = require("../../controllers/dispute.controller");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
function response() {
    const result = {};
    result.response = {
        status: (code) => { result.statusCode = code; return result.response; },
        json: (body) => { result.body = body; return result.response; },
    };
    return result;
}
async function fixture() {
    const suffix = new mongoose_1.Types.ObjectId().toString();
    const [customer, creator, admin] = await Promise.all([
        User_1.default.create({ email: `di2b-customer-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }),
        User_1.default.create({ email: `di2b-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }),
        User_1.default.create({ email: `di2b-admin-${suffix}@test.local`, password: "test", role: "admin", status: "active", governanceState: "ACTIVE" }),
    ]);
    const booking = await booking_model_1.Booking.create({
        slotIds: [new mongoose_1.Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new mongoose_1.Types.ObjectId(),
        serviceTitle: "DI-2B service", durationMinutes: 30, price: 100, currency: "INR", status: "CANCELLED",
        paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false,
        expiresAt: new Date(Date.now() + 86400000), hasInteracted: true,
        serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100,
    });
    return { customer, creator, admin, booking };
}
async function open(actorId, bookingId) {
    const res = response();
    await (0, dispute_controller_1.openDispute)({ user: { id: actorId }, body: { bookingId, reason: "DI-2B investigation" } }, res.response);
    strict_1.default.equal(res.statusCode, 201);
    return dispute_model_1.Dispute.findOne({ bookingId }).orFail();
}
async function setInput(actor, disputeId, participantRole, state) {
    const res = response();
    await (0, adminDispute_controller_1.setAdminDisputeInputAccess)({ user: { id: String(actor._id), role: actor.role }, params: { disputeId }, body: { participantRole, state } }, res.response);
    return res;
}
(0, node_test_1.test)("DI-2B defaults both shared-dispute branches OPEN regardless of who raises the dispute", async () => {
    const customerRaised = await fixture();
    const customerDispute = await open(String(customerRaised.customer._id), String(customerRaised.booking._id));
    strict_1.default.equal(customerDispute.customerInput.state, "OPEN");
    strict_1.default.equal(customerDispute.creatorInput.state, "OPEN");
    const creatorRaised = await fixture();
    const creatorDispute = await open(String(creatorRaised.creator._id), String(creatorRaised.booking._id));
    strict_1.default.equal(creatorDispute.raisedByRole, "CREATOR");
    strict_1.default.equal(creatorDispute.customerInput.state, "OPEN");
    strict_1.default.equal(creatorDispute.creatorInput.state, "OPEN");
    strict_1.default.equal(await dispute_model_1.Dispute.countDocuments({ bookingId: creatorRaised.booking._id }), 1);
});
(0, node_test_1.test)("DI-2B Admin independently closes and reopens each branch with replay-safe audit", async () => {
    const data = await fixture();
    const dispute = await open(String(data.customer._id), String(data.booking._id));
    strict_1.default.equal((await setInput(data.admin, String(dispute._id), "CUSTOMER", "CLOSED")).statusCode, undefined);
    let reread = await dispute_model_1.Dispute.findById(dispute._id).orFail();
    strict_1.default.equal(reread.customerInput.state, "CLOSED");
    strict_1.default.equal(reread.creatorInput.state, "OPEN");
    strict_1.default.equal(String(reread.customerInput.changedBy), String(data.admin._id));
    const replay = await setInput(data.admin, String(dispute._id), "CUSTOMER", "CLOSED");
    strict_1.default.deepEqual(replay.body, { disputeId: String(dispute._id), participantRole: "CUSTOMER", state: "CLOSED", changed: false, changedAt: reread.customerInput.changedAt });
    strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({ action: "DISPUTE_INPUT_ACCESS_CHANGED", entityId: dispute._id }), 1);
    await setInput(data.admin, String(dispute._id), "CUSTOMER", "OPEN");
    await setInput(data.admin, String(dispute._id), "CREATOR", "CLOSED");
    reread = await dispute_model_1.Dispute.findById(dispute._id).orFail();
    strict_1.default.equal(reread.customerInput.state, "OPEN");
    strict_1.default.equal(reread.creatorInput.state, "CLOSED");
    await setInput(data.admin, String(dispute._id), "CREATOR", "OPEN");
    strict_1.default.equal((await dispute_model_1.Dispute.findById(dispute._id).orFail()).creatorInput.state, "OPEN");
    strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({ action: "DISPUTE_INPUT_ACCESS_CHANGED", entityId: dispute._id }), 4);
});
(0, node_test_1.test)("DI-2B rejects non-Admin, unauthenticated, and terminal-dispute input changes without lifecycle side effects", async () => {
    const data = await fixture();
    const dispute = await open(String(data.customer._id), String(data.booking._id));
    const before = await Promise.all([
        User_1.default.findById(data.customer._id).lean(), booking_model_1.Booking.findById(data.booking._id).lean(), payment_model_1.Payment.countDocuments(),
        bookingFundReservation_model_1.BookingFundReservation.countDocuments(), wallet_model_1.Wallet.countDocuments(), ledgerEntry_model_1.LedgerEntry.countDocuments(),
    ]);
    await strict_1.default.rejects(() => (0, adminDispute_controller_1.setAdminDisputeInputAccess)({ user: { id: String(data.customer._id), role: "user" }, params: { disputeId: String(dispute._id) }, body: { participantRole: "CUSTOMER", state: "CLOSED" } }, response().response), /Forbidden/);
    await strict_1.default.rejects(() => (0, adminDispute_controller_1.setAdminDisputeInputAccess)({ params: { disputeId: String(dispute._id) }, body: { participantRole: "CUSTOMER", state: "CLOSED" } }, response().response), /Unauthorized/);
    dispute.status = "REJECTED";
    await dispute.save();
    await strict_1.default.rejects(() => setInput(data.admin, String(dispute._id), "CREATOR", "CLOSED"), /only change while a dispute is OPEN/);
    strict_1.default.deepEqual(await Promise.all([
        User_1.default.findById(data.customer._id).lean(), booking_model_1.Booking.findById(data.booking._id).lean(), payment_model_1.Payment.countDocuments(),
        bookingFundReservation_model_1.BookingFundReservation.countDocuments(), wallet_model_1.Wallet.countDocuments(), ledgerEntry_model_1.LedgerEntry.countDocuments(),
    ]), before);
});
(0, node_test_1.test)("DI-2B exposes only own participant input state and both safe states to Admin", async () => {
    const data = await fixture();
    const dispute = await open(String(data.creator._id), String(data.booking._id));
    await setInput(data.admin, String(dispute._id), "CUSTOMER", "CLOSED");
    const customerRead = response();
    await (0, dispute_controller_1.getBookingDisputeState)({ user: { id: String(data.customer._id) }, params: { bookingId: String(data.booking._id) } }, customerRead.response);
    const participantDispute = customerRead.body.dispute;
    strict_1.default.deepEqual(participantDispute.input, { state: "CLOSED" });
    strict_1.default.equal(JSON.stringify(participantDispute).includes("creatorInput"), false);
    strict_1.default.equal(JSON.stringify(participantDispute).includes("changedBy"), false);
    const adminRead = response();
    await (0, adminDispute_controller_1.getAdminDispute)({ params: { disputeId: String(dispute._id) } }, adminRead.response);
    const adminDispute = adminRead.body.dispute;
    strict_1.default.equal(adminDispute.investigation.customerInput.state, "CLOSED");
    strict_1.default.equal(adminDispute.investigation.creatorInput.state, "OPEN");
    strict_1.default.equal("changedBy" in adminDispute.investigation.customerInput, false);
});
