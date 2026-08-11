/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { featureFlagCache } from "../../../services/controlPlane/featureFlagCache.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerWithdrawalConcurrencyTests } from "./withdrawalConcurrency.test";
import { registerWithdrawalEligibilityTests } from "./withdrawalEligibility.test";
import { registerWithdrawalFailureTests } from "./withdrawalFailure.test";
import { registerWithdrawalRegressionTests } from "./withdrawalRegression.test";
import { registerWithdrawalReplayTests } from "./withdrawalReplay.test";
import { registerWithdrawalReservationTests } from "./withdrawalReservation.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase9a-test-jwt-secret";

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

registerWithdrawalReservationTests();
registerWithdrawalReplayTests();
registerWithdrawalConcurrencyTests();
registerWithdrawalFailureTests();
registerWithdrawalEligibilityTests();
registerWithdrawalRegressionTests();
