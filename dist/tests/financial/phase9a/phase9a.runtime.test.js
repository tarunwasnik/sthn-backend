"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const featureFlagCache_service_1 = require("../../../services/controlPlane/featureFlagCache.service");
const database_1 = require("../phase7h/helpers/database");
const withdrawalConcurrency_test_1 = require("./withdrawalConcurrency.test");
const withdrawalEligibility_test_1 = require("./withdrawalEligibility.test");
const withdrawalFailure_test_1 = require("./withdrawalFailure.test");
const withdrawalRegression_test_1 = require("./withdrawalRegression.test");
const withdrawalReplay_test_1 = require("./withdrawalReplay.test");
const withdrawalReservation_test_1 = require("./withdrawalReservation.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase9a-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
    featureFlagCache_service_1.featureFlagCache.invalidate();
});
(0, node_test_1.after)(async () => {
    await (0, database_1.disconnectPhase7HDatabase)();
}, { timeout: 30000 });
(0, withdrawalReservation_test_1.registerWithdrawalReservationTests)();
(0, withdrawalReplay_test_1.registerWithdrawalReplayTests)();
(0, withdrawalConcurrency_test_1.registerWithdrawalConcurrencyTests)();
(0, withdrawalFailure_test_1.registerWithdrawalFailureTests)();
(0, withdrawalEligibility_test_1.registerWithdrawalEligibilityTests)();
(0, withdrawalRegression_test_1.registerWithdrawalRegressionTests)();
