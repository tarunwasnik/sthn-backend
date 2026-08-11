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
import { clearPhase7HDatabase, connectPhase7HDatabase,
  disconnectPhase7HDatabase } from "../phase7h/helpers/database";
import { registerWithdrawalOperationalInspectionTests } from
  "./withdrawalOperationalInspection.test";
import { registerWithdrawalReconciliationTests } from
  "./withdrawalReconciliation.test";
import { registerWithdrawalRetryTests } from "./withdrawalRetry.test";
import { registerWithdrawalRepairTests } from "./withdrawalRepair.test";
import { registerWithdrawalOperationalAuditTests } from
  "./withdrawalOperationalAudit.test";
import { registerWithdrawalOperationalConcurrencyTests } from
  "./withdrawalOperationalConcurrency.test";
import { registerWithdrawalOperationalFailureTests } from
  "./withdrawalOperationalFailure.test";
import { registerWithdrawalOperationalRegressionTests } from
  "./withdrawalOperationalRegression.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase9e-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([CreatorWithdrawalReconciliation.init(),
    CreatorWithdrawalRetryAttempt.init(),
    CreatorWithdrawalRepairOperation.init()]);
}, { timeout: 120_000 });
beforeEach(async () => {
  await clearPhase7HDatabase();
  featureFlagCache.invalidate();
});
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

registerWithdrawalOperationalInspectionTests();
registerWithdrawalReconciliationTests();
registerWithdrawalRetryTests();
registerWithdrawalRepairTests();
registerWithdrawalOperationalAuditTests();
registerWithdrawalOperationalConcurrencyTests();
registerWithdrawalOperationalFailureTests();
registerWithdrawalOperationalRegressionTests();
