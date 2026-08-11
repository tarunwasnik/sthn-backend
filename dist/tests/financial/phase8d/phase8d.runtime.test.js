"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const featureFlagCache_service_1 = require("../../../services/controlPlane/featureFlagCache.service");
const database_1 = require("../phase7h/helpers/database");
const bookingEscrowAllocationFullFlow_test_1 = require("./bookingEscrowAllocationFullFlow.test");
const bookingEscrowAllocationReplay_test_1 = require("./bookingEscrowAllocationReplay.test");
const bookingEscrowAllocationConcurrency_test_1 = require("./bookingEscrowAllocationConcurrency.test");
const bookingEscrowAllocationFailure_test_1 = require("./bookingEscrowAllocationFailure.test");
const bookingEscrowAllocationRegression_test_1 = require("./bookingEscrowAllocationRegression.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8d-test-jwt-secret";
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
(0, bookingEscrowAllocationFullFlow_test_1.registerBookingEscrowAllocationFullFlowTests)();
(0, bookingEscrowAllocationReplay_test_1.registerBookingEscrowAllocationReplayTests)();
(0, bookingEscrowAllocationConcurrency_test_1.registerBookingEscrowAllocationConcurrencyTests)();
(0, bookingEscrowAllocationFailure_test_1.registerBookingEscrowAllocationFailureTests)();
(0, bookingEscrowAllocationRegression_test_1.registerBookingEscrowAllocationRegressionTests)();
