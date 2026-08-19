import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";

import User from "../../models/User";
import { CreatorProfile } from "../../models/creatorProfile.model";
import AdminActionExecution from "../../models/adminActionExecution.model";
import AdminActionLog from "../../models/adminActionLog.model";
import { AuditLog } from "../../models/auditLog.model";
import { AdminControl } from "../../models/adminControl.model";
import { FeatureFlag } from "../../models/featureFlag.model";
import { featureFlagCache } from "../../services/controlPlane/featureFlagCache.service";
import { executeAdminActionService } from "../../services/adminActions/adminActionDispatcher.service";
import { connectPhase7HDatabase, clearPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => {
  await clearPhase7HDatabase();
  featureFlagCache.invalidate();
});
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

const createUser = (label: string, state: "ACTIVE" | "SUSPENDED" | "BANNED" = "ACTIVE") => User.create({
  email: `g5-${label}-${new Types.ObjectId()}@test.local`, password: "test", governanceState: state,
  status: state === "BANNED" ? "banned" : state === "SUSPENDED" ? "suspended" : "active",
});

const enableActions = async (adminId: Types.ObjectId) => {
  await FeatureFlag.create({ key: "ADMIN_ACTIONS_ENABLED", enabled: true, scope: "GLOBAL", createdBy: adminId });
  featureFlagCache.invalidate();
};

const preview = (adminId: string, key: string, targetId: string, params: Record<string, unknown> = {}) => executeAdminActionService({
  adminId, adminRole: "admin", key, targetId, params, reason: "governance test", dryRun: true,
});
const execute = async (adminId: string, key: string, targetId: string, params: Record<string, unknown> = {}) => {
  const p = await preview(adminId, key, targetId, params);
  return executeAdminActionService({ adminId, adminRole: "admin", key, targetId, params, reason: "governance test", confirmationToken: p.confirmationToken });
};

test("G5 registry-backed suspension honors dry-run, confirmation binding, action/audit logs, and replay", async () => {
  const admin = await createUser("admin"); const target = await createUser("suspend");
  await enableActions(admin._id);
  const dry = await preview(String(admin._id), "SUSPEND_USER", String(target._id));
  assert.equal(dry.outcome, "PREVIEW");
  assert.ok(dry.confirmationToken);
  assert.equal((await User.findById(target._id).orFail()).governanceState, "ACTIVE");
  await assert.rejects(() => executeAdminActionService({ adminId: String(admin._id), adminRole: "admin", key: "BAN_USER", targetId: String(target._id), params: {}, reason: "governance test", confirmationToken: dry.confirmationToken }), /does not match action intent/);
  await assert.rejects(() => executeAdminActionService({ adminId: String(admin._id), adminRole: "admin", key: "SUSPEND_USER", targetId: String(target._id), params: {}, reason: "different reason", confirmationToken: dry.confirmationToken }), /does not match action intent/);
  const first = await executeAdminActionService({ adminId: String(admin._id), adminRole: "admin", key: "SUSPEND_USER", targetId: String(target._id), params: {}, reason: "governance test", confirmationToken: dry.confirmationToken });
  assert.equal(first.outcome, "EXECUTED");
  assert.equal((await User.findById(target._id).orFail()).governanceState, "SUSPENDED");
  const replay = await executeAdminActionService({ adminId: String(admin._id), adminRole: "admin", key: "SUSPEND_USER", targetId: String(target._id), params: {}, reason: "governance test", confirmationToken: dry.confirmationToken });
  assert.equal(replay.replay, true);
  assert.equal(await AdminActionExecution.countDocuments({ actionKey: "SUSPEND_USER" }), 1);
  assert.equal(await AdminActionLog.countDocuments({ actionKey: "SUSPEND_USER", status: "SUCCESS" }), 1);
  assert.equal(await AuditLog.countDocuments({ action: "USER_SUSPENDED" }), 1);
});

