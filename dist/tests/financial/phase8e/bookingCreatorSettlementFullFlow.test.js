"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementFullFlowTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const bookingCreatorSettlementStatus_enum_1 = require("../../../enums/financial/bookingCreatorSettlementStatus.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../../enums/financial/moneyDirection.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const booking_model_1 = require("../../../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const bookingEscrowAllocation_model_1 = require("../../../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../models/payment.model");
const payout_model_1 = require("../../../models/payout.model");
const refund_model_1 = require("../../../models/refund.model");
const settlement_model_1 = require("../../../models/settlement.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const withdrawal_model_1 = require("../../../models/withdrawal.model");
const bookingCreatorSettlement_service_1 = require("../../../services/financial/bookingCreatorSettlement.service");
const bookingCreatorSettlementFixtures_1 = require("./fixtures/bookingCreatorSettlementFixtures");
const accountBalance = (entries, account) => entries.filter((entry) => entry.account === account)
    .reduce((total, entry) => total + (entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT ? entry.amount : -entry.amount), 0);
const registerBookingCreatorSettlementFullFlowTests = () => {
    (0, node_test_1.test)("phase8e full flow settles Creator payable 800 into the existing User-owned Wallet", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl, {
                bookingAmount: 1000,
                customerWalletAmount: 1600,
                creatorWalletAmount: 100,
            });
            const customerBefore = await wallet_model_1.Wallet.findById(fixture.fixture.actors.wallet._id).orFail();
            const topUpCount = await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments();
            const result = await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString());
            strict_1.default.equal(result.replay, false);
            strict_1.default.equal(result.settlement.status, bookingCreatorSettlementStatus_enum_1.BookingCreatorSettlementStatus.SETTLED);
            strict_1.default.equal(result.settlement.creatorAmount, 800);
            strict_1.default.equal(result.settlement.currency, "INR");
            strict_1.default.deepEqual([
                result.wallet.availableBalance,
                result.wallet.reservedBalance,
                result.wallet.lockedBalance,
                result.wallet.currentBalance,
            ], [900, 0, 0, 900]);
            strict_1.default.equal("_id" in result.settlement, false);
            strict_1.default.equal("settlementKey" in result.settlement, false);
            strict_1.default.equal("settlementFingerprint" in result.settlement, false);
            strict_1.default.equal("creatorWalletId" in result.wallet, false);
            const [booking, payment, reservation, allocation, settlement, wallet] = await Promise.all([
                booking_model_1.Booking.findById(fixture.booking._id).orFail(),
                payment_model_1.Payment.findById(fixture.payment._id).orFail(),
                bookingFundReservation_model_1.BookingFundReservation.findById(fixture.reservation._id).orFail(),
                bookingEscrowAllocation_model_1.BookingEscrowAllocation.findById(fixture.allocation._id).orFail(),
                bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({
                    bookingId: fixture.booking._id,
                }).select("+settlementKey +settlementTransactionId " +
                    "+settlementProjectionOperationReference " +
                    "+settlementLedgerEntryIds +settlementFingerprint").orFail(),
                wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail(),
            ]);
            strict_1.default.equal(booking.status, "COMPLETED");
            strict_1.default.equal(payment.status, "CAPTURED");
            strict_1.default.equal(reservation.status, "CAPTURED");
            strict_1.default.equal(allocation.status, "ALLOCATED");
            strict_1.default.equal(settlement.status, "SETTLED");
            strict_1.default.equal(settlement.settlementLedgerEntryIds.length, 2);
            strict_1.default.deepEqual([
                wallet.availableBalance,
                wallet.reservedBalance,
                wallet.lockedBalance,
                wallet.currentBalance,
            ], [900, 0, 0, 900]);
            const entries = await ledgerEntry_model_1.LedgerEntry.find({ bookingId: booking._id });
            strict_1.default.equal(accountBalance(entries, ledgerAccount_enum_1.LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE), 200);
            strict_1.default.equal(accountBalance(entries, ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE), 0);
            strict_1.default.equal(accountBalance(entries.filter((entry) => entry.userId?.toString() === fixture.fixture.actors.creatorId.toString()), ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE), 800);
            const settlementEntries = entries.filter((entry) => entry.source === ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT);
            strict_1.default.equal(settlementEntries.length, 2);
            strict_1.default.ok(settlementEntries.every((entry) => entry.type === ledgerEntryType_enum_1.LedgerEntryType.BOOKING_CREATOR_SETTLED &&
                entry.userId?.toString() === fixture.fixture.actors.creatorId.toString()));
            strict_1.default.equal(settlementEntries.filter((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE &&
                entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
                !entry.walletId).length, 1);
            strict_1.default.equal(settlementEntries.filter((entry) => entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE &&
                entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
                entry.walletId?.toString() === wallet._id.toString()).length, 1);
            strict_1.default.equal(settlementEntries.filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT)
                .reduce((sum, entry) => sum + entry.amount, 0), 800);
            strict_1.default.equal(settlementEntries.filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT)
                .reduce((sum, entry) => sum + entry.amount, 0), 800);
            const projection = await walletProjectionOperation_model_1.WalletProjectionOperation.findOne({
                operationReference: settlement.settlementProjectionOperationReference,
            }).orFail();
            strict_1.default.deepEqual([
                projection.deltas.availableBalance,
                projection.deltas.reservedBalance,
                projection.deltas.lockedBalance,
            ], [800, 0, 0]);
            strict_1.default.equal(projection.walletId.toString(), wallet._id.toString());
            strict_1.default.equal(projection.userId.toString(), wallet.userId.toString());
            strict_1.default.equal(projection.ledgerEntryIds.length, 2);
            const customerAfter = await wallet_model_1.Wallet.findById(customerBefore._id).orFail();
            strict_1.default.deepEqual([
                customerAfter.availableBalance,
                customerAfter.reservedBalance,
                customerAfter.lockedBalance,
                customerAfter.currentBalance,
                customerAfter.projectionVersion,
            ], [
                customerBefore.availableBalance,
                customerBefore.reservedBalance,
                customerBefore.lockedBalance,
                customerBefore.currentBalance,
                customerBefore.projectionVersion,
            ]);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
                entityId: settlement._id,
            }), 1);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments({
                paymentId: payment._id,
            }), 0);
            strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(), topUpCount);
            strict_1.default.equal(await settlement_model_1.Settlement.countDocuments({ bookingId: booking._id }), 0);
            strict_1.default.equal(await payout_model_1.Payout.countDocuments(), 0);
            strict_1.default.equal(await withdrawal_model_1.Withdrawal.countDocuments(), 0);
            strict_1.default.equal(await refund_model_1.Refund.countDocuments({ paymentId: payment._id }), 0);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingCreatorSettlementFullFlowTests = registerBookingCreatorSettlementFullFlowTests;
