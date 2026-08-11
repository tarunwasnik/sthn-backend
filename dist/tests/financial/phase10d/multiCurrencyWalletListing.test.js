"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWalletListingTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const User_1 = __importDefault(require("../../../models/User"));
const walletCreation_service_1 = require("../../../services/wallet/walletCreation.service");
const multiCurrencyTopUpFixtures_1 = require("./fixtures/multiCurrencyTopUpFixtures");
const safeWalletKeys = [
    "currency", "available", "reserved", "locked", "current", "createdAt",
];
const registerWalletListingTests = () => {
    (0, node_test_1.test)("phase10d listing: authenticated User receives only owned Wallets in stable order", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        await Promise.all([
            walletCreation_service_1.walletCreationService.createWallet(actors.userId, "USD"),
            walletCreation_service_1.walletCreationService.createWallet(actors.userId, "EUR"),
        ]);
        const other = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        await walletCreation_service_1.walletCreationService.createWallet(other.userId, "GBP");
        const server = await (0, multiCurrencyTopUpFixtures_1.startWalletServer)();
        try {
            const response = await fetch(`${server.baseUrl}/api/v1/wallet/all`, {
                headers: { authorization: `Bearer ${(0, multiCurrencyTopUpFixtures_1.authToken)(actors.userId)}` },
            });
            const body = await response.json();
            strict_1.default.equal(response.status, 200, JSON.stringify(body));
            strict_1.default.deepEqual(body.data.map((item) => item.currency), ["EUR", "INR", "USD"]);
            strict_1.default.ok(body.data.every((item) => Object.keys(item).sort().join("|") ===
                safeWalletKeys.slice().sort().join("|")));
            strict_1.default.ok(body.data.every((item) => !Object.keys(item).some((key) => /id|fingerprint|version/i.test(key))));
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase10d listing: Creator role reuses the same User-owned Wallet list", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        await walletCreation_service_1.walletCreationService.createWallet(actors.userId, "USD");
        await User_1.default.findByIdAndUpdate(actors.userId, { role: "creator" });
        const server = await (0, multiCurrencyTopUpFixtures_1.startWalletServer)();
        try {
            const response = await fetch(`${server.baseUrl}/api/v1/wallet/all`, {
                headers: { authorization: `Bearer ${(0, multiCurrencyTopUpFixtures_1.authToken)(actors.userId)}` },
            });
            const body = await response.json();
            strict_1.default.equal(response.status, 200, JSON.stringify(body));
            strict_1.default.deepEqual(body.data.map((item) => item.currency), ["INR", "USD"]);
            strict_1.default.ok(body.data.every((item) => !item.creatorId));
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase10d metadata: authenticated currency registry exposes minor units without rates", async () => {
        const actors = await (0, multiCurrencyTopUpFixtures_1.createMultiCurrencyActors)();
        const server = await (0, multiCurrencyTopUpFixtures_1.startWalletServer)();
        try {
            const response = await fetch(`${server.baseUrl}/api/v1/wallet/currencies`, { headers: { authorization: `Bearer ${(0, multiCurrencyTopUpFixtures_1.authToken)(actors.userId)}` } });
            const body = await response.json();
            strict_1.default.equal(response.status, 200, JSON.stringify(body));
            const jpy = body.data.find((item) => item.code === "JPY");
            const usd = body.data.find((item) => item.code === "USD");
            strict_1.default.deepEqual(jpy, {
                code: "JPY",
                displayName: "Japanese Yen",
                symbol: "¥",
                minorUnits: 0,
                walletEnabled: true,
                topUpEnabled: true,
            });
            strict_1.default.equal(usd.minorUnits, 2);
            strict_1.default.ok(body.data.every((item) => !Object.keys(item).some((key) => /rate|provider|spread|fee/i.test(key))));
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWalletListingTests = registerWalletListingTests;
