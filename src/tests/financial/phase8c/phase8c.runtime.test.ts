/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { featureFlagCache } from "../../../services/controlPlane/featureFlagCache.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerBookingWalletCaptureFullFlowTests } from "./bookingWalletCaptureFullFlow.test";
import { registerBookingWalletCaptureReplayTests } from "./bookingWalletCaptureReplay.test";
import { registerBookingWalletCaptureConcurrencyTests } from "./bookingWalletCaptureConcurrency.test";
import { registerBookingWalletCaptureLifecycleRaceTests } from "./bookingWalletCaptureLifecycleRace.test";
import { registerBookingWalletCaptureFailureTests } from "./bookingWalletCaptureFailure.test";
import { registerBookingWalletCaptureRegressionTests } from "./bookingWalletCaptureRegression.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8c-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
}, { timeout: 120_000 });

beforeEach(async () => {
  await clearPhase7HDatabase();
  featureFlagCache.invalidate();
});

after(async () => {
  await disconnectPhase7HDatabase();
}, { timeout: 30_000 });

registerBookingWalletCaptureFullFlowTests();
registerBookingWalletCaptureReplayTests();
registerBookingWalletCaptureConcurrencyTests();
registerBookingWalletCaptureLifecycleRaceTests();
registerBookingWalletCaptureFailureTests();
registerBookingWalletCaptureRegressionTests();
