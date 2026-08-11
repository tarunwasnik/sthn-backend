"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const featureFlagCache_service_1 = require("../../../services/controlPlane/featureFlagCache.service");
const database_1 = require("../phase7h/helpers/database");
const bookingWalletCaptureFullFlow_test_1 = require("./bookingWalletCaptureFullFlow.test");
const bookingWalletCaptureReplay_test_1 = require("./bookingWalletCaptureReplay.test");
const bookingWalletCaptureConcurrency_test_1 = require("./bookingWalletCaptureConcurrency.test");
const bookingWalletCaptureLifecycleRace_test_1 = require("./bookingWalletCaptureLifecycleRace.test");
const bookingWalletCaptureFailure_test_1 = require("./bookingWalletCaptureFailure.test");
const bookingWalletCaptureRegression_test_1 = require("./bookingWalletCaptureRegression.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8c-test-jwt-secret";
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
(0, bookingWalletCaptureFullFlow_test_1.registerBookingWalletCaptureFullFlowTests)();
(0, bookingWalletCaptureReplay_test_1.registerBookingWalletCaptureReplayTests)();
(0, bookingWalletCaptureConcurrency_test_1.registerBookingWalletCaptureConcurrencyTests)();
(0, bookingWalletCaptureLifecycleRace_test_1.registerBookingWalletCaptureLifecycleRaceTests)();
(0, bookingWalletCaptureFailure_test_1.registerBookingWalletCaptureFailureTests)();
(0, bookingWalletCaptureRegression_test_1.registerBookingWalletCaptureRegressionTests)();
