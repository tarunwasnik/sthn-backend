"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const featureFlagCache_service_1 = require("../../../services/controlPlane/featureFlagCache.service");
const database_1 = require("../phase7h/helpers/database");
const bookingCreatorSettlementConcurrency_test_1 = require("./bookingCreatorSettlementConcurrency.test");
const bookingCreatorSettlementFailure_test_1 = require("./bookingCreatorSettlementFailure.test");
const bookingCreatorSettlementFullFlow_test_1 = require("./bookingCreatorSettlementFullFlow.test");
const bookingCreatorSettlementRegression_test_1 = require("./bookingCreatorSettlementRegression.test");
const bookingCreatorSettlementReplay_test_1 = require("./bookingCreatorSettlementReplay.test");
const bookingCreatorSettlementWalletRace_test_1 = require("./bookingCreatorSettlementWalletRace.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8e-test-jwt-secret";
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
(0, bookingCreatorSettlementFullFlow_test_1.registerBookingCreatorSettlementFullFlowTests)();
(0, bookingCreatorSettlementReplay_test_1.registerBookingCreatorSettlementReplayTests)();
(0, bookingCreatorSettlementConcurrency_test_1.registerBookingCreatorSettlementConcurrencyTests)();
(0, bookingCreatorSettlementWalletRace_test_1.registerBookingCreatorSettlementWalletRaceTests)();
(0, bookingCreatorSettlementFailure_test_1.registerBookingCreatorSettlementFailureTests)();
(0, bookingCreatorSettlementRegression_test_1.registerBookingCreatorSettlementRegressionTests)();