test("G5 activate and trust reset preserve G1/G4 state semantics", async () => {
  const admin = await createUser("admin-transition"); const suspended = await createUser("suspended", "SUSPENDED"); const banned = await createUser("banned", "BANNED");
  banned.abuseScore = 7; banned.userCooldownUntil = new Date(Date.now() + 60_000); banned.creatorCooldownUntil = new Date(Date.now() + 60_000); await banned.save();
  await enableActions(admin._id);
  await execute(String(admin._id), "ACTIVATE_USER", String(suspended._id));
  assert.equal((await User.findById(suspended._id).orFail()).governanceState, "ACTIVE");
  const bannedActivation = await preview(String(admin._id), "ACTIVATE_USER", String(banned._id));
  assert.equal(bannedActivation.outcome, "BLOCKED");
  await execute(String(admin._id), "RESET_USER_TRUST", String(banned._id));
  const reset = await User.findById(banned._id).orFail();
  assert.equal(reset.governanceState, "BANNED"); assert.equal(reset.status, "banned"); assert.equal(reset.abuseScore, 0); assert.equal(reset.userCooldownUntil, null); assert.equal(reset.creatorCooldownUntil, null);
});

test("G5 ban executes through the dispatcher once and retains its domain audit", async () => {
  const admin = await createUser("admin-ban"); const target = await createUser("ban-target"); await enableActions(admin._id);
  const first = await execute(String(admin._id), "BAN_USER", String(target._id));
  assert.equal(first.result.governanceState, "BANNED");
  assert.equal((await User.findById(target._id).orFail()).status, "banned");
  const repeated = await executeAdminActionService({ adminId: String(admin._id), adminRole: "admin", key: "BAN_USER", targetId: String(target._id), params: {}, reason: "governance test", confirmationToken: (await preview(String(admin._id), "BAN_USER", String(target._id))).confirmationToken });
  assert.equal(repeated.replay, true);
  assert.equal(await AdminActionLog.countDocuments({ actionKey: "BAN_USER", status: "SUCCESS" }), 1);
  assert.equal(await AuditLog.countDocuments({ action: "USER_BANNED" }), 1);
});

test("G5 AdminControl blocks governance dispatcher execution without a state mutation", async () => {
  const admin = await createUser("admin-control"); const target = await createUser("controlled"); await enableActions(admin._id);
  await AdminControl.create({ scope: "ACTION", mode: "DISABLED", actionKey: "BAN_USER", reason: "test block", createdBy: admin._id });
  await assert.rejects(() => preview(String(admin._id), "BAN_USER", String(target._id)), /ADMIN_CONTROL_BLOCKED/);
  assert.equal((await User.findById(target._id).orFail()).governanceState, "ACTIVE");
});

test("G5 creator cooldown remains canonical and exposes only a bounded dispatcher result", async () => {
  const admin = await createUser("admin-cooldown"); const target = await createUser("creator-cooldown"); await enableActions(admin._id);
  const profile = await CreatorProfile.create({ userId: target._id, slug: `g5-${target._id}`, displayName: "G5 Creator", primaryCategory: "test", country: "IN", city: "Test", currency: "INR", status: "active" });
  const applied = await execute(String(admin._id), "APPLY_CREATOR_COOLDOWN", String(profile._id), { days: 1 });
  assert.equal(applied.result.kind, "CREATOR"); assert.ok(applied.result.until); assert.equal("userId" in applied.result, false);
  const cooled = await User.findById(target._id).orFail(); assert.ok(cooled.creatorCooldownUntil); assert.equal(cooled.userCooldownUntil, null); assert.equal(cooled.governanceState, "ACTIVE");
  assert.equal(await AuditLog.countDocuments({ action: "CREATOR_COOLDOWN_APPLIED" }), 1);
  const revoked = await execute(String(admin._id), "REVOKE_CREATOR_COOLDOWN", String(profile._id));
  assert.equal(revoked.result.revoked, true); assert.equal((await User.findById(target._id).orFail()).creatorCooldownUntil, null); assert.equal(await AuditLog.countDocuments({ action: "CREATOR_COOLDOWN_REVOKED" }), 1);
});
