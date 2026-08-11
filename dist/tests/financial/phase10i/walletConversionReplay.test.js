"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionAccountingFixtures_1 = require("./fixtures/walletConversionAccountingFixtures");
const registerReplayTests = () => {
    (0, node_test_1.test)("phase10i completed replay validates and creates no duplicate effect", async () => {
        const fixture = await (0, walletConversionAccountingFixtures_1.createAccountingFixture)();
        const first = await (0, walletConversionAccountingFixtures_1.account)(fixture);
        const before = {
            wallets: await wallet_model_1.Wallet.find({}).sort({ _id: 1 }).lean(),
            ledger: await ledgerEntry_model_1.LedgerEntry.countDocuments({}),
            projections: await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}),
            audits: await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({}),
        };
        const replay = await (0, walletConversionAccountingFixtures_1.account)(fixture);
        strict_1.default.deepEqual(replay, first);
        strict_1.default.deepEqual(await wallet_model_1.Wallet.find({}).sort({ _id: 1 }).lean(), before.wallets);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), before.ledger);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), before.projections);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({}), before.audits);
        strict_1.default.equal(fixture.executions, 1);
        const decisionReplay = await fixture.decisionService.decide({
            adminUserId: fixture.actors.adminId.toString(),
            conversionReference: fixture.created.conversionReference,
            decision: "APPROVE",
        });
        strict_1.default.equal(decisionReplay.status, "COMPLETED");
        strict_1.default.equal(decisionReplay.decision, "APPROVE");
    });
};
exports.registerReplayTests = registerReplayTests;
