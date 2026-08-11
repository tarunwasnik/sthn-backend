/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { ExchangeRateSnapshot } from "../../../models/exchangeRateSnapshot.model";
import { FxRateAudit } from "../../../models/fxRateAudit.model";
import InternalProviderEvent from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWalletConversionProviderRequest } from
  "../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { clearPhase7HDatabase, connectPhase7HDatabase,
  disconnectPhase7HDatabase } from "../phase7h/helpers/database";
import { registerExecutionTests } from
  "./walletConversionProviderExecution.test";
import { registerReplayTests } from "./walletConversionProviderReplay.test";
import { registerConcurrencyTests } from
  "./walletConversionProviderConcurrency.test";
import { registerFailureTests } from
  "./walletConversionProviderFailure.test";
import { registerRegressionTests } from
  "./walletConversionProviderRegression.test";
import { registerIntegrityTests } from
  "./walletConversionProviderIntegrity.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10h-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([ExchangeRateSnapshot.init(), FxRateAudit.init(),
    WalletConversionRequest.init(), WalletConversionAudit.init(),
    InternalProviderEvent.init(),
    InternalWalletConversionProviderRequest.init()]);
}, { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

registerExecutionTests();
registerReplayTests();
registerConcurrencyTests();
registerFailureTests();
registerRegressionTests();
registerIntegrityTests();
