/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { featureFlagCache } from
  "../../../services/controlPlane/featureFlagCache.service";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import InternalProviderEventModel from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerWithdrawalProviderConcurrencyTests } from
  "./withdrawalProviderConcurrency.test";
import { registerWithdrawalProviderFailureTests } from
  "./withdrawalProviderFailure.test";
import { registerWithdrawalProviderInitializationTests } from
  "./withdrawalProviderInitialization.test";
import { registerWithdrawalProviderRegressionTests } from
  "./withdrawalProviderRegression.test";
import { registerWithdrawalProviderReplayTests } from
  "./withdrawalProviderReplay.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase9b-test-jwt-secret";

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

registerWithdrawalProviderInitializationTests();
registerWithdrawalProviderReplayTests();
registerWithdrawalProviderConcurrencyTests();
registerWithdrawalProviderFailureTests();
registerWithdrawalProviderRegressionTests();
