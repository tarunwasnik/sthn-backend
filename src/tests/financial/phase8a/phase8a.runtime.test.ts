/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerBookingWalletReservationFullFlowTests } from "./bookingWalletReservationFullFlow.test";
import { registerBookingWalletReservationReplayTests } from "./bookingWalletReservationReplay.test";
import { registerBookingWalletReservationConcurrencyTests } from "./bookingWalletReservationConcurrency.test";
import { registerBookingWalletReservationFailureTests } from "./bookingWalletReservationFailure.test";
import { registerBookingPaymentMethodRegressionTests } from "./bookingPaymentMethodRegression.test";
import { registerBookingFundingReadTests } from "./bookingFundingRead.test";
import { registerCreatorServicePriceTests } from "./creatorServicePrice.test";
import { registerCreatorServicePriceControllerTests } from "./creatorServicePrice.controller.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8a-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
}, { timeout: 120_000 });

beforeEach(async () => {
  await clearPhase7HDatabase();
});

after(async () => {
  await disconnectPhase7HDatabase();
}, { timeout: 30_000 });

registerBookingWalletReservationFullFlowTests();
registerBookingWalletReservationReplayTests();
registerBookingWalletReservationConcurrencyTests();
registerBookingWalletReservationFailureTests();
registerBookingPaymentMethodRegressionTests();
registerBookingFundingReadTests();
registerCreatorServicePriceTests();
registerCreatorServicePriceControllerTests();
