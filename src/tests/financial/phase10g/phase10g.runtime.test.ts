/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { ExchangeRateSnapshot } from "../../../models/exchangeRateSnapshot.model";
import { FxRateAudit } from "../../../models/fxRateAudit.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { clearPhase7HDatabase, connectPhase7HDatabase,
  disconnectPhase7HDatabase } from "../phase7h/helpers/database";
import { registerApprovalTests } from
  "./walletConversionDecisionApproval.test";
import { registerRejectionTests } from
  "./walletConversionDecisionRejection.test";
import { registerReplayTests } from "./walletConversionDecisionReplay.test";
import { registerConcurrencyTests } from
  "./walletConversionDecisionConcurrency.test";
import { registerFailureTests } from "./walletConversionDecisionFailure.test";
import { registerIntegrityTests } from
  "./walletConversionDecisionIntegrity.test";
import { registerRouteTests } from "./walletConversionDecisionRoutes.test";
import { registerRegressionTests } from
  "./walletConversionDecisionRegression.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10g-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([ExchangeRateSnapshot.init(), FxRateAudit.init(),
    WalletConversionRequest.init(), WalletConversionAudit.init()]);
}, { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

registerApprovalTests();
registerRejectionTests();
registerReplayTests();
registerConcurrencyTests();
registerFailureTests();
registerIntegrityTests();
registerRouteTests();
registerRegressionTests();
