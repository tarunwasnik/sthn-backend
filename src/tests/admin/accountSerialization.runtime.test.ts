import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import User from "../../models/User";
import { AuditLog } from "../../models/auditLog.model";
import { getAllUsersService } from "../../services/adminDashboard/adminUsers.service";
import { toAdminUserListDto } from "../../dtos/admin/adminUserList.dto";
import { resetUserTrust } from "../../controllers/admin.controller";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";

const invokeTrustReset = (adminId: string, userId: string) => new Promise<void>((resolve, reject) => {
  const response = {
    json: () => {
      resolve();
      return response;
    },
  } as unknown as Response;

  resetUserTrust(
    { user: { id: adminId }, params: { id: userId } } as unknown as Request,
    response,
  ).catch(reject);
});

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("Admin dashboard User list uses an explicit allowlist", async () => {
  const user = await User.create({
    email: "account-list@test.local",
    password: "hashed-password-value",
    authProvider: "google",
    googleId: "private-google-id",
    role: "creator",
    status: "active",
    creatorStatus: "approved",
    abuseScore: 18,
    governanceState: "ACTIVE",
    governanceReason: "private-governance-reason",
    userCooldownReason: "private-user-cooldown-reason",
    adminMode: "OPERATIONS",
  });

  const { data } = await getAllUsersService(1, 20);
  const row = data.find((entry) => entry.id === String(user._id));

  assert.ok(row);
  assert.deepEqual(Object.keys(row).sort(), [
    "createdAt",
    "creatorStatus",
    "email",
    "id",
    "role",
    "status",
  ]);
  assert.equal("password" in row, false);
  assert.equal("googleId" in row, false);
  assert.equal("abuseScore" in row, false);
  assert.equal("governanceReason" in row, false);
  assert.equal("adminMode" in row, false);
});

test("Admin User list DTO excludes a future private account property by construction", () => {
  const futureAccountLikeSource = {
    _id: new Types.ObjectId(),
    email: "future-field@test.local",
    role: "user",
    status: "active",
    creatorStatus: "none",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    mobileNumber: "+15551234567",
    password: "hashed-password-value",
  } as const;
  const dto = toAdminUserListDto(futureAccountLikeSource);

  assert.equal("mobileNumber" in dto, false);
  assert.equal("password" in dto, false);
});

test("trust reset stores bounded before and after account state in audit history", async () => {
  const admin = await User.create({
    email: "trust-admin@test.local",
    password: "hashed-password-value",
    role: "admin",
    status: "active",
    governanceState: "ACTIVE",
  });
  const target = await User.create({
    email: "trust-target@test.local",
    password: "hashed-password-value",
    authProvider: "google",
    googleId: "private-google-id",
    status: "active",
    governanceState: "ACTIVE",
    abuseScore: 27,
    governanceReason: "private-governance-reason",
    userCooldownUntil: new Date("2027-01-01T00:00:00.000Z"),
    userCooldownReason: "private-user-cooldown-reason",
    creatorCooldownUntil: new Date("2027-02-01T00:00:00.000Z"),
    creatorCooldownReason: "private-creator-cooldown-reason",
  });

  await invokeTrustReset(String(admin._id), String(target._id));

  const audit = await AuditLog.findOne({
    action: "USER_TRUST_RESET",
    entityId: target._id,
  }).lean();

  assert.ok(audit);
  const expectedKeys = [
    "abuseScore",
    "creatorCooldownUntil",
    "governanceState",
    "status",
    "userCooldownUntil",
  ];
  assert.deepEqual(Object.keys(audit.before ?? {}).sort(), expectedKeys);
  assert.deepEqual(Object.keys(audit.after ?? {}).sort(), expectedKeys);
  assert.equal(audit.before?.abuseScore, 27);
  assert.equal(audit.after?.abuseScore, 0);
  assert.equal(audit.after?.userCooldownUntil, null);
  assert.equal(audit.after?.creatorCooldownUntil, null);

  for (const privateField of [
    "email",
    "password",
    "authProvider",
    "googleId",
    "governanceReason",
    "userCooldownReason",
    "creatorCooldownReason",
    "mobileNumber",
  ]) {
    assert.equal(privateField in (audit.before ?? {}), false, `${privateField} must not enter audit before state`);
    assert.equal(privateField in (audit.after ?? {}), false, `${privateField} must not enter audit after state`);
  }
});
