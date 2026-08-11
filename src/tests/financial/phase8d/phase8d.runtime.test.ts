/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { featureFlagCache } from "../../../services/controlPlane/featureFlagCache.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerBookingEscrowAllocationFullFlowTests } from "./bookingEscrowAllocationFullFlow.test";
import { registerBookingEscrowAllocationReplayTests } from "./bookingEscrowAllocationReplay.test";
import { registerBookingEscrowAllocationConcurrencyTests } from "./bookingEscrowAllocationConcurrency.test";
import { registerBookingEscrowAllocationFailureTests } from "./bookingEscrowAllocationFailure.test";
import { registerBookingEscrowAllocationRegressionTests } from "./bookingEscrowAllocationRegression.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8d-test-jwt-secret";

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

registerBookingEscrowAllocationFullFlowTests();
registerBookingEscrowAllocationReplayTests();
registerBookingEscrowAllocationConcurrencyTests();
registerBookingEscrowAllocationFailureTests();
registerBookingEscrowAllocationRegressionTests();
