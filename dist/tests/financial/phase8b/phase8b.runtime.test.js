"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const database_1 = require("../phase7h/helpers/database");
const bookingWalletReleaseRejection_test_1 = require("./bookingWalletReleaseRejection.test");
const bookingWalletReleaseExpiry_test_1 = require("./bookingWalletReleaseExpiry.test");
const bookingWalletReleaseCancellation_test_1 = require("./bookingWalletReleaseCancellation.test");
const bookingWalletReleaseReplay_test_1 = require("./bookingWalletReleaseReplay.test");
const bookingWalletReleaseConcurrency_test_1 = require("./bookingWalletReleaseConcurrency.test");
const bookingWalletReleaseFailure_test_1 = require("./bookingWalletReleaseFailure.test");
const bookingWalletReleaseRegression_test_1 = require("./bookingWalletReleaseRegression.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8b-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
});
(0, node_test_1.after)(async () => {
    await (0, database_1.disconnectPhase7HDatabase)();
}, { timeout: 30000 });
(0, bookingWalletReleaseRejection_test_1.registerBookingWalletReleaseRejectionTests)();
(0, bookingWalletReleaseExpiry_test_1.registerBookingWalletReleaseExpiryTests)();
(0, bookingWalletReleaseCancellation_test_1.registerBookingWalletReleaseCancellationTests)();
(0, bookingWalletReleaseReplay_test_1.registerBookingWalletReleaseReplayTests)();
(0, bookingWalletReleaseConcurrency_test_1.registerBookingWalletReleaseConcurrencyTests)();
(0, bookingWalletReleaseFailure_test_1.registerBookingWalletReleaseFailureTests)();
(0, bookingWalletReleaseRegression_test_1.registerBookingWalletReleaseRegressionTests)();
