"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWalletConversionProviderRequest_model_1 = require("../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionProviderFixtures_1 = require("./fixtures/walletConversionProviderFixtures");
const registerConcurrencyTests = () => {
    (0, node_test_1.test)("phase10h concurrency: ten attempts converge on one execution authority", async () => {
        const fixture = await (0, walletConversionProviderFixtures_1.createProviderFixture)();
        const frozen = await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)();
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => (0, walletConversionProviderFixtures_1.executeSuccess)(fixture)));
        strict_1.default.ok(settled.every((item) => item.status === "fulfilled"), settled.map((item) => item.status === "fulfilled" ? "fulfilled" :
            String(item.reason)).join(" | "));
        strict_1.default.equal(fixture.executions, 1);
        strict_1.default.equal(await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.countDocuments({
            providerStatus: "SUCCEEDED",
        }), 1);
        strict_1.default.equal(await internalProviderEvent_model_1.default.countDocuments({
            entityType: "WALLET_CONVERSION_PROVIDER_REQUEST",
        }), 4);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({ action: { $in: [
                    "WALLET_CONVERSION_PROVIDER_STARTED",
                    "WALLET_CONVERSION_PROVIDER_SUCCEEDED",
                ] } }), 2);
        strict_1.default.deepEqual(await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)(), frozen);
    });
};
exports.registerConcurrencyTests = registerConcurrencyTests;
