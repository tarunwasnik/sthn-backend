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
const adminDispute_controller_1 = require("../../controllers/adminDispute.controller");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
function response() { const result = {}; result.response = { status: (code) => { result.statusCode = code; return result.response; }, json: (body) => { result.body = body; return result.response; } }; return result; }
async function fixture(status = "OPEN", escalationLevel = "NONE") { const suffix = new mongoose_1.Types.ObjectId().toString(); const customer = await User_1.default.create({ email: `admin-dispute-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" }); const booking = await booking_model_1.Booking.create({ slotIds: [new mongoose_1.Types.ObjectId()], userId: customer._id, creatorId: new mongoose_1.Types.ObjectId(), serviceId: new mongoose_1.Types.ObjectId(), serviceTitle: "Bounded dispute service", durationMinutes: 30, price: 100, currency: "INR", status: "CANCELLED", paymentStatus: "PAID", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86400000), hasInteracted: true, serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 }); const dispute = await dispute_model_1.Dispute.create({ bookingId: booking._id, raisedBy: customer._id, raisedByRole: "USER", reason: "Bounded admin dispute", status, escalationLevel, signals: [] }); return { booking, dispute }; }
(0, node_test_1.test)("admin queue applies status/escalation pagination and returns bounded records", async () => { const open = await fixture("OPEN", "SOFT"); await fixture("RESOLVED", "NONE"); const res = response(); await (0, adminDispute_controller_1.listAdminDisputes)({ query: { status: "OPEN", escalationLevel: "SOFT", page: "1", limit: "1" } }, res.response); const body = res.body; strict_1.default.equal(body.pagination.total, 1); strict_1.default.equal(body.disputes[0].disputeId, String(open.dispute._id)); strict_1.default.deepEqual(Object.keys(body.disputes[0]).sort(), ["booking", "bookingId", "createdAt", "disputeId", "escalatedAt", "escalationLevel", "raisedByRole", "reasonSummary", "resolvedAt", "status"]); });
(0, node_test_1.test)("admin detail safely returns independently persisted financial context as null when absent", async () => { const { dispute } = await fixture(); const res = response(); await (0, adminDispute_controller_1.getAdminDispute)({ params: { disputeId: String(dispute._id) } }, res.response); const body = res.body; strict_1.default.deepEqual(body.dispute.allowedActions, ["NO_ACTION"]); strict_1.default.equal(body.payment, null); strict_1.default.equal(body.reservation, null); strict_1.default.equal(body.escrow, null); strict_1.default.equal(body.settlement, null); strict_1.default.equal(body.refund, null); strict_1.default.equal("raisedBy" in body.dispute, false); });
