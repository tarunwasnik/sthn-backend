"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWalletConversionProviderRequest_model_1 = require("../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionProviderFixtures_1 = require("./fixtures/walletConversionProviderFixtures");
const registerFailureTests = () => {
    for (const stage of ["AFTER_AUTHORITY", "AFTER_PROCESSING",
        "AFTER_EVENT_CREATION", "AFTER_TERMINAL_STATE",
        "BEFORE_REQUEST_SYNCHRONIZATION", "BEFORE_AUDIT",
        "BEFORE_COMMIT"]) {
        (0, node_test_1.test)(`phase10h rollback: ${stage} preserves INITIALIZED authority`, async () => {
            const fixture = await (0, walletConversionProviderFixtures_1.createProviderFixture)({
                failureInjector: (actual) => {
                    if (actual === stage)
                        throw new Error(`Injected ${stage}`);
                },
            });
            const frozen = await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)();
            await strict_1.default.rejects(() => (0, walletConversionProviderFixtures_1.executeSuccess)(fixture));
            const authority = await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.findOne({
                conversionReference: fixture.created.conversionReference,
            }).orFail();
            strict_1.default.equal(authority.providerStatus, "INITIALIZED");
            strict_1.default.equal(authority.version, 0);
            strict_1.default.equal(authority.isTerminal, false);
            strict_1.default.equal(authority.processingAt, undefined);
            strict_1.default.equal(authority.completedAt, undefined);
            strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
                entityType: "WALLET_CONVERSION_PROVIDER_REQUEST",
            }), 2);
            strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({ action: { $in: [
                        "WALLET_CONVERSION_PROVIDER_STARTED",
                        "WALLET_CONVERSION_PROVIDER_SUCCEEDED",
                        "WALLET_CONVERSION_PROVIDER_FAILED",
                    ] } }), 0);
            const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
                conversionReference: fixture.created.conversionReference,
            }).orFail();
            strict_1.default.equal(request.status, "APPROVED");
            strict_1.default.equal(request.providerRequestReference, undefined);
            strict_1.default.equal(request.providerStatus, undefined);
            strict_1.default.deepEqual(await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)(), frozen);
        });
    }
};
exports.registerFailureTests = registerFailureTests;
