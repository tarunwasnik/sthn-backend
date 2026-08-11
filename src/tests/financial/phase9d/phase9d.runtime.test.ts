/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { featureFlagCache } from
  "../../../services/controlPlane/featureFlagCache.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerWithdrawalCompletionTests } from
  "./withdrawalCompletion.test";
import { registerWithdrawalConcurrencyTests } from
  "./withdrawalConcurrency.test";
import { registerWithdrawalFailureFinalizationTests } from
  "./withdrawalFailureFinalization.test";
import { registerWithdrawalRegressionTests } from
  "./withdrawalRegression.test";
import { registerWithdrawalIntegrityTests } from
  "./withdrawalIntegrity.test";
import { registerWithdrawalReplayTests } from
  "./withdrawalReplay.test";
import { registerWithdrawalRollbackTests } from
  "./withdrawalRollback.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase9d-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
  await CreatorWithdrawalRequest.init();
}, { timeout: 120_000 });

beforeEach(async () => {
  await clearPhase7HDatabase();
  featureFlagCache.invalidate();
});

after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

registerWithdrawalCompletionTests();
registerWithdrawalFailureFinalizationTests();
registerWithdrawalReplayTests();
registerWithdrawalConcurrencyTests();
registerWithdrawalRollbackTests();
registerWithdrawalIntegrityTests();
registerWithdrawalRegressionTests();
