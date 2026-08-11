"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFullFlowTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionRequestFixtures_1 = require("./fixtures/walletConversionRequestFixtures");
const registerFullFlowTests = () => {
    (0, node_test_1.test)("phase10f full flow records PENDING intent bound to INR-to-USD snapshot", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const walletBefore = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).lean();
        const providerCalls = fixture.provider.callCount;
        const result = await fixture.service.create(fixture.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)());
        strict_1.default.deepEqual({ status: result.status, sourceAmount: result.sourceAmount,
            targetAmount: result.targetAmount, rate: result.rate }, {
            status: "PENDING", sourceAmount: 870000, targetAmount: 10005,
            rate: "0.0115",
        });
        const stored = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: result.conversionReference,
        }).select("+sourceWalletId +targetWalletId +fxSnapshotId");
        strict_1.default.ok(stored?.sourceWalletId.equals(fixture.actors.wallet._id));
        strict_1.default.equal(stored?.targetWalletId, undefined);
        strict_1.default.equal(await wallet_model_1.Wallet.exists({ userId: fixture.actors.userId,
            currency: "USD" }), null);
        strict_1.default.deepEqual(await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).lean(), walletBefore);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({}), 1);
        strict_1.default.equal(fixture.provider.callCount, providerCalls, "Conversion request must not call the provider.");
    });
    (0, node_test_1.test)("phase10f binds an existing target Wallet without changing its balance", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const target = await (0, walletConversionRequestFixtures_1.fundWallet)(fixture.actors.userId, "USD", 12345);
        const targetBefore = target.toObject();
        const result = await fixture.service.create(fixture.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)("phase10f-existing-target"));
        const stored = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: result.conversionReference,
        }).select("+targetWalletId");
        strict_1.default.ok(stored?.targetWalletId?.equals(target._id));
        strict_1.default.deepEqual((await wallet_model_1.Wallet.findById(target._id))?.toObject(), targetBefore);
    });
    (0, node_test_1.test)("phase10f quote uses target minor units with deterministic half-up rounding", async () => {
        const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)();
        const result = await fixture.service.create(fixture.actors.userId.toString(), {
            sourceCurrency: "INR", targetCurrency: "JPY", sourceAmount: 12345,
            idempotencyKey: "phase10f-inr-jpy-rounding",
        });
        strict_1.default.equal(result.targetAmount, 212);
        strict_1.default.equal(result.rate, "1.72");
    });
};
exports.registerFullFlowTests = registerFullFlowTests;
