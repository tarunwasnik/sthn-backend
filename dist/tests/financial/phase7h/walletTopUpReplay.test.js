"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const http_1 = require("./helpers/http");
const topUpFixtures_1 = require("./fixtures/topUpFixtures");
const registerReplayTests = () => {
    (0, node_test_1.test)("phase7h replay: service, reload, and Admin endpoint preserve one effect", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 725);
        const first = await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
        const firstRequest = await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
        const firstWallet = await wallet_model_1.Wallet.findById(actors.wallet._id);
        strict_1.default.ok(firstWallet && firstRequest.completedAt);
        const immediate = await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
        await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
        const reloaded = await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
        process.env.JWT_SECRET = "phase7h-test-jwt-secret";
        const token = jsonwebtoken_1.default.sign({ id: actors.adminId.toString(), role: "admin" }, process.env.JWT_SECRET);
        const server = await (0, http_1.startTestHttpServer)();
        try {
            const response = await fetch(`${server.baseUrl}/api/v1/admin/financial/wallet-top-up-requests/${request.topUpReference}/complete-accounting`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
            strict_1.default.equal(response.status, 200);
            const body = await response.json();
            strict_1.default.equal(body.success, true);
            strict_1.default.equal("ledgerEntryId" in body.data, false);
            strict_1.default.equal("fingerprint" in body.data, false);
        }
        finally {
            await server.close();
        }
        const [ledgerCount, projectionCount, wallet, completed, provider] = await Promise.all([
            ledgerEntry_model_1.LedgerEntry.countDocuments({ "metadata.topUpReference": request.topUpReference }),
            walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({ operationReference: first.projectionOperationReference }),
            wallet_model_1.Wallet.findById(actors.wallet._id),
            (0, topUpFixtures_1.reloadRequest)(request.topUpReference),
            internalTopUpFunding_model_1.InternalTopUpFunding.findOne({ topUpReference: request.topUpReference }),
        ]);
        strict_1.default.equal(ledgerCount, 1);
        strict_1.default.equal(projectionCount, 1);
        strict_1.default.equal(wallet?.availableBalance, firstWallet.availableBalance);
        strict_1.default.equal(immediate.ledgerReference, first.ledgerReference);
        strict_1.default.equal(reloaded.projectionOperationReference, first.projectionOperationReference);
        strict_1.default.equal(completed.accountingTransactionId, firstRequest.accountingTransactionId);
        strict_1.default.equal(completed.completedAt?.getTime(), firstRequest.completedAt.getTime());
        strict_1.default.equal(provider?.status, "SUCCEEDED");
    });
};
exports.registerReplayTests = registerReplayTests;
