"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionProviderExecution_service_1 = require("../../../services/financial/walletConversionProviderExecution.service");
const walletConversionProviderFixtures_1 = require("./fixtures/walletConversionProviderFixtures");
const registerReplayTests = () => {
    (0, node_test_1.test)("phase10h terminal replay preserves result and never invokes simulator", async () => {
        const fixture = await (0, walletConversionProviderFixtures_1.createProviderFixture)();
        const first = await (0, walletConversionProviderFixtures_1.executeSuccess)(fixture);
        const frozen = await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)();
        const replay = await (0, walletConversionProviderFixtures_1.executeSuccess)(fixture);
        const reloaded = new walletConversionProviderExecution_service_1.WalletConversionProviderExecutionService(fixture.requestService);
        const reloadReplay = await reloaded.execute({
            adminUserId: fixture.actors.adminId.toString(),
            conversionReference: fixture.created.conversionReference,
            outcome: "SUCCESS",
        });
        strict_1.default.deepEqual(replay, first);
        strict_1.default.deepEqual(reloadReplay, first);
        strict_1.default.equal(fixture.executions, 1);
        strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
            entityType: "WALLET_CONVERSION_PROVIDER_REQUEST",
        }), 4);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({ action: { $in: [
                    "WALLET_CONVERSION_PROVIDER_STARTED",
                    "WALLET_CONVERSION_PROVIDER_SUCCEEDED",
                    "WALLET_CONVERSION_PROVIDER_FAILED",
                ] } }), 2);
        strict_1.default.deepEqual(await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)(), frozen);
    });
    (0, node_test_1.test)("phase10h conflicting terminal outcome fails closed", async () => {
        const fixture = await (0, walletConversionProviderFixtures_1.createProviderFixture)();
        await (0, walletConversionProviderFixtures_1.executeFailure)(fixture);
        await strict_1.default.rejects(() => (0, walletConversionProviderFixtures_1.executeSuccess)(fixture), (error) => error.code ===
            "WALLET_CONVERSION_PROVIDER_TERMINAL_MISMATCH");
        strict_1.default.equal(fixture.executions, 1);
    });
};
exports.registerReplayTests = registerReplayTests;
