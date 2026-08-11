/// <reference path="../../../types/express.d.ts" />

import { after, before, beforeEach } from "node:test";

import { ExchangeRateSnapshot } from
  "../../../models/exchangeRateSnapshot.model";
import { FxRateAudit } from "../../../models/fxRateAudit.model";
import { InternalWalletConversionProviderRequest } from
  "../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { clearPhase7HDatabase, connectPhase7HDatabase,
  disconnectPhase7HDatabase } from "../phase7h/helpers/database";
import { registerAccountingTests } from "./walletConversionAccounting.test";
import { registerReplayTests } from "./walletConversionReplay.test";
import { registerConcurrencyTests } from
  "./walletConversionConcurrency.test";
import { registerTargetWalletRaceTests } from
  "./walletConversionTargetWalletRace.test";
import { registerFailureTests } from "./walletConversionFailure.test";
import { registerRollbackTests } from "./walletConversionRollback.test";
import { registerIntegrityTests } from "./walletConversionIntegrity.test";
import { registerRegressionTests } from "./walletConversionRegression.test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10i-test-jwt-secret";

before(async () => {
  await connectPhase7HDatabase();
  await Promise.all([ExchangeRateSnapshot.init(), FxRateAudit.init(),
    Wallet.init(), LedgerEntry.init(), WalletProjectionOperation.init(),
    WalletConversionRequest.init(), WalletConversionAudit.init(),
    InternalWalletConversionProviderRequest.init()]);
}, { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

registerAccountingTests();
registerReplayTests();
registerConcurrencyTests();
registerTargetWalletRaceTests();
registerFailureTests();
registerRollbackTests();
registerIntegrityTests();
registerRegressionTests();
