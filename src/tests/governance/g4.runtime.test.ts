import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";

import User from "../../models/User";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { resolveAccountGovernance } from "../../services/accountGovernance/accountGovernanceResolver.service";
import { applyAccountCooldown, resetAccountTrust, revokeAccountCooldown } from "../../services/accountGovernance/cooldownLifecycle.service";
import { applyCreatorCooldownService } from "../../services/adminActions/applyCreatorCooldown.service";
import { revokeCreatorCooldownService } from "../../services/adminActions/revokeCreatorCooldown.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

const createActor = async (suffix: string, governanceState: "ACTIVE" | "SUSPENDED" | "BANNED" = "ACTIVE") => {
  const user = await User.create({
    email: `g4-${suffix}-${new Types.ObjectId()}@test.local`, password: "test", status: governanceState === "BANNED" ? "banned" : governanceState === "SUSPENDED" ? "suspended" : "active", governanceState,
  });
  const profile = await CreatorProfile.create({ userId: user._id, slug: `g4-${suffix}-${user._id}`, displayName: "G4 Creator", primaryCategory: "test", country: "IN", city: "Test", currency: "INR", status: "active" });
  return { user, profile };
};

test("G4 user and creator cooldowns are independent and resolver capabilities match the frozen matrix", async () => {
  const { user } = await createActor("independent");
  const until = new Date(Date.now() + 60_000);
  await applyAccountCooldown({ userId: String(user._id), kind: "USER", until, reason: "user-only" });
  let resolved = resolveAccountGovernance(await User.findById(user._id).orFail());
  assert.equal(resolved.blocksOutgoingBookings, true);
  assert.equal(resolved.blocksIncomingBookings, false);
  assert.equal(resolved.blocksAcceptingBookings, false);
  await applyAccountCooldown({ userId: String(user._id), kind: "CREATOR", until: new Date(Date.now() + 120_000), reason: "creator-only" });
  resolved = resolveAccountGovernance(await User.findById(user._id).orFail());
  assert.equal(resolved.blocksOutgoingBookings, true);
  assert.equal(resolved.blocksIncomingBookings, true);
  assert.equal(resolved.blocksAcceptingBookings, true);
  await revokeAccountCooldown({ userId: String(user._id), kind: "USER" });
  resolved = resolveAccountGovernance(await User.findById(user._id).orFail());
  assert.equal(resolved.isUserCooldownActive, false);
  assert.equal(resolved.isCreatorCooldownActive, true);
  await revokeAccountCooldown({ userId: String(user._id), kind: "CREATOR" });
  resolved = resolveAccountGovernance(await User.findById(user._id).orFail());
  assert.equal(resolved.condition, "ACTIVE");
});

test("G4 admin creator cooldown writes canonical User creator fields and revokes without touching user cooldown", async () => {
  const admin = await createActor("admin");
  const { user, profile } = await createActor("target");
  await applyAccountCooldown({ userId: String(user._id), kind: "USER", until: new Date(Date.now() + 60_000), reason: "preserve" });
  await applyCreatorCooldownService({ adminId: String(admin.user._id), creatorProfileId: String(profile._id), days: 1, reason: "admin creator cooldown" });
  let reloaded = await User.findById(user._id).orFail();
  assert.ok(reloaded.creatorCooldownUntil);
  assert.ok(reloaded.userCooldownUntil);
  assert.equal(reloaded.creatorCooldownReason, "admin creator cooldown");
  await revokeCreatorCooldownService({ adminId: String(admin.user._id), creatorProfileId: String(profile._id), reason: "revoke" });
  reloaded = await User.findById(user._id).orFail();
  const reloadedProfile = await CreatorProfile.findById(profile._id).orFail();
  assert.equal(reloaded.creatorCooldownUntil, null);
  assert.equal(reloaded.creatorCooldownReason, null);
  assert.equal(reloaded.creatorCooldownBy, null);
  assert.equal(reloaded.userCooldownReason, "preserve");
  assert.equal(reloadedProfile.creatorCooldownUntil, null);
});

test("G4 cooldown expiry is time-derived at exact boundary", async () => {
  const { user } = await createActor("expiry");
  const now = new Date("2026-08-12T00:00:00.000Z");
  user.userCooldownUntil = new Date(now.getTime());
  user.creatorCooldownUntil = new Date(now.getTime() + 1);
  await user.save();
  let resolved = resolveAccountGovernance(await User.findById(user._id).orFail(), now);
  assert.equal(resolved.isUserCooldownActive, false);
  assert.equal(resolved.isCreatorCooldownActive, true);
  resolved = resolveAccountGovernance(await User.findById(user._id).orFail(), new Date(now.getTime() + 1));
  assert.equal(resolved.isCreatorCooldownActive, false);
});

test("G4 trust reset clears cooldown metadata while preserving canonical suspension and ban", async () => {
  for (const state of ["ACTIVE", "SUSPENDED", "BANNED"] as const) {
    const { user } = await createActor(`trust-${state}`, state);
    user.abuseScore = 55;
    user.userCooldownUntil = new Date(Date.now() + 60_000);
    user.userCooldownReason = "user";
    user.creatorCooldownUntil = new Date(Date.now() + 60_000);
    user.creatorCooldownReason = "creator";
    await user.save();
    const reset = await resetAccountTrust(String(user._id));
    assert.equal(reset.governanceState, state);
    assert.equal(reset.status, state === "BANNED" ? "banned" : state === "SUSPENDED" ? "suspended" : "active");
    assert.equal(reset.abuseScore, 0);
    assert.equal(reset.userCooldownUntil, null);
    assert.equal(reset.creatorCooldownUntil, null);
    assert.equal(reset.userCooldownReason, null);
    assert.equal(reset.creatorCooldownReason, null);
  }
});
