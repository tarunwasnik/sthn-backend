"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIntegrityTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionDecisionFixtures_1 = require("./fixtures/walletConversionDecisionFixtures");
const fxRateSnapshotFixtures_1 = require("../phase10e/fixtures/fxRateSnapshotFixtures");
const code = (expected) => (error) => error.code === expected;
const registerIntegrityTests = () => {
    (0, node_test_1.test)("phase10g fails closed for a missing conversion request", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await strict_1.default.rejects(() => fixture.decisionService.decide({
            adminUserId: fixture.actors.adminId.toString(),
            conversionReference: "WCV-20260803-FFFFFFFF",
            decision: "APPROVE",
        }), code("WALLET_CONVERSION_REQUEST_NOT_FOUND"));
    });
    (0, node_test_1.test)("phase10g rejects expired approval without refresh but permits rejection", async () => {
        const expiredNow = new Date(fxRateSnapshotFixtures_1.FIXED_NOW.getTime() + 24 * 60 * 60 * 1000 + 1);
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)({ decisionNow: expiredNow });
        const providerCalls = fixture.provider.callCount;
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(fixture), code("WALLET_CONVERSION_SNAPSHOT_EXPIRED"));
        strict_1.default.equal((await walletConversionRequest_model_1.WalletConversionRequest.findOne({}))?.status, "PENDING");
        const rejected = await (0, walletConversionDecisionFixtures_1.reject)(fixture, "FX_SNAPSHOT_NOT_ACCEPTABLE", "Bound snapshot expired");
        strict_1.default.equal(rejected.status, "REJECTED");
        strict_1.default.equal(rejected.fxSnapshotReference, fixture.request.fxSnapshotReference);
        strict_1.default.equal(fixture.provider.callCount, providerCalls);
    });
    (0, node_test_1.test)("phase10g approval balance precheck is read-only and rejection remains possible", async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await wallet_model_1.Wallet.collection.updateOne({ _id: fixture.request.sourceWalletId }, { $set: { currentBalance: 1, availableBalance: 1 } });
        const walletBefore = await wallet_model_1.Wallet.findById(fixture.request.sourceWalletId).lean();
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(fixture), code("WALLET_CONVERSION_INSUFFICIENT_AVAILABLE_BALANCE"));
        strict_1.default.equal((await walletConversionRequest_model_1.WalletConversionRequest.findOne({}))?.status, "PENDING");
        await (0, walletConversionDecisionFixtures_1.reject)(fixture, "INSUFFICIENT_SOURCE_FUNDS");
        strict_1.default.deepEqual(await wallet_model_1.Wallet.findById(fixture.request.sourceWalletId).lean(), walletBefore);
    });
    for (const [label, update] of [
        ["fingerprint", { requestFingerprint: "corrupted" }],
        ["provider", { fxProvider: "corrupted-provider" }],
        ["rate", { rateValue: "999999" }],
        ["currency pair", { targetCurrency: "EUR" }],
        ["target amount", { targetAmount: 1 }],
    ]) {
        (0, node_test_1.test)(`phase10g rejects corrupted request ${label}`, async () => {
            const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
            await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({ _id: fixture.request._id }, { $set: update });
            await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(fixture), (error) => /INTEGRITY|SNAPSHOT/.test(error.code));
            strict_1.default.equal((await walletConversionRequest_model_1.WalletConversionRequest.findById(fixture.request._id))?.status, "PENDING");
        });
    }
    (0, node_test_1.test)("phase10g rejects a missing or mismatched bound snapshot", async () => {
        const missing = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.deleteOne({
            snapshotReference: missing.request.fxSnapshotReference,
        });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(missing), code("WALLET_CONVERSION_SNAPSHOT_NOT_FOUND"));
        const mismatch = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const other = await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.findOne({
            baseCurrency: "INR", quoteCurrency: "EUR",
        });
        strict_1.default.ok(other);
        await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({ _id: mismatch.request._id }, { $set: { fxSnapshotReference: other.snapshotReference } });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(mismatch), (error) => /SNAPSHOT|INTEGRITY/.test(error.code));
    });
    (0, node_test_1.test)("phase10g rejects missing, foreign, or wrong-currency source Wallet authority", async () => {
        const missing = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await wallet_model_1.Wallet.deleteOne({ _id: missing.request.sourceWalletId });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(missing), code("WALLET_CONVERSION_SOURCE_WALLET_NOT_FOUND"));
        const foreign = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await wallet_model_1.Wallet.collection.updateOne({ _id: foreign.request.sourceWalletId }, { $set: { userId: foreign.actors.creatorId } });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(foreign), code("WALLET_CONVERSION_SOURCE_WALLET_CONFLICT"));
        const currency = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await wallet_model_1.Wallet.collection.updateOne({ _id: currency.request.sourceWalletId }, { $set: { currency: "USD" } });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(currency), code("WALLET_CONVERSION_SOURCE_WALLET_CONFLICT"));
    });
    (0, node_test_1.test)("phase10g rejects foreign or wrong-currency bound target Wallet authority", async () => {
        const foreign = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)({ createTargetWallet: true });
        await wallet_model_1.Wallet.collection.updateOne({ _id: foreign.request.targetWalletId }, { $set: { userId: foreign.actors.creatorId } });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(foreign), code("WALLET_CONVERSION_TARGET_WALLET_CONFLICT"));
        const currency = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)({ createTargetWallet: true });
        await wallet_model_1.Wallet.collection.updateOne({ _id: currency.request.targetWalletId }, { $set: { currency: "EUR" } });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(currency), code("WALLET_CONVERSION_TARGET_WALLET_CONFLICT"));
    });
    (0, node_test_1.test)("phase10g rejects partial and internally conflicting terminal metadata", async () => {
        const partialApproval = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({ _id: partialApproval.request._id }, { $set: { status: "APPROVED" } });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(partialApproval), code("WALLET_CONVERSION_INTEGRITY_ERROR"));
        const partialRejection = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({ _id: partialRejection.request._id }, { $set: { status: "REJECTED",
                decidedAt: new Date(), decidedBy: partialRejection.actors.adminId } });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.reject)(partialRejection), code("WALLET_CONVERSION_INTEGRITY_ERROR"));
        const hybrid = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await (0, walletConversionDecisionFixtures_1.approve)(hybrid);
        await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({ _id: hybrid.request._id }, { $set: { rejectionCode: "OTHER", rejectionReason: "corrupted" } });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(hybrid), code("WALLET_CONVERSION_INTEGRITY_ERROR"));
    });
    (0, node_test_1.test)("phase10g replay detects actor and timestamp authority corruption", async () => {
        const actor = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await (0, walletConversionDecisionFixtures_1.approve)(actor);
        await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({ _id: actor.request._id }, { $set: { decidedBy: new mongoose_1.Types.ObjectId() } });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(actor), code("WALLET_CONVERSION_INTEGRITY_ERROR"));
        const timestamp = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await (0, walletConversionDecisionFixtures_1.approve)(timestamp);
        await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({ _id: timestamp.request._id }, { $set: { decidedAt: new Date("2026-08-02T13:01:00.000Z") } });
        await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(timestamp), code("WALLET_CONVERSION_INTEGRITY_ERROR"));
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_APPROVED",
        }), 2);
    });
};
exports.registerIntegrityTests = registerIntegrityTests;
