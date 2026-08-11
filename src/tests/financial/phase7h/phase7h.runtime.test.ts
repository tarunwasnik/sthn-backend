/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "./helpers/database";
import { registerFullFlowTests } from "./walletTopUpFullFlow.test";
import { registerReplayTests } from "./walletTopUpReplay.test";
import { registerConcurrencyTests } from "./walletTopUpConcurrency.test";
import { registerInterruptionTests } from "./walletTopUpInterruptionRecovery.test";
import { registerProviderFailureTests } from "./walletTopUpProviderFailure.test";
import { registerReconciliationTests } from "./walletTopUpReconciliation.test";
import { registerRepairTests } from "./walletTopUpRepair.test";
import { registerIntegrityTests } from "./walletTopUpIntegrity.test";
import { registerBookingAndAuthorizationTests } from "./bookingPaymentRegression.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase7h-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
}, { timeout: 120_000 });

beforeEach(async () => {
  await clearPhase7HDatabase();
});

after(async () => {
  await disconnectPhase7HDatabase();
}, { timeout: 30_000 });

registerFullFlowTests();
registerReplayTests();
registerConcurrencyTests();
registerInterruptionTests();
registerProviderFailureTests();
registerReconciliationTests();
registerRepairTests();
registerIntegrityTests();
registerBookingAndAuthorizationTests();
