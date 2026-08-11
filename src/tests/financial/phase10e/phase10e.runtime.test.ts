/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { FxRateAudit } from "../../../models/fxRateAudit.model";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerConcurrencyTests } from
  "./fxRateSnapshotConcurrency.test";
import { registerFailureTests } from "./fxRateSnapshotFailure.test";
import { registerFullFlowTests } from "./fxRateSnapshotFullFlow.test";
import { registerIntegrityTests } from "./fxRateSnapshotIntegrity.test";
import { registerRefreshTests } from "./fxRateSnapshotRefresh.test";
import { registerRegressionTests } from "./fxRateSnapshotRegression.test";
import { registerReplayTests } from "./fxRateSnapshotReplay.test";
import { registerRouteTests } from "./fxRateSnapshotRoutes.test";
import { registerProviderSelectionTests } from
  "./fxRateProviderSelection.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10e-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([ExchangeRateSnapshot.init(), FxRateAudit.init()]);
}, { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

registerFullFlowTests();
registerReplayTests();
registerConcurrencyTests();
registerRefreshTests();
registerFailureTests();
registerIntegrityTests();
registerRouteTests();
registerRegressionTests();
registerProviderSelectionTests();
