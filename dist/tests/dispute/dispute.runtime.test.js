"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const User_1 = __importDefault(require("../../models/User"));
const booking_model_1 = require("../../models/booking.model");
const dispute_model_1 = require("../../models/dispute.model");
const dispute_controller_1 = require("../../controllers/dispute.controller");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
function response() {
    const result = {};
    result.response = { status: (code) => { result.statusCode = code; return result.response; }, json: (body) => { result.body = body; return result.response; } };
    return result;
}
async function fixture(status = "CANCELLED", completedAt) {
    const suffix = new mongoose_1.Types.ObjectId().toString();
    const customer = await User_1.default.create({ email: `dispute-customer-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    const creator = await User_1.default.create({ email: `dispute-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    const booking = await booking_model_1.Booking.create({ slotIds: [new mongoose_1.Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new mongoose_1.Types.ObjectId(), serviceTitle: "Dispute service", durationMinutes: 30, price: 100, currency: "INR", status, paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86400000), hasInteracted: true, completedAt: status === "COMPLETED" ? completedAt ?? new Date() : undefined, serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 });
    return { customer, creator, booking };
}
const open = async (actorId, bookingId, reason = "Service outcome needs review") => {
    const res = response();
    await (0, dispute_controller_1.openDispute)({ user: { id: actorId }, body: { bookingId, reason } }, res.response);
    return res;
};
(0, node_test_1.test)("eligible customer creation is visible through booking state and participant lists", async () => {
    const { customer, creator, booking } = await fixture();
    const created = await open(String(customer._id), String(booking._id));
    strict_1.default.equal(created.statusCode, 201);
    strict_1.default.equal(await dispute_model_1.Dispute.countDocuments({ bookingId: booking._id }), 1);
    for (const actor of [customer, creator]) {
        const state = response();
        await (0, dispute_controller_1.getBookingDisputeState)({ user: { id: String(actor._id) }, params: { bookingId: String(booking._id) } }, state.response);
        const body = state.body;
        strict_1.default.equal(body.hasDispute, true);
        strict_1.default.deepEqual(Object.keys(body.dispute).sort(), ["bookingId", "createdAt", "disputeId", "escalationLevel", "input", "raisedByMe", "raisedByRole", "reason", "resolution", "status", "updatedAt"]);
        strict_1.default.deepEqual(body.dispute.input, { state: "OPEN" });
        const list = response();
        await (0, dispute_controller_1.getMyDisputes)({ user: { id: String(actor._id) } }, list.response);
        strict_1.default.equal(list.body.disputes.length, 1);
    }
});
(0, node_test_1.test)("eligible Creator creation and backend eligibility matrix are enforced", async () => {
    const { creator, booking } = await fixture("EXPIRED");
    strict_1.default.equal((await open(String(creator._id), String(booking._id))).statusCode, 201);
    const { customer: confirmedCustomer, booking: confirmed } = await fixture("CONFIRMED");
    strict_1.default.equal((await open(String(confirmedCustomer._id), String(confirmed._id))).statusCode, 400);
    const { customer: oldCustomer, booking: oldCompleted } = await fixture("COMPLETED", new Date(Date.now() - 25 * 60 * 60 * 1000));
    strict_1.default.equal((await open(String(oldCustomer._id), String(oldCompleted._id))).statusCode, 400);
});
(0, node_test_1.test)("unrelated actors and every existing dispute status are safely blocked", async () => {
    for (const status of ["OPEN", "RESOLVED", "REJECTED"]) {
        const { customer, booking } = await fixture();
        await dispute_model_1.Dispute.create({ bookingId: booking._id, raisedBy: customer._id, raisedByRole: "USER", reason: "Existing dispute", status, escalationLevel: "NONE", signals: [] });
        const duplicate = await open(String(customer._id), String(booking._id));
        strict_1.default.equal(duplicate.statusCode, 409);
        strict_1.default.equal(duplicate.body.message, "A dispute already exists for this booking");
    }
    const { booking } = await fixture();
    const stranger = await User_1.default.create({ email: `dispute-stranger-${new mongoose_1.Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    strict_1.default.equal((await open(String(stranger._id), String(booking._id))).statusCode, 403);
});
(0, node_test_1.test)("a duplicate-key creation race returns the same bounded conflict", async () => {
    const { customer, booking } = await fixture();
    const model = dispute_model_1.Dispute;
    const originalExists = model.exists;
    const originalCreate = model.create;
    model.exists = (async () => null);
    model.create = (async () => {
        const error = Object.assign(new Error("duplicate key"), { code: 11000 });
        throw error;
    });
    try {
        const raced = await open(String(customer._id), String(booking._id));
        strict_1.default.equal(raced.statusCode, 409);
        strict_1.default.deepEqual(raced.body, { message: "A dispute already exists for this booking" });
    }
    finally {
        model.exists = originalExists;
        model.create = originalCreate;
    }
});
(0, node_test_1.test)("no-dispute state is safe and unrelated booking disputes are excluded", async () => {
    const first = await fixture();
    const second = await fixture();
    await open(String(first.customer._id), String(first.booking._id));
    const empty = response();
    await (0, dispute_controller_1.getBookingDisputeState)({ user: { id: String(second.customer._id) }, params: { bookingId: String(second.booking._id) } }, empty.response);
    strict_1.default.deepEqual(empty.body, { hasDispute: false, canOpenDispute: true, ineligibilityReason: null, dispute: null });
    const list = response();
    await (0, dispute_controller_1.getMyDisputes)({ user: { id: String(second.customer._id) } }, list.response);
    strict_1.default.equal(list.body.disputes.length, 0);
});
(0, node_test_1.test)("participant dispute lists preserve the viewer-specific finalized outcome", async () => {
    const { customer, creator, booking } = await fixture();
    await open(String(customer._id), String(booking._id));
    await dispute_model_1.Dispute.updateOne({ bookingId: booking._id }, { $set: { status: "RESOLVED", finalDecision: { customerOutcome: "ADVERSE_FINDING", customerSummary: "Customer-only", creatorOutcome: "NO_ADVERSE_FINDING", creatorSummary: "Creator-only", summary: "Participant-safe", financialReviewRequired: false, governanceReviewRequired: false, finalizedAt: new Date() } } });
    for (const [actor, outcome] of [[customer, "ADVERSE_FINDING"], [creator, "NO_ADVERSE_FINDING"]]) {
        const list = response();
        await (0, dispute_controller_1.getMyDisputes)({ user: { id: String(actor._id) } }, list.response);
        const dispute = list.body.disputes[0];
        strict_1.default.equal(dispute.finalDecision?.outcome, outcome);
        strict_1.default.equal(JSON.stringify(dispute).includes("Customer-only"), false);
        strict_1.default.equal(JSON.stringify(dispute).includes("Creator-only"), false);
    }
});
