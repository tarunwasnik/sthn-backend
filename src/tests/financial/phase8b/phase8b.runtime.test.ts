/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerBookingWalletReleaseRejectionTests } from "./bookingWalletReleaseRejection.test";
import { registerBookingWalletReleaseExpiryTests } from "./bookingWalletReleaseExpiry.test";
import { registerBookingWalletReleaseCancellationTests } from "./bookingWalletReleaseCancellation.test";
import { registerBookingWalletReleaseReplayTests } from "./bookingWalletReleaseReplay.test";
import { registerBookingWalletReleaseConcurrencyTests } from "./bookingWalletReleaseConcurrency.test";
import { registerBookingWalletReleaseFailureTests } from "./bookingWalletReleaseFailure.test";
import { registerBookingWalletReleaseRegressionTests } from "./bookingWalletReleaseRegression.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8b-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
}, { timeout: 120_000 });

beforeEach(async () => {
  await clearPhase7HDatabase();
});

after(async () => {
  await disconnectPhase7HDatabase();
}, { timeout: 30_000 });

registerBookingWalletReleaseRejectionTests();
registerBookingWalletReleaseExpiryTests();
registerBookingWalletReleaseCancellationTests();
registerBookingWalletReleaseReplayTests();
registerBookingWalletReleaseConcurrencyTests();
registerBookingWalletReleaseFailureTests();
registerBookingWalletReleaseRegressionTests();
