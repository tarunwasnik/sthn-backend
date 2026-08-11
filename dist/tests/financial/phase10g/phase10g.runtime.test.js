"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const fxRateAudit_model_1 = require("../../../models/fxRateAudit.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const database_1 = require("../phase7h/helpers/database");
const walletConversionDecisionApproval_test_1 = require("./walletConversionDecisionApproval.test");
const walletConversionDecisionRejection_test_1 = require("./walletConversionDecisionRejection.test");
const walletConversionDecisionReplay_test_1 = require("./walletConversionDecisionReplay.test");
const walletConversionDecisionConcurrency_test_1 = require("./walletConversionDecisionConcurrency.test");
const walletConversionDecisionFailure_test_1 = require("./walletConversionDecisionFailure.test");
const walletConversionDecisionIntegrity_test_1 = require("./walletConversionDecisionIntegrity.test");
const walletConversionDecisionRoutes_test_1 = require("./walletConversionDecisionRoutes.test");
const walletConversionDecisionRegression_test_1 = require("./walletConversionDecisionRegression.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10g-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
    await Promise.all([exchangeRateSnapshot_model_1.ExchangeRateSnapshot.init(), fxRateAudit_model_1.FxRateAudit.init(),
        walletConversionRequest_model_1.WalletConversionRequest.init(), walletConversionAudit_model_1.WalletConversionAudit.init()]);
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, walletConversionDecisionApproval_test_1.registerApprovalTests)();
(0, walletConversionDecisionRejection_test_1.registerRejectionTests)();
(0, walletConversionDecisionReplay_test_1.registerReplayTests)();
(0, walletConversionDecisionConcurrency_test_1.registerConcurrencyTests)();
(0, walletConversionDecisionFailure_test_1.registerFailureTests)();
(0, walletConversionDecisionIntegrity_test_1.registerIntegrityTests)();
(0, walletConversionDecisionRoutes_test_1.registerRouteTests)();
(0, walletConversionDecisionRegression_test_1.registerRegressionTests)();
