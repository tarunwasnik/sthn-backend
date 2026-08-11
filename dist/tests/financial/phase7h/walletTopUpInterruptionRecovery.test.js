"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerInterruptionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const topUpFixtures_1 = require("./fixtures/topUpFixtures");
const registerInterruptionTests = () => {
    (0, node_test_1.test)("phase7h interruption: provider success with no accounting resumes completely", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 300);
        await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
        strict_1.default.equal((await (0, topUpFixtures_1.reloadRequest)(request.topUpReference)).status, "COMPLETED");
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ "metadata.topUpReference": request.topUpReference }), 1);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({ walletId: actors.wallet._id }), 1);
        strict_1.default.equal((await wallet_model_1.Wallet.findById(actors.wallet._id))?.availableBalance, 300);
    });
    (0, node_test_1.test)("phase7h interruption: Ledger-only state reuses Ledger and credits once", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request, funding } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 450);
        const { ledger } = await (0, topUpFixtures_1.establishLedgerStage)(request, funding);
        await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
        const persisted = await ledgerEntry_model_1.LedgerEntry.find({ "metadata.topUpReference": request.topUpReference });
        strict_1.default.equal(persisted.length, 1);
        strict_1.default.ok(persisted[0]._id.equals(ledger._id));
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({ walletId: actors.wallet._id }), 1);
        strict_1.default.equal((await wallet_model_1.Wallet.findById(actors.wallet._id))?.availableBalance, 450);
        strict_1.default.equal((await (0, topUpFixtures_1.reloadRequest)(request.topUpReference)).status, "COMPLETED");
    });
    (0, node_test_1.test)("phase7h interruption: Ledger-plus-projection state completes without another credit", async () => {
        const actors = await (0, topUpFixtures_1.createActors)();
        const { request, funding } = await (0, topUpFixtures_1.createFundedTopUp)(actors, 900);
        const stage = await (0, topUpFixtures_1.establishProjectionStage)(request, funding);
        const before = await wallet_model_1.Wallet.findById(actors.wallet._id);
        await (0, topUpFixtures_1.completeFundedTopUp)(request.topUpReference);
        const after = await wallet_model_1.Wallet.findById(actors.wallet._id);
        strict_1.default.equal(before?.availableBalance, 900);
        strict_1.default.equal(after?.availableBalance, 900);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({ "metadata.topUpReference": request.topUpReference }), 1);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({ operationKey: stage.identity.operationKey }), 1);
        const completed = await (0, topUpFixtures_1.reloadRequest)(request.topUpReference);
        strict_1.default.ok(completed.ledgerEntryId?.equals(stage.ledger._id));
        strict_1.default.ok(completed.walletProjectionOperationId?.equals(stage.operation._id));
    });
};
exports.registerInterruptionTests = registerInterruptionTests;
