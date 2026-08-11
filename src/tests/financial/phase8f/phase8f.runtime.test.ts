/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { featureFlagCache } from "../../../services/controlPlane/featureFlagCache.service";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerBookingCreatorSettlementOperationalAuditTests } from "./bookingCreatorSettlementOperationalAudit.test";
import { registerBookingCreatorSettlementReconciliationTests } from "./bookingCreatorSettlementReconciliation.test";
import { registerBookingCreatorSettlementOperationalRegressionTests } from "./bookingCreatorSettlementRegression.test";
import { registerBookingCreatorSettlementRepairTests } from "./bookingCreatorSettlementRepair.test";
import { registerBookingCreatorSettlementRetryTests } from "./bookingCreatorSettlementRetry.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8f-test-jwt-secret";

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

registerBookingCreatorSettlementReconciliationTests();
registerBookingCreatorSettlementRetryTests();
registerBookingCreatorSettlementRepairTests();
registerBookingCreatorSettlementOperationalAuditTests();
registerBookingCreatorSettlementOperationalRegressionTests();
