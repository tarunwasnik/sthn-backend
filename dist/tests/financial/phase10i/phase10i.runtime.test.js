"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const fxRateAudit_model_1 = require("../../../models/fxRateAudit.model");
const internalWalletConversionProviderRequest_model_1 = require("../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const database_1 = require("../phase7h/helpers/database");
const walletConversionAccounting_test_1 = require("./walletConversionAccounting.test");
const walletConversionReplay_test_1 = require("./walletConversionReplay.test");
const walletConversionConcurrency_test_1 = require("./walletConversionConcurrency.test");
const walletConversionTargetWalletRace_test_1 = require("./walletConversionTargetWalletRace.test");
const walletConversionFailure_test_1 = require("./walletConversionFailure.test");
const walletConversionRollback_test_1 = require("./walletConversionRollback.test");
const walletConversionIntegrity_test_1 = require("./walletConversionIntegrity.test");
const walletConversionRegression_test_1 = require("./walletConversionRegression.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10i-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
    await Promise.all([exchangeRateSnapshot_model_1.ExchangeRateSnapshot.init(), fxRateAudit_model_1.FxRateAudit.init(),
        wallet_model_1.Wallet.init(), ledgerEntry_model_1.LedgerEntry.init(), walletProjectionOperation_model_1.WalletProjectionOperation.init(),
        walletConversionRequest_model_1.WalletConversionRequest.init(), walletConversionAudit_model_1.WalletConversionAudit.init(),
        internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.init()]);
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, walletConversionAccounting_test_1.registerAccountingTests)();
(0, walletConversionReplay_test_1.registerReplayTests)();
(0, walletConversionConcurrency_test_1.registerConcurrencyTests)();
(0, walletConversionTargetWalletRace_test_1.registerTargetWalletRaceTests)();
(0, walletConversionFailure_test_1.registerFailureTests)();
(0, walletConversionRollback_test_1.registerRollbackTests)();
(0, walletConversionIntegrity_test_1.registerIntegrityTests)();
(0, walletConversionRegression_test_1.registerRegressionTests)();
