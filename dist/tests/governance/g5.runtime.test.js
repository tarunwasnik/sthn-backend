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
const adminActionExecution_model_1 = __importDefault(require("../../models/adminActionExecution.model"));
const adminActionLog_model_1 = __importDefault(require("../../models/adminActionLog.model"));
const auditLog_model_1 = require("../../models/auditLog.model");
const adminControl_model_1 = require("../../models/adminControl.model");
const featureFlag_model_1 = require("../../models/featureFlag.model");
const featureFlagCache_service_1 = require("../../services/controlPlane/featureFlagCache.service");
const adminActionDispatcher_service_1 = require("../../services/adminActions/adminActionDispatcher.service");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
    featureFlagCache_service_1.featureFlagCache.invalidate();
});
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
const createUser = (label, state = "ACTIVE") => User_1.default.create({
    email: `g5-${label}-${new mongoose_1.Types.ObjectId()}@test.local`, password: "test", governanceState: state,
    status: state === "BANNED" ? "banned" : state === "SUSPENDED" ? "suspended" : "active",
});
const enableActions = async (adminId) => {
    await featureFlag_model_1.FeatureFlag.create({ key: "ADMIN_ACTIONS_ENABLED", enabled: true, scope: "GLOBAL", createdBy: adminId });
    featureFlagCache_service_1.featureFlagCache.invalidate();
};
const preview = (adminId, key, targetId, params = {}) => (0, adminActionDispatcher_service_1.executeAdminActionService)({
    adminId, adminRole: "admin", key, targetId, params, reason: "governance test", dryRun: true,
});
const execute = async (adminId, key, targetId, params = {}) => {
    const p = await preview(adminId, key, targetId, params);
    return (0, adminActionDispatcher_service_1.executeAdminActionService)({ adminId, adminRole: "admin", key, targetId, params, reason: "governance test", confirmationToken: p.confirmationToken });
};
(0, node_test_1.test)("G5 registry-backed suspension honors dry-run, confirmation binding, action/audit logs, and replay", async () => {
    const admin = await createUser("admin");
    const target = await createUser("suspend");
    await enableActions(admin._id);
    const dry = await preview(String(admin._id), "SUSPEND_USER", String(target._id));
    strict_1.default.equal(dry.outcome, "PREVIEW");
    strict_1.default.ok(dry.confirmationToken);
    strict_1.default.equal((await User_1.default.findById(target._id).orFail()).governanceState, "ACTIVE");
    await strict_1.default.rejects(() => (0, adminActionDispatcher_service_1.executeAdminActionService)({ adminId: String(admin._id), adminRole: "admin", key: "BAN_USER", targetId: String(target._id), params: {}, reason: "governance test", confirmationToken: dry.confirmationToken }), /does not match action intent/);
    await strict_1.default.rejects(() => (0, adminActionDispatcher_service_1.executeAdminActionService)({ adminId: String(admin._id), adminRole: "admin", key: "SUSPEND_USER", targetId: String(target._id), params: {}, reason: "different reason", confirmationToken: dry.confirmationToken }), /does not match action intent/);
    const first = await (0, adminActionDispatcher_service_1.executeAdminActionService)({ adminId: String(admin._id), adminRole: "admin", key: "SUSPEND_USER", targetId: String(target._id), params: {}, reason: "governance test", confirmationToken: dry.confirmationToken });
    strict_1.default.equal(first.outcome, "EXECUTED");
    strict_1.default.equal((await User_1.default.findById(target._id).orFail()).governanceState, "SUSPENDED");
    const replay = await (0, adminActionDispatcher_service_1.executeAdminActionService)({ adminId: String(admin._id), adminRole: "admin", key: "SUSPEND_USER", targetId: String(target._id), params: {}, reason: "governance test", confirmationToken: dry.confirmationToken });
    strict_1.default.equal(replay.replay, true);
    strict_1.default.equal(await adminActionExecution_model_1.default.countDocuments({ actionKey: "SUSPEND_USER" }), 1);
    strict_1.default.equal(await adminActionLog_model_1.default.countDocuments({ actionKey: "SUSPEND_USER", status: "SUCCESS" }), 1);
    strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({ action: "USER_SUSPENDED" }), 1);
});
(0, node_test_1.test)("G5 activate and trust reset preserve G1/G4 state semantics", async () => {
    const admin = await createUser("admin-transition");
    const suspended = await createUser("suspended", "SUSPENDED");
    const banned = await createUser("banned", "BANNED");
    banned.abuseScore = 7;
    banned.userCooldownUntil = new Date(Date.now() + 60000);
    banned.creatorCooldownUntil = new Date(Date.now() + 60000);
    await banned.save();
    await enableActions(admin._id);
    await execute(String(admin._id), "ACTIVATE_USER", String(suspended._id));
    strict_1.default.equal((await User_1.default.findById(suspended._id).orFail()).governanceState, "ACTIVE");
    const bannedActivation = await preview(String(admin._id), "ACTIVATE_USER", String(banned._id));
    strict_1.default.equal(bannedActivation.outcome, "BLOCKED");
    await execute(String(admin._id), "RESET_USER_TRUST", String(banned._id));
    const reset = await User_1.default.findById(banned._id).orFail();
    strict_1.default.equal(reset.governanceState, "BANNED");
    strict_1.default.equal(reset.status, "banned");
    strict_1.default.equal(reset.abuseScore, 0);
    strict_1.default.equal(reset.userCooldownUntil, null);
    strict_1.default.equal(reset.creatorCooldownUntil, null);
});
(0, node_test_1.test)("G5 ban executes through the dispatcher once and retains its domain audit", async () => {
    const admin = await createUser("admin-ban");
    const target = await createUser("ban-target");
    await enableActions(admin._id);
    const first = await execute(String(admin._id), "BAN_USER", String(target._id));
    strict_1.default.equal(first.result.governanceState, "BANNED");
    strict_1.default.equal((await User_1.default.findById(target._id).orFail()).status, "banned");
    const repeated = await (0, adminActionDispatcher_service_1.executeAdminActionService)({ adminId: String(admin._id), adminRole: "admin", key: "BAN_USER", targetId: String(target._id), params: {}, reason: "governance test", confirmationToken: (await preview(String(admin._id), "BAN_USER", String(target._id))).confirmationToken });
    strict_1.default.equal(repeated.replay, true);
    strict_1.default.equal(await adminActionLog_model_1.default.countDocuments({ actionKey: "BAN_USER", status: "SUCCESS" }), 1);
    strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({ action: "USER_BANNED" }), 1);
});
(0, node_test_1.test)("G5 AdminControl blocks governance dispatcher execution without a state mutation", async () => {
    const admin = await createUser("admin-control");
    const target = await createUser("controlled");
    await enableActions(admin._id);
    await adminControl_model_1.AdminControl.create({ scope: "ACTION", mode: "DISABLED", actionKey: "BAN_USER", reason: "test block", createdBy: admin._id });
    await strict_1.default.rejects(() => preview(String(admin._id), "BAN_USER", String(target._id)), /ADMIN_CONTROL_BLOCKED/);
    strict_1.default.equal((await User_1.default.findById(target._id).orFail()).governanceState, "ACTIVE");
});
(0, node_test_1.test)("G5 creator cooldown remains canonical and exposes only a bounded dispatcher result", async () => {
    const admin = await createUser("admin-cooldown");
    const target = await createUser("creator-cooldown");
    await enableActions(admin._id);
    const profile = await creatorProfile_model_1.CreatorProfile.create({ userId: target._id, slug: `g5-${target._id}`, displayName: "G5 Creator", primaryCategory: "test", country: "IN", city: "Test", currency: "INR", status: "active" });
    const applied = await execute(String(admin._id), "APPLY_CREATOR_COOLDOWN", String(profile._id), { days: 1 });
    strict_1.default.equal(applied.result.kind, "CREATOR");
    strict_1.default.ok(applied.result.until);
    strict_1.default.equal("userId" in applied.result, false);
    const cooled = await User_1.default.findById(target._id).orFail();
    strict_1.default.ok(cooled.creatorCooldownUntil);
    strict_1.default.equal(cooled.userCooldownUntil, null);
    strict_1.default.equal(cooled.governanceState, "ACTIVE");
    strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({ action: "CREATOR_COOLDOWN_APPLIED" }), 1);
    const revoked = await execute(String(admin._id), "REVOKE_CREATOR_COOLDOWN", String(profile._id));
    strict_1.default.equal(revoked.result.revoked, true);
    strict_1.default.equal((await User_1.default.findById(target._id).orFail()).creatorCooldownUntil, null);
    strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({ action: "CREATOR_COOLDOWN_REVOKED" }), 1);
});
