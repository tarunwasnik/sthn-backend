"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotPhase9CFinancialState = exports.createInitializedWithdrawalProviderFixture = exports.startCreatorWithdrawalHttpServer = void 0;
const ledgerEntry_model_1 = require("../../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../../models/walletProjectionOperation.model");
const withdrawalProviderInitialization_service_1 = require("../../../../services/financial/withdrawalProviderInitialization.service");
const withdrawalProviderInitializationFixtures_1 = require("../../phase9b/fixtures/withdrawalProviderInitializationFixtures");
Object.defineProperty(exports, "startCreatorWithdrawalHttpServer", { enumerable: true, get: function () { return withdrawalProviderInitializationFixtures_1.startCreatorWithdrawalHttpServer; } });
const createInitializedWithdrawalProviderFixture = async (baseUrl) => {
    const fixture = await (0, withdrawalProviderInitializationFixtures_1.createReservedWithdrawalProviderFixture)(baseUrl);
    const provider = await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.initialize(fixture.withdrawal.withdrawalReference);
    return { ...fixture, provider };
};
exports.createInitializedWithdrawalProviderFixture = createInitializedWithdrawalProviderFixture;
const snapshotPhase9CFinancialState = async (walletId) => {
    const wallet = await wallet_model_1.Wallet.findById(walletId).orFail();
    return {
        wallet: {
            currentBalance: wallet.currentBalance,
            availableBalance: wallet.availableBalance,
            reservedBalance: wallet.reservedBalance,
            lockedBalance: wallet.lockedBalance,
            projectionVersion: wallet.projectionVersion,
        },
        ledgerCount: await ledgerEntry_model_1.LedgerEntry.countDocuments(),
        projectionCount: await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(),
    };
};
exports.snapshotPhase9CFinancialState = snapshotPhase9CFinancialState;
