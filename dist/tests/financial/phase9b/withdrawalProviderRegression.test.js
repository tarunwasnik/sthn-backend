"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalProviderRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const internalPayout_model_1 = __importDefault(require("../../../models/internalProvider/internalPayout.model"));
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payout_model_1 = require("../../../models/payout.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const withdrawal_model_1 = require("../../../models/withdrawal.model");
const withdrawalProviderInitialization_service_1 = require("../../../services/financial/withdrawalProviderInitialization.service");
const withdrawalProviderInitializationFixtures_1 = require("./fixtures/withdrawalProviderInitializationFixtures");
const registerWithdrawalProviderRegressionTests = () => {
    (0, node_test_1.test)("phase9b preserves prior financial domains and performs no provider execution", async () => {
        const server = await (0, withdrawalProviderInitializationFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, withdrawalProviderInitializationFixtures_1.createReservedWithdrawalProviderFixture)(server.baseUrl);
            const before = {
                financial: await (0, withdrawalProviderInitializationFixtures_1.snapshotFinancialState)(fixture.creatorWallet._id),
                ledgerEntries: await ledgerEntry_model_1.LedgerEntry.countDocuments(),
                projections: await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(),
                payouts: await payout_model_1.Payout.countDocuments(),
                withdrawals: await withdrawal_model_1.Withdrawal.countDocuments(),
                internalPayments: await internalPayment_model_1.default.countDocuments(),
                internalPayouts: await internalPayout_model_1.default.countDocuments(),
                topUpFundings: await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(),
            };
            await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.initialize(fixture.withdrawal.withdrawalReference);
            strict_1.default.deepEqual(await (0, withdrawalProviderInitializationFixtures_1.snapshotFinancialState)(fixture.creatorWallet._id), before.financial);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments(), before.ledgerEntries);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(), before.projections);
            strict_1.default.equal(await payout_model_1.Payout.countDocuments(), before.payouts);
            strict_1.default.equal(await withdrawal_model_1.Withdrawal.countDocuments(), before.withdrawals);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments(), before.internalPayments);
            strict_1.default.equal(await internalPayout_model_1.default.countDocuments(), before.internalPayouts);
            strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(), before.topUpFundings);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalProviderRegressionTests = registerWithdrawalProviderRegressionTests;
