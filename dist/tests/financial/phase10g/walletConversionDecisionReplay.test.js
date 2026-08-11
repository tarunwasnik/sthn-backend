"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionDecisionFixtures_1 = require("./fixtures/walletConversionDecisionFixtures");
const registerReplayTests = () => {
    (0, node_test_1.test)("phase10g approval replay preserves original actor/timestamp after balance change", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const firstNoMoney = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
        const first = await (0, walletConversionDecisionFixtures_1.approve)(fixture);
        strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), firstNoMoney);
        await wallet_model_1.Wallet.findByIdAndUpdate(fixture.request.sourceWalletId, { $set: {
                currentBalance: 1, availableBalance: 1,
            } }, { runValidators: true });
        const replayNoMoney = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
        const replay = await (0, walletConversionDecisionFixtures_1.approve)(fixture);
        strict_1.default.equal(replay.status, "APPROVED");
        strict_1.default.equal(replay.decidedAt?.toISOString(), first.decidedAt?.toISOString());
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_APPROVED"
        }), 1);
        strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), replayNoMoney);
        const otherAdmin = fixture.actors.creatorId;
        await strict_1.default.rejects(() => fixture.decisionService.decide({
            adminUserId: otherAdmin.toString(),
            conversionReference: fixture.created.conversionReference,
            decision: "APPROVE",
        }), (error) => error.code === "WALLET_CONVERSION_DECISION_CONFLICT");
    });
    (0, node_test_1.test)("phase10g rejection replay requires exact normalized payload and actor", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const noMoneyBefore = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
        const first = await (0, walletConversionDecisionFixtures_1.reject)(fixture, "OTHER", "  Bounded reason  ");
        const replay = await (0, walletConversionDecisionFixtures_1.reject)(fixture, "OTHER", "Bounded reason");
        strict_1.default.equal(replay.decidedAt?.toISOString(), first.decidedAt?.toISOString());
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_REJECTED"
        }), 1);
        strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), noMoneyBefore);
        for (const conflicting of [
            { decision: "REJECT", rejectionCode: "OTHER",
                rejectionReason: "Different reason" },
            { decision: "REJECT", rejectionCode: "ADMIN_DECLINED",
                rejectionReason: "Bounded reason" },
            { decision: "APPROVE" },
        ]) {
            await strict_1.default.rejects(() => fixture.decisionService.decide({
                adminUserId: fixture.actors.adminId.toString(),
                conversionReference: fixture.created.conversionReference,
                ...conflicting,
            }), (error) => error.code === "WALLET_CONVERSION_DECISION_CONFLICT");
        }
    });
    (0, node_test_1.test)("phase10g rejection after approval conflicts", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await (0, walletConversionDecisionFixtures_1.approve)(fixture);
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.reject)(fixture), (error) => error.code === "WALLET_CONVERSION_DECISION_CONFLICT");
    });
};
exports.registerReplayTests = registerReplayTests;
