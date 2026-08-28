"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const database_1 = require("../phase7h/helpers/database");
const bookingWalletReservationFullFlow_test_1 = require("./bookingWalletReservationFullFlow.test");
const bookingWalletReservationReplay_test_1 = require("./bookingWalletReservationReplay.test");
const bookingWalletReservationConcurrency_test_1 = require("./bookingWalletReservationConcurrency.test");
const bookingWalletReservationFailure_test_1 = require("./bookingWalletReservationFailure.test");
const bookingPaymentMethodRegression_test_1 = require("./bookingPaymentMethodRegression.test");
const bookingFundingRead_test_1 = require("./bookingFundingRead.test");
const creatorServicePrice_test_1 = require("./creatorServicePrice.test");
const creatorServicePrice_controller_test_1 = require("./creatorServicePrice.controller.test");
const bookingServiceSnapshot_test_1 = require("./bookingServiceSnapshot.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8a-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
});
(0, node_test_1.after)(async () => {
    await (0, database_1.disconnectPhase7HDatabase)();
}, { timeout: 30000 });
(0, bookingWalletReservationFullFlow_test_1.registerBookingWalletReservationFullFlowTests)();
(0, bookingWalletReservationReplay_test_1.registerBookingWalletReservationReplayTests)();
(0, bookingWalletReservationConcurrency_test_1.registerBookingWalletReservationConcurrencyTests)();
(0, bookingWalletReservationFailure_test_1.registerBookingWalletReservationFailureTests)();
(0, bookingPaymentMethodRegression_test_1.registerBookingPaymentMethodRegressionTests)();
(0, bookingFundingRead_test_1.registerBookingFundingReadTests)();
(0, creatorServicePrice_test_1.registerCreatorServicePriceTests)();
(0, creatorServicePrice_controller_test_1.registerCreatorServicePriceControllerTests)();
(0, bookingServiceSnapshot_test_1.registerBookingServiceSnapshotTests)();
