/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";
import { registerConcurrencyTests } from
  "./multiCurrencyTopUpConcurrency.test";
import { registerFailureTests } from
  "./multiCurrencyTopUpFailure.test";
import { registerFullFlowTests } from
  "./multiCurrencyTopUpFullFlow.test";
import { registerIsolationTests } from
  "./multiCurrencyTopUpIsolation.test";
import { registerRegressionTests } from
  "./multiCurrencyTopUpRegression.test";
import { registerReplayTests } from
  "./multiCurrencyTopUpReplay.test";
import { registerRollbackTests } from
  "./multiCurrencyTopUpRollback.test";
import { registerWalletListingTests } from
  "./multiCurrencyWalletListing.test";
import { registerWalletIndexMaintenanceTests } from
  "./walletIndexMaintenance.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10d-test-jwt-secret";

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

registerFullFlowTests();
registerReplayTests();
registerConcurrencyTests();
registerFailureTests();
registerIsolationTests();
registerRollbackTests();
registerWalletListingTests();
registerRegressionTests();
registerWalletIndexMaintenanceTests();
