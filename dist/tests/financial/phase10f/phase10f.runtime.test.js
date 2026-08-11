"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const fxRateAudit_model_1 = require("../../../models/fxRateAudit.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const database_1 = require("../phase7h/helpers/database");
const walletConversionRequestFullFlow_test_1 = require("./walletConversionRequestFullFlow.test");
const walletConversionRequestReplay_test_1 = require("./walletConversionRequestReplay.test");
const walletConversionRequestConcurrency_test_1 = require("./walletConversionRequestConcurrency.test");
const walletConversionRequestFailure_test_1 = require("./walletConversionRequestFailure.test");
const walletConversionRequestIntegrity_test_1 = require("./walletConversionRequestIntegrity.test");
const walletConversionRequestRoutes_test_1 = require("./walletConversionRequestRoutes.test");
const walletConversionRequestRegression_test_1 = require("./walletConversionRequestRegression.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10f-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
    await Promise.all([exchangeRateSnapshot_model_1.ExchangeRateSnapshot.init(), fxRateAudit_model_1.FxRateAudit.init(),
        walletConversionRequest_model_1.WalletConversionRequest.init(), walletConversionAudit_model_1.WalletConversionAudit.init()]);
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, walletConversionRequestFullFlow_test_1.registerFullFlowTests)();
(0, walletConversionRequestReplay_test_1.registerReplayTests)();
(0, walletConversionRequestConcurrency_test_1.registerConcurrencyTests)();
(0, walletConversionRequestFailure_test_1.registerFailureTests)();
(0, walletConversionRequestIntegrity_test_1.registerIntegrityTests)();
(0, walletConversionRequestRoutes_test_1.registerRouteTests)();
(0, walletConversionRequestRegression_test_1.registerRegressionTests)();
