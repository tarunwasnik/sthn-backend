"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const featureFlagCache_service_1 = require("../../../services/controlPlane/featureFlagCache.service");
const database_1 = require("../phase7h/helpers/database");
const withdrawalCompletion_test_1 = require("./withdrawalCompletion.test");
const withdrawalConcurrency_test_1 = require("./withdrawalConcurrency.test");
const withdrawalFailureFinalization_test_1 = require("./withdrawalFailureFinalization.test");
const withdrawalRegression_test_1 = require("./withdrawalRegression.test");
const withdrawalIntegrity_test_1 = require("./withdrawalIntegrity.test");
const withdrawalReplay_test_1 = require("./withdrawalReplay.test");
const withdrawalRollback_test_1 = require("./withdrawalRollback.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase9d-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
    await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.init();
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
    featureFlagCache_service_1.featureFlagCache.invalidate();
});
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, withdrawalCompletion_test_1.registerWithdrawalCompletionTests)();
(0, withdrawalFailureFinalization_test_1.registerWithdrawalFailureFinalizationTests)();
(0, withdrawalReplay_test_1.registerWithdrawalReplayTests)();
(0, withdrawalConcurrency_test_1.registerWithdrawalConcurrencyTests)();
(0, withdrawalRollback_test_1.registerWithdrawalRollbackTests)();
(0, withdrawalIntegrity_test_1.registerWithdrawalIntegrityTests)();
(0, withdrawalRegression_test_1.registerWithdrawalRegressionTests)();
