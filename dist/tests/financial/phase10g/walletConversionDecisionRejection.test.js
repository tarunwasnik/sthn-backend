"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRejectionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionDecisionFixtures_1 = require("./fixtures/walletConversionDecisionFixtures");
const registerRejectionTests = () => {
    (0, node_test_1.test)("phase10g rejection persists bounded normalized metadata and User DTO", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const noMoneyBefore = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
        const providerCalls = fixture.provider.callCount;
        const walletBefore = await wallet_model_1.Wallet.findById(fixture.request.sourceWalletId).lean();
        const result = await (0, walletConversionDecisionFixtures_1.reject)(fixture, "INVALID_REQUEST", "  Invalid quote  ");
        strict_1.default.deepEqual({ status: result.status, decision: result.decision,
            rejectionCode: result.rejectionCode,
            rejectionReason: result.rejectionReason }, {
            status: "REJECTED", decision: "REJECT",
            rejectionCode: "INVALID_REQUEST",
            rejectionReason: "Invalid quote",
        });
        strict_1.default.equal(result.rejectedAt?.toISOString(), fixture.decisionNow.toISOString());
        strict_1.default.equal(result.approvedAt, undefined);
        const own = await fixture.requestService.getOwn(fixture.actors.userId.toString(), fixture.created.conversionReference);
        strict_1.default.equal(own.status, "REJECTED");
        strict_1.default.equal(own.rejectionReason, "Invalid quote");
        strict_1.default.deepEqual(await wallet_model_1.Wallet.findById(fixture.request.sourceWalletId).lean(), walletBefore);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_REJECTED", rejectionCode: "INVALID_REQUEST",
        }), 1);
        strict_1.default.equal(fixture.provider.callCount, providerCalls);
        strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), noMoneyBefore);
    });
    (0, node_test_1.test)("phase10g rejection validates bounded code/reason and approval data rules", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        for (const input of [
            { decision: "REJECT" },
            { decision: "REJECT", rejectionCode: "UNBOUNDED" },
            { decision: "REJECT", rejectionCode: "OTHER", rejectionReason: " " },
            { decision: "REJECT", rejectionCode: "OTHER",
                rejectionReason: "x".repeat(501) },
            { decision: "APPROVE", rejectionCode: "ADMIN_DECLINED" },
            { decision: "APPROVE", rejectionReason: "not allowed" },
            { decision: "UNKNOWN" },
        ]) {
            await strict_1.default.rejects(() => fixture.decisionService.decide({
                adminUserId: fixture.actors.adminId.toString(),
                conversionReference: fixture.created.conversionReference, ...input,
            }));
        }
        strict_1.default.equal((await walletConversionRequest_model_1.WalletConversionRequest.findOne({}))?.status, "PENDING");
    });
};
exports.registerRejectionTests = registerRejectionTests;
