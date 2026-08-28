"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const User_1 = __importDefault(require("../../models/User"));
const creatorProfile_model_1 = require("../../models/creatorProfile.model");
const auditLog_model_1 = require("../../models/auditLog.model");
const suspensionLifecycle_service_1 = require("../../services/accountGovernance/suspensionLifecycle.service");
const unsuspendLifecycle_service_1 = require("../../services/accountGovernance/unsuspendLifecycle.service");
const banLifecycle_service_1 = require("../../services/accountGovernance/banLifecycle.service");
const accountGovernanceResolver_service_1 = require("../../services/accountGovernance/accountGovernanceResolver.service");
const withdrawalEligibility_service_1 = require("../../services/financial/withdrawalEligibility.service");
const auditLog_service_1 = require("../../services/auditLog.service");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
const createUser = async (suffix) => User_1.default.create({
    email: `g1-${suffix}-${new mongoose_1.Types.ObjectId().toString()}@test.local`,
    password: "test",
    status: "active",
    governanceState: "ACTIVE",
});
(0, node_test_1.test)("G1 suspension and activation synchronize canonical governance without touching cooldowns", async () => {
    const admin = await createUser("admin");
    const target = await createUser("target");
    const cooldown = new Date(Date.now() + 60000);
    target.userCooldownUntil = cooldown;
    await target.save();
    const suspended = await (0, suspensionLifecycle_service_1.triggerSuspensionLifecycle)({ adminId: String(admin._id), userId: String(target._id), reason: "policy breach" });
    strict_1.default.equal(suspended.governanceState, "SUSPENDED");
    strict_1.default.equal(suspended.status, "suspended");
    strict_1.default.equal(suspended.bookingsMutated, false);
    strict_1.default.equal((0, accountGovernanceResolver_service_1.resolveAccountGovernance)(await User_1.default.findById(target._id).orFail()).blocksOutgoingBookings, true);
    const activated = await (0, unsuspendLifecycle_service_1.removeSuspensionLifecycle)({ adminId: String(admin._id), userId: String(target._id), reason: "review complete" });
    strict_1.default.equal(activated.governanceState, "ACTIVE");
    const reloaded = await User_1.default.findById(target._id).orFail();
    strict_1.default.equal(reloaded.status, "active");
    strict_1.default.equal(reloaded.userCooldownUntil?.getTime(), cooldown.getTime());
    strict_1.default.equal((0, accountGovernanceResolver_service_1.resolveAccountGovernance)(reloaded).condition, "COOLDOWN");
});
(0, node_test_1.test)("G1 canonical ban blocks account, marketplace capabilities, and withdrawal eligibility", async () => {
    const admin = await createUser("admin");
    const target = await createUser("creator");
    await creatorProfile_model_1.CreatorProfile.create({ userId: target._id, slug: `g1-${target._id}`, displayName: "G1 Creator", primaryCategory: "test", country: "IN", city: "Test", currency: "INR", status: "active" });
    const banned = await (0, banLifecycle_service_1.triggerBanLifecycle)({ adminId: String(admin._id), userId: String(target._id), reason: "serious policy breach" });
    strict_1.default.equal(banned.governanceState, "BANNED");
    strict_1.default.equal(banned.status, "banned");
    strict_1.default.equal(banned.bookingsMutated, false);
    const governance = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(await User_1.default.findById(target._id).orFail());
    strict_1.default.equal(governance.hasNoAccountAccess, true);
    strict_1.default.equal(governance.blocksOutgoingBookings, true);
    strict_1.default.equal(governance.blocksIncomingBookings, true);
    strict_1.default.equal(governance.blocksAcceptingBookings, true);
    const eligibility = await withdrawalEligibility_service_1.withdrawalEligibilityService.evaluate({ creatorId: String(target._id), amount: { amount: 100, currency: "INR" }, destinationReference: "DESTINATION" });
    strict_1.default.deepEqual(eligibility, { allowed: false, reason: "GOVERNANCE_BLOCK" });
    const replay = await (0, banLifecycle_service_1.triggerBanLifecycle)({ adminId: String(admin._id), userId: String(target._id), reason: "ignored" });
    strict_1.default.equal(replay.replay, true);
    await strict_1.default.rejects(() => (0, unsuspendLifecycle_service_1.removeSuspensionLifecycle)({ adminId: String(admin._id), userId: String(target._id), reason: "not a ban reversal" }));
});
(0, node_test_1.test)("G1 governance audit records canonical before and after state", async () => {
    const admin = await createUser("admin");
    const target = await createUser("target");
    const result = await (0, suspensionLifecycle_service_1.triggerSuspensionLifecycle)({ adminId: String(admin._id), userId: String(target._id), reason: "audit reason" });
    await (0, auditLog_service_1.createAuditLog)({ actorType: "ADMIN", actorId: admin._id, action: "USER_SUSPENDED", entityType: "USER", entityId: target._id, before: { governanceState: result.previousGovernanceState }, after: { governanceState: result.governanceState, status: result.status, reason: result.reason } });
    const audit = await auditLog_model_1.AuditLog.findOne({ action: "USER_SUSPENDED" }).lean().orFail();
    strict_1.default.equal(audit.before?.governanceState, "ACTIVE");
    strict_1.default.equal(audit.after?.governanceState, "SUSPENDED");
    strict_1.default.equal(audit.after?.status, "suspended");
});
