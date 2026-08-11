"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerExecutionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWalletConversionProviderRequest_model_1 = require("../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionProviderFixtures_1 = require("./fixtures/walletConversionProviderFixtures");
const registerExecutionTests = () => {
    (0, node_test_1.test)("phase10h successful execution reaches SUCCEEDED without accounting", async () => {
        const fixture = await (0, walletConversionProviderFixtures_1.createProviderFixture)();
        const frozen = await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)();
        const result = await (0, walletConversionProviderFixtures_1.executeSuccess)(fixture);
        strict_1.default.deepEqual(Object.keys(result).sort(), ["completedAt",
            "conversionReference", "processingAt", "providerOutcome",
            "providerReference", "providerStatus"].sort());
        strict_1.default.equal(result.providerStatus, "SUCCEEDED");
        strict_1.default.equal(result.providerOutcome, "SUCCESS");
        strict_1.default.match(result.providerReference, /^IWCPR-/);
        const authority = await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.findOne({
            conversionReference: fixture.created.conversionReference,
        }).select("+providerRequestKey +userId +sourceWalletId +targetWalletId " +
            "+providerFingerprint +executionFingerprint +providerMetadata " +
            "+execution +payloads +failureReason").orFail();
        strict_1.default.equal(authority.version, 2);
        strict_1.default.equal(authority.isTerminal, true);
        strict_1.default.match(authority.providerExecutionReference, /^IWCXE-/);
        strict_1.default.equal(authority.failureCode, undefined);
        const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: fixture.created.conversionReference,
        }).select("+providerMetadata").orFail();
        strict_1.default.equal(request.status, "APPROVED");
        strict_1.default.equal(request.providerStatus, "SUCCEEDED");
        strict_1.default.equal(request.providerOutcome, "SUCCESS");
        strict_1.default.equal(request.providerRequestReference, authority.providerRequestReference);
        strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
            entityType: "WALLET_CONVERSION_PROVIDER_REQUEST",
        }), 4);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({ action: { $in: [
                    "WALLET_CONVERSION_PROVIDER_STARTED",
                    "WALLET_CONVERSION_PROVIDER_SUCCEEDED",
                ] } }), 2);
        strict_1.default.equal(fixture.executions, 1);
        strict_1.default.deepEqual(await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)(), frozen);
    });
    (0, node_test_1.test)("phase10h failed execution records deterministic failure without accounting", async () => {
        const fixture = await (0, walletConversionProviderFixtures_1.createProviderFixture)({ createTargetWallet: true });
        const frozen = await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)();
        const result = await (0, walletConversionProviderFixtures_1.executeFailure)(fixture);
        strict_1.default.equal(result.providerStatus, "FAILED");
        strict_1.default.equal(result.providerOutcome, "FAILURE");
        const authority = await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.findOne({
            conversionReference: fixture.created.conversionReference,
        }).select("+failureReason").orFail();
        strict_1.default.equal(authority.failureCode, "SIMULATED_CONVERSION_FAILURE");
        strict_1.default.equal(authority.failureReason, "Deterministic conversion provider failure");
        const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: fixture.created.conversionReference,
        }).orFail();
        strict_1.default.equal(request.status, "APPROVED");
        strict_1.default.equal(request.providerStatus, "FAILED");
        strict_1.default.equal(request.providerFailureCode, "SIMULATED_CONVERSION_FAILURE");
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_PROVIDER_FAILED",
            failureCode: "SIMULATED_CONVERSION_FAILURE",
        }), 1);
        strict_1.default.deepEqual(await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)(), frozen);
    });
};
exports.registerExecutionTests = registerExecutionTests;
