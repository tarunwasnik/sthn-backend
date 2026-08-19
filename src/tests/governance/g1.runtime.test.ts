import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";

import User from "../../models/User";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { AuditLog } from "../../models/auditLog.model";
import { triggerSuspensionLifecycle } from "../../services/accountGovernance/suspensionLifecycle.service";
import { removeSuspensionLifecycle } from "../../services/accountGovernance/unsuspendLifecycle.service";
import { triggerBanLifecycle } from "../../services/accountGovernance/banLifecycle.service";
import { resolveAccountGovernance } from "../../services/accountGovernance/accountGovernanceResolver.service";
import { withdrawalEligibilityService } from "../../services/financial/withdrawalEligibility.service";
import { createAuditLog } from "../../services/auditLog.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

const createUser = async (suffix: string) => User.create({
  email: `g1-${suffix}-${new Types.ObjectId().toString()}@test.local`,
  password: "test",
  status: "active",
  governanceState: "ACTIVE",
});

test("G1 suspension and activation synchronize canonical governance without touching cooldowns", async () => {
  const admin = await createUser("admin");
  const target = await createUser("target");
  const cooldown = new Date(Date.now() + 60_000);
  target.userCooldownUntil = cooldown;
  await target.save();

  const suspended = await triggerSuspensionLifecycle({ adminId: String(admin._id), userId: String(target._id), reason: "policy breach" });
  assert.equal(suspended.governanceState, "SUSPENDED");
  assert.equal(suspended.status, "suspended");
  assert.equal(suspended.bookingsMutated, false);
  assert.equal(resolveAccountGovernance(await User.findById(target._id).orFail()).blocksOutgoingBookings, true);

  const activated = await removeSuspensionLifecycle({ adminId: String(admin._id), userId: String(target._id), reason: "review complete" });
  assert.equal(activated.governanceState, "ACTIVE");
  const reloaded = await User.findById(target._id).orFail();
  assert.equal(reloaded.status, "active");
  assert.equal(reloaded.userCooldownUntil?.getTime(), cooldown.getTime());
  assert.equal(resolveAccountGovernance(reloaded).condition, "COOLDOWN");
});

test("G1 canonical ban blocks account, marketplace capabilities, and withdrawal eligibility", async () => {
  const admin = await createUser("admin");
  const target = await createUser("creator");
  await CreatorProfile.create({ userId: target._id, slug: `g1-${target._id}`, displayName: "G1 Creator", primaryCategory: "test", country: "IN", city: "Test", currency: "INR", status: "active" });
  const banned = await triggerBanLifecycle({ adminId: String(admin._id), userId: String(target._id), reason: "serious policy breach" });
  assert.equal(banned.governanceState, "BANNED");
  assert.equal(banned.status, "banned");
  assert.equal(banned.bookingsMutated, false);
  const governance = resolveAccountGovernance(await User.findById(target._id).orFail());
  assert.equal(governance.hasNoAccountAccess, true);
  assert.equal(governance.blocksOutgoingBookings, true);
  assert.equal(governance.blocksIncomingBookings, true);
  assert.equal(governance.blocksAcceptingBookings, true);
  const eligibility = await withdrawalEligibilityService.evaluate({ creatorId: String(target._id), amount: { amount: 100, currency: "INR" }, destinationReference: "DESTINATION" });
  assert.deepEqual(eligibility, { allowed: false, reason: "GOVERNANCE_BLOCK" });
  const replay = await triggerBanLifecycle({ adminId: String(admin._id), userId: String(target._id), reason: "ignored" });
  assert.equal(replay.replay, true);
  await assert.rejects(() => removeSuspensionLifecycle({ adminId: String(admin._id), userId: String(target._id), reason: "not a ban reversal" }));
});

test("G1 governance audit records canonical before and after state", async () => {
  const admin = await createUser("admin");
  const target = await createUser("target");
  const result = await triggerSuspensionLifecycle({ adminId: String(admin._id), userId: String(target._id), reason: "audit reason" });
  await createAuditLog({ actorType: "ADMIN", actorId: admin._id as mongoose.Types.ObjectId, action: "USER_SUSPENDED", entityType: "USER", entityId: target._id as mongoose.Types.ObjectId, before: { governanceState: result.previousGovernanceState }, after: { governanceState: result.governanceState, status: result.status, reason: result.reason } });
  const audit = await AuditLog.findOne({ action: "USER_SUSPENDED" }).lean().orFail();
  assert.equal(audit.before?.governanceState, "ACTIVE");
  assert.equal(audit.after?.governanceState, "SUSPENDED");
  assert.equal(audit.after?.status, "suspended");
});
