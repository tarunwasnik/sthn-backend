"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementOperationalRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payout_model_1 = require("../../../models/payout.model");
const refund_model_1 = require("../../../models/refund.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const withdrawal_model_1 = require("../../../models/withdrawal.model");
const bookingCreatorSettlementReconciliation_service_1 = require("../../../services/financial/bookingCreatorSettlementReconciliation.service");
const bookingCreatorSettlementOperationalFixtures_1 = require("./fixtures/bookingCreatorSettlementOperationalFixtures");
const registerBookingCreatorSettlementOperationalRegressionTests = () => {
    (0, node_test_1.test)("phase8f operational inspection creates no Wallet, accounting, provider, payout, withdrawal, or refund effect", async () => {
        const server = await (0, bookingCreatorSettlementOperationalFixtures_1.startOperationalHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(server.baseUrl);
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            const counts = {
                ledger: await ledgerEntry_model_1.LedgerEntry.countDocuments(),
                projection: await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(),
                internalPayment: await internalPayment_model_1.default.countDocuments(),
                topUp: await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(),
                payout: await payout_model_1.Payout.countDocuments(),
                withdrawal: await withdrawal_model_1.Withdrawal.countDocuments(),
                refund: await refund_model_1.Refund.countDocuments(),
            };
            await bookingCreatorSettlementReconciliation_service_1.bookingCreatorSettlementReconciliationService.reconcile(fixture.settlement.settlementReference);
            strict_1.default.deepEqual({
                ledger: await ledgerEntry_model_1.LedgerEntry.countDocuments(),
                projection: await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(),
                internalPayment: await internalPayment_model_1.default.countDocuments(),
                topUp: await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(),
                payout: await payout_model_1.Payout.countDocuments(),
                withdrawal: await withdrawal_model_1.Withdrawal.countDocuments(),
                refund: await refund_model_1.Refund.countDocuments(),
            }, counts);
            const walletAfter = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.equal(walletAfter.currentBalance, walletBefore.currentBalance);
            strict_1.default.equal(walletAfter.projectionVersion, walletBefore.projectionVersion);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingCreatorSettlementOperationalRegressionTests = registerBookingCreatorSettlementOperationalRegressionTests;
