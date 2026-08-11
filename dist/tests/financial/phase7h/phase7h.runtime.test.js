"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const database_1 = require("./helpers/database");
const walletTopUpFullFlow_test_1 = require("./walletTopUpFullFlow.test");
const walletTopUpReplay_test_1 = require("./walletTopUpReplay.test");
const walletTopUpConcurrency_test_1 = require("./walletTopUpConcurrency.test");
const walletTopUpInterruptionRecovery_test_1 = require("./walletTopUpInterruptionRecovery.test");
const walletTopUpProviderFailure_test_1 = require("./walletTopUpProviderFailure.test");
const walletTopUpReconciliation_test_1 = require("./walletTopUpReconciliation.test");
const walletTopUpRepair_test_1 = require("./walletTopUpRepair.test");
const walletTopUpIntegrity_test_1 = require("./walletTopUpIntegrity.test");
const bookingPaymentRegression_test_1 = require("./bookingPaymentRegression.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase7h-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
});
(0, node_test_1.after)(async () => {
    await (0, database_1.disconnectPhase7HDatabase)();
}, { timeout: 30000 });
(0, walletTopUpFullFlow_test_1.registerFullFlowTests)();
(0, walletTopUpReplay_test_1.registerReplayTests)();
(0, walletTopUpConcurrency_test_1.registerConcurrencyTests)();
(0, walletTopUpInterruptionRecovery_test_1.registerInterruptionTests)();
(0, walletTopUpProviderFailure_test_1.registerProviderFailureTests)();
(0, walletTopUpReconciliation_test_1.registerReconciliationTests)();
(0, walletTopUpRepair_test_1.registerRepairTests)();
(0, walletTopUpIntegrity_test_1.registerIntegrityTests)();
(0, bookingPaymentRegression_test_1.registerBookingAndAuthorizationTests)();
