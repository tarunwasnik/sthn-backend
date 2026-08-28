"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWalletIndexMaintenanceTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const removeLegacyWalletUserUniqueIndex_1 = require("../../../scripts/removeLegacyWalletUserUniqueIndex");
const compound = {
    name: "userId_1_currency_1",
    key: { userId: 1, currency: 1 },
    unique: true,
};
const registerWalletIndexMaintenanceTests = () => {
    (0, node_test_1.test)("phase10d maintenance identifies only the stale unique userId index", () => {
        const plan = (0, removeLegacyWalletUserUniqueIndex_1.planLegacyWalletUserUniqueIndexRemoval)([
            { name: "_id_", key: { _id: 1 }, unique: true },
            { name: "userId_1", key: { userId: 1 }, unique: true },
            compound,
        ]);
        strict_1.default.equal(plan.staleUserUniqueIndex?.name, "userId_1");
        strict_1.default.equal(plan.compoundCurrencyIndex.name, "userId_1_currency_1");
    });
    (0, node_test_1.test)("phase10d maintenance refuses an unexpected userId_1 signature", () => {
        strict_1.default.throws(() => (0, removeLegacyWalletUserUniqueIndex_1.planLegacyWalletUserUniqueIndexRemoval)([
            { name: "userId_1", key: { userId: 1 }, unique: false }, compound,
        ]), /expected stale unique/);
    });
    (0, node_test_1.test)("phase10d maintenance requires compound Wallet ownership uniqueness", () => {
        strict_1.default.throws(() => (0, removeLegacyWalletUserUniqueIndex_1.planLegacyWalletUserUniqueIndexRemoval)([
            { name: "userId_1", key: { userId: 1 }, unique: true },
        ]), /compound unique/);
    });
};
exports.registerWalletIndexMaintenanceTests = registerWalletIndexMaintenanceTests;
