"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotFinancialState = exports.createReservedWithdrawalProviderFixture = exports.startCreatorWithdrawalHttpServer = void 0;
const ledgerEntry_model_1 = require("../../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const creatorWithdrawalRequest_service_1 = require("../../../../services/financial/creatorWithdrawalRequest.service");
const creatorWithdrawalRequestFixtures_1 = require("../../phase9a/fixtures/creatorWithdrawalRequestFixtures");
Object.defineProperty(exports, "startCreatorWithdrawalHttpServer", { enumerable: true, get: function () { return creatorWithdrawalRequestFixtures_1.startCreatorWithdrawalHttpServer; } });
const createReservedWithdrawalProviderFixture = async (baseUrl) => {
    const fixture = await (0, creatorWithdrawalRequestFixtures_1.createEligibleCreatorWithdrawalFixture)(baseUrl);
    const withdrawal = await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(fixture.input);
    return { ...fixture, withdrawal };
};
exports.createReservedWithdrawalProviderFixture = createReservedWithdrawalProviderFixture;
const snapshotFinancialState = async (walletId) => {
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
    };
};
exports.snapshotFinancialState = snapshotFinancialState;
