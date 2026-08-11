/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { CreatorWithdrawalReconciliation } from
  "../../../models/creatorWithdrawalReconciliation.model";
import { CreatorWithdrawalRepairOperation } from
  "../../../models/creatorWithdrawalRepairOperation.model";
import { CreatorWithdrawalRetryAttempt } from
  "../../../models/creatorWithdrawalRetryAttempt.model";
import { featureFlagCache } from
  "../../../services/controlPlane/featureFlagCache.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerMarketplaceSuccessfulFlowTests } from
  "./marketplaceSuccessfulFlow.test";
import { registerMarketplaceReplayTests } from "./marketplaceReplay.test";
import { registerMarketplaceConcurrencyTests } from
  "./marketplaceConcurrency.test";
import { registerMarketplaceFinancialIntegrityTests } from
  "./marketplaceFinancialIntegrity.test";
import { registerMarketplaceRegressionTests } from
  "./marketplaceRegression.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10a-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([
    CreatorWithdrawalReconciliation.init(),
    CreatorWithdrawalRetryAttempt.init(),
    CreatorWithdrawalRepairOperation.init(),
  ]);
}, { timeout: 120_000 });
beforeEach(async () => {
  await clearPhase7HDatabase();
  featureFlagCache.invalidate();
});
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

registerMarketplaceSuccessfulFlowTests();
registerMarketplaceReplayTests();
registerMarketplaceConcurrencyTests();
registerMarketplaceFinancialIntegrityTests();
registerMarketplaceRegressionTests();
