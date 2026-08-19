import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import User from "../../models/User";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { AuditLog } from "../../models/auditLog.model";
import { getAdminGovernanceTarget } from "../../services/adminGovernanceRead.service";
import { queryAuditLogs } from "../../services/auditLog.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });
const user = (suffix: string, state: "ACTIVE" | "SUSPENDED" | "BANNED" = "ACTIVE") => User.create({ email: `g7a-${suffix}-${new Types.ObjectId()}@test.local`, password: "private", governanceState: state, status: state === "ACTIVE" ? "active" : state.toLowerCase() });

test("G7A returns bounded canonical governance and Creator compatibility separately", async () => {
  const target = await user("creator", "SUSPENDED"); target.abuseScore = 4; target.creatorCooldownUntil = new Date(Date.now() + 60_000); await target.save();
  const profile = await CreatorProfile.create({ userId: target._id, slug: `g7a-${target._id}`, displayName: "G7A", primaryCategory: "test", country: "IN", city: "Test", currency: "INR", status: "active" });
  const dto = await getAdminGovernanceTarget(String(target._id));
  assert.equal(dto.user.governanceState, "SUSPENDED"); assert.equal(dto.user.abuseScore, 4); assert.equal(dto.creator?.creatorProfileId, String(profile._id)); assert.equal(dto.resolved.blocksOutgoingBookings, true);
  assert.equal("password" in dto.user, false); assert.equal("googleId" in dto.user, false);
});
test("G7A returns creator null for normal User and rejects missing target", async () => {
  const target = await user("normal"); const dto = await getAdminGovernanceTarget(String(target._id)); assert.equal(dto.creator, null); await assert.rejects(() => getAdminGovernanceTarget(String(new Types.ObjectId())), /User not found/);
});
test("G7A audit entityId filter isolates target records with pagination", async () => {
  const a = await user("audit-a"); const b = await user("audit-b");
  await AuditLog.create([{ actorType: "ADMIN", actorId: a._id, action: "USER_SUSPENDED", entityType: "USER", entityId: a._id }, { actorType: "ADMIN", actorId: b._id, action: "USER_BANNED", entityType: "USER", entityId: b._id }]);
  const filtered = await queryAuditLogs({ entityId: String(a._id), page: 1, limit: 10 }); assert.equal(filtered.pagination.total, 1); assert.equal(String(filtered.logs[0].entityId), String(a._id));
  const unfiltered = await queryAuditLogs({ page: 1, limit: 10 }); assert.equal(unfiltered.pagination.total, 2);
});
