"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerApprovalTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionDecisionFixtures_1 = require("./fixtures/walletConversionDecisionFixtures");
const immutableGraph = (request) => ({
    conversionReference: request.conversionReference,
    conversionKey: request.conversionKey,
    userId: request.userId.toString(),
    sourceWalletId: request.sourceWalletId.toString(),
    targetWalletId: request.targetWalletId?.toString(),
    sourceCurrency: request.sourceCurrency, targetCurrency: request.targetCurrency,
    sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
    fxSnapshotId: request.fxSnapshotId.toString(),
    fxSnapshotReference: request.fxSnapshotReference,
    fxProvider: request.fxProvider,
    fxEffectiveDate: request.fxEffectiveDate.toISOString(),
    rateValue: request.rateValue, rateScale: request.rateScale,
    inverseRateValue: request.inverseRateValue,
    inverseRateScale: request.inverseRateScale,
    sourceMinorUnits: request.sourceMinorUnits,
    targetMinorUnits: request.targetMinorUnits,
    idempotencyKey: request.idempotencyKey,
    requestFingerprint: request.requestFingerprint,
    requestedAt: request.requestedAt.toISOString(),
});
const registerApprovalTests = () => {
    (0, node_test_1.test)("phase10g approval records only the guarded Admin decision", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const beforeGraph = immutableGraph(fixture.request);
        const noMoneyBefore = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
        const walletBefore = await wallet_model_1.Wallet.findById(fixture.request.sourceWalletId).lean();
        const providerCalls = fixture.provider.callCount;
        const result = await (0, walletConversionDecisionFixtures_1.approve)(fixture);
        const stored = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: result.conversionReference,
        }).select("+conversionKey +userId +sourceWalletId +targetWalletId +fxSnapshotId " +
            "+rateValue +rateScale +inverseRateValue +inverseRateScale " +
            "+sourceMinorUnits +targetMinorUnits +idempotencyKey +requestFingerprint " +
            "+decidedBy");
        strict_1.default.equal(result.status, "APPROVED");
        strict_1.default.equal(result.decision, "APPROVE");
        strict_1.default.equal(result.decidedAt?.toISOString(), fixture.decisionNow.toISOString());
        strict_1.default.equal(result.approvedAt?.toISOString(), fixture.decisionNow.toISOString());
        strict_1.default.equal(result.rejectedAt, undefined);
        strict_1.default.ok(stored?.decidedBy?.equals(fixture.actors.adminId));
        strict_1.default.deepEqual(immutableGraph(stored), beforeGraph);
        strict_1.default.deepEqual(await wallet_model_1.Wallet.findById(fixture.request.sourceWalletId).lean(), walletBefore);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_APPROVED"
        }), 1);
        strict_1.default.equal(fixture.provider.callCount, providerCalls);
        strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), noMoneyBefore);
    });
    (0, node_test_1.test)("phase10g approval validates but does not mutate a bound target Wallet", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)({ createTargetWallet: true });
        const noMoneyBefore = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
        const targetBefore = await wallet_model_1.Wallet.findById(fixture.request.targetWalletId).lean();
        await (0, walletConversionDecisionFixtures_1.approve)(fixture);
        strict_1.default.deepEqual(await wallet_model_1.Wallet.findById(fixture.request.targetWalletId).lean(), targetBefore);
        strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), noMoneyBefore);
    });
};
exports.registerApprovalTests = registerApprovalTests;
