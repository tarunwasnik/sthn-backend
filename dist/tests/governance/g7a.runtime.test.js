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
const adminGovernanceRead_service_1 = require("../../services/adminGovernanceRead.service");
const auditLog_service_1 = require("../../services/auditLog.service");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
const user = (suffix, state = "ACTIVE") => User_1.default.create({ email: `g7a-${suffix}-${new mongoose_1.Types.ObjectId()}@test.local`, password: "private", governanceState: state, status: state === "ACTIVE" ? "active" : state.toLowerCase() });
(0, node_test_1.test)("G7A returns bounded canonical governance and Creator compatibility separately", async () => {
    const target = await user("creator", "SUSPENDED");
    target.abuseScore = 4;
    target.creatorCooldownUntil = new Date(Date.now() + 60000);
    await target.save();
    const profile = await creatorProfile_model_1.CreatorProfile.create({ userId: target._id, slug: `g7a-${target._id}`, displayName: "G7A", primaryCategory: "test", country: "IN", city: "Test", currency: "INR", status: "active" });
    const dto = await (0, adminGovernanceRead_service_1.getAdminGovernanceTarget)(String(target._id));
    strict_1.default.equal(dto.user.governanceState, "SUSPENDED");
    strict_1.default.equal(dto.user.abuseScore, 4);
    strict_1.default.equal(dto.creator?.creatorProfileId, String(profile._id));
    strict_1.default.equal(dto.resolved.blocksOutgoingBookings, true);
    strict_1.default.equal("password" in dto.user, false);
    strict_1.default.equal("googleId" in dto.user, false);
});
(0, node_test_1.test)("G7A returns creator null for normal User and rejects missing target", async () => {
    const target = await user("normal");
    const dto = await (0, adminGovernanceRead_service_1.getAdminGovernanceTarget)(String(target._id));
    strict_1.default.equal(dto.creator, null);
    await strict_1.default.rejects(() => (0, adminGovernanceRead_service_1.getAdminGovernanceTarget)(String(new mongoose_1.Types.ObjectId())), /User not found/);
});
(0, node_test_1.test)("G7A audit entityId filter isolates target records with pagination", async () => {
    const a = await user("audit-a");
    const b = await user("audit-b");
    await auditLog_model_1.AuditLog.create([{ actorType: "ADMIN", actorId: a._id, action: "USER_SUSPENDED", entityType: "USER", entityId: a._id }, { actorType: "ADMIN", actorId: b._id, action: "USER_BANNED", entityType: "USER", entityId: b._id }]);
    const filtered = await (0, auditLog_service_1.queryAuditLogs)({ entityId: String(a._id), page: 1, limit: 10 });
    strict_1.default.equal(filtered.pagination.total, 1);
    strict_1.default.equal(String(filtered.logs[0].entityId), String(a._id));
    const unfiltered = await (0, auditLog_service_1.queryAuditLogs)({ page: 1, limit: 10 });
    strict_1.default.equal(unfiltered.pagination.total, 2);
});
