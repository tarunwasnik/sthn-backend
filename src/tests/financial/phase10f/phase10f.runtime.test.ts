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
import { registerFullFlowTests } from "./walletConversionRequestFullFlow.test";
import { registerReplayTests } from "./walletConversionRequestReplay.test";
import { registerConcurrencyTests } from
  "./walletConversionRequestConcurrency.test";
import { registerFailureTests } from "./walletConversionRequestFailure.test";
import { registerIntegrityTests } from "./walletConversionRequestIntegrity.test";
import { registerRouteTests } from "./walletConversionRequestRoutes.test";
import { registerRegressionTests } from
  "./walletConversionRequestRegression.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10f-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([ExchangeRateSnapshot.init(), FxRateAudit.init(),
    WalletConversionRequest.init(), WalletConversionAudit.init()]);
}, { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

registerFullFlowTests();
registerReplayTests();
registerConcurrencyTests();
registerFailureTests();
registerIntegrityTests();
registerRouteTests();
registerRegressionTests();
