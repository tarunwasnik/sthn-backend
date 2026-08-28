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
const adminUsers_service_1 = require("../../services/adminDashboard/adminUsers.service");
const adminUserList_dto_1 = require("../../dtos/admin/adminUserList.dto");
const admin_controller_1 = require("../../controllers/admin.controller");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
const invokeTrustReset = (adminId, userId) => new Promise((resolve, reject) => {
    const response = {
        json: () => {
            resolve();
            return response;
        },
    };
    (0, admin_controller_1.resetUserTrust)({ user: { id: adminId }, params: { id: userId } }, response).catch(reject);
});
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, node_test_1.test)("Admin dashboard User list uses an explicit allowlist", async () => {
    const user = await User_1.default.create({
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
    const { data } = await (0, adminUsers_service_1.getAllUsersService)(1, 20);
    const row = data.find((entry) => entry.id === String(user._id));
    strict_1.default.ok(row);
    strict_1.default.deepEqual(Object.keys(row).sort(), [
        "createdAt",
        "creatorStatus",
        "email",
        "id",
        "role",
        "status",
    ]);
    strict_1.default.equal("password" in row, false);
    strict_1.default.equal("googleId" in row, false);
    strict_1.default.equal("abuseScore" in row, false);
    strict_1.default.equal("governanceReason" in row, false);
    strict_1.default.equal("adminMode" in row, false);
});
(0, node_test_1.test)("Admin User list DTO excludes a future private account property by construction", () => {
    const futureAccountLikeSource = {
        _id: new mongoose_1.Types.ObjectId(),
        email: "future-field@test.local",
        role: "user",
        status: "active",
        creatorStatus: "none",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        mobileNumber: "+15551234567",
        password: "hashed-password-value",
    };
    const dto = (0, adminUserList_dto_1.toAdminUserListDto)(futureAccountLikeSource);
    strict_1.default.equal("mobileNumber" in dto, false);
    strict_1.default.equal("password" in dto, false);
});
(0, node_test_1.test)("trust reset stores bounded before and after account state in audit history", async () => {
    const admin = await User_1.default.create({
        email: "trust-admin@test.local",
        password: "hashed-password-value",
        role: "admin",
        status: "active",
        governanceState: "ACTIVE",
    });
    const target = await User_1.default.create({
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
    const audit = await auditLog_model_1.AuditLog.findOne({
        action: "USER_TRUST_RESET",
        entityId: target._id,
    }).lean();
    strict_1.default.ok(audit);
    const expectedKeys = [
        "abuseScore",
        "creatorCooldownUntil",
        "governanceState",
        "status",
        "userCooldownUntil",
    ];
    strict_1.default.deepEqual(Object.keys(audit.before ?? {}).sort(), expectedKeys);
    strict_1.default.deepEqual(Object.keys(audit.after ?? {}).sort(), expectedKeys);
    strict_1.default.equal(audit.before?.abuseScore, 27);
    strict_1.default.equal(audit.after?.abuseScore, 0);
    strict_1.default.equal(audit.after?.userCooldownUntil, null);
    strict_1.default.equal(audit.after?.creatorCooldownUntil, null);
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
        strict_1.default.equal(privateField in (audit.before ?? {}), false, `${privateField} must not enter audit before state`);
        strict_1.default.equal(privateField in (audit.after ?? {}), false, `${privateField} must not enter audit after state`);
    }
});
