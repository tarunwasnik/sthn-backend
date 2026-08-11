"use strict";
/// <reference path="../../../types/express.d.ts" />
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const fxRateAudit_model_1 = require("../../../models/fxRateAudit.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWalletConversionProviderRequest_model_1 = require("../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const database_1 = require("../phase7h/helpers/database");
const walletConversionProviderExecution_test_1 = require("./walletConversionProviderExecution.test");
const walletConversionProviderReplay_test_1 = require("./walletConversionProviderReplay.test");
const walletConversionProviderConcurrency_test_1 = require("./walletConversionProviderConcurrency.test");
const walletConversionProviderFailure_test_1 = require("./walletConversionProviderFailure.test");
const walletConversionProviderRegression_test_1 = require("./walletConversionProviderRegression.test");
const walletConversionProviderIntegrity_test_1 = require("./walletConversionProviderIntegrity.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10h-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
    await Promise.all([exchangeRateSnapshot_model_1.ExchangeRateSnapshot.init(), fxRateAudit_model_1.FxRateAudit.init(),
        walletConversionRequest_model_1.WalletConversionRequest.init(), walletConversionAudit_model_1.WalletConversionAudit.init(),
        internalProviderEvent_model_1.default.init(),
        internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.init()]);
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, walletConversionProviderExecution_test_1.registerExecutionTests)();
(0, walletConversionProviderReplay_test_1.registerReplayTests)();
(0, walletConversionProviderConcurrency_test_1.registerConcurrencyTests)();
(0, walletConversionProviderFailure_test_1.registerFailureTests)();
(0, walletConversionProviderRegression_test_1.registerRegressionTests)();
(0, walletConversionProviderIntegrity_test_1.registerIntegrityTests)();
