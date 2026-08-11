/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import InternalProviderEventModel from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { featureFlagCache } from
  "../../../services/controlPlane/featureFlagCache.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerWithdrawalProviderExecutionConcurrencyTests } from
  "./withdrawalProviderConcurrency.test";
import { registerWithdrawalProviderExecutionFailureTests } from
  "./withdrawalProviderFailure.test";
import { registerWithdrawalProviderExecutionTests } from
  "./withdrawalProviderExecution.test";
import { registerWithdrawalProviderExecutionRegressionTests } from
  "./withdrawalProviderRegression.test";
import { registerWithdrawalProviderExecutionReplayTests } from
  "./withdrawalProviderReplay.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase9c-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([
    CreatorWithdrawalRequest.init(),
    InternalWithdrawalProviderRequest.init(),
    InternalProviderEventModel.init(),
  ]);
}, { timeout: 120_000 });

beforeEach(async () => {
  await clearPhase7HDatabase();
  featureFlagCache.invalidate();
});

after(async () => {
  await disconnectPhase7HDatabase();
}, { timeout: 30_000 });

registerWithdrawalProviderExecutionTests();
registerWithdrawalProviderExecutionReplayTests();
registerWithdrawalProviderExecutionConcurrencyTests();
registerWithdrawalProviderExecutionFailureTests();
registerWithdrawalProviderExecutionRegressionTests();
