"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingEscrowAllocationFullFlowTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const bookingEscrowAllocationStatus_enum_1 = require("../../../enums/financial/bookingEscrowAllocationStatus.enum");
const bookingFundReservationStatus_enum_1 = require("../../../enums/financial/bookingFundReservationStatus.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../../enums/financial/moneyDirection.enum");
const paymentStatus_enum_1 = require("../../../enums/financial/paymentStatus.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const booking_model_1 = require("../../../models/booking.model");
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
const bookingEscrowAllocation_service_1 = require("../../../services/financial/bookingEscrowAllocation.service");
const bookingEscrowAllocationFixtures_1 = require("./fixtures/bookingEscrowAllocationFixtures");
const accountBalance = (entries, account) => entries.filter((entry) => entry.account === account)
    .reduce((total, entry) => total + (entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT ? entry.amount : -entry.amount), 0);
const registerBookingEscrowAllocationFullFlowTests = () => {
    (0, node_test_1.test)("phase8d full flow allocates captured escrow into fee revenue, commission payable, and Creator payable", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl, {
                walletAmount: 1050,
                slotAmounts: [1000],
            });
            const beforeWallet = await wallet_model_1.Wallet.findById(captured.fixture.actors.wallet._id).orFail();
            const beforeProjectionCount = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments();
            const beforeTopUpCount = await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments();
            strict_1.default.deepEqual([
                beforeWallet.availableBalance,
                beforeWallet.reservedBalance,
                beforeWallet.lockedBalance,
                beforeWallet.currentBalance,
            ], [0, 0, 0, 0]);
            const result = await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString());
            strict_1.default.equal(result.replay, false);
            strict_1.default.equal(result.allocation.status, bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED);
            strict_1.default.equal(result.allocation.bookingAmount, 1050);
            strict_1.default.equal(result.allocation.serviceAmount, 1000);
            strict_1.default.equal(result.allocation.platformFeeAmount, 50);
            strict_1.default.equal(result.allocation.totalAmount, 1050);
            strict_1.default.equal(result.allocation.commissionRateBps, 2000);
            strict_1.default.equal(result.allocation.commissionAmount, 200);
            strict_1.default.equal(result.allocation.creatorAmount, 800);
            strict_1.default.equal("_id" in result.allocation, false);
            strict_1.default.equal("allocationKey" in result.allocation, false);
            strict_1.default.equal("allocationFingerprint" in result.allocation, false);
            strict_1.default.equal("allocationLedgerTransaction" in result.allocation, false);
            const [booking, payment, reservation, allocation, wallet, entries] = await Promise.all([
                booking_model_1.Booking.findById(captured.booking._id).orFail(),
                payment_model_1.Payment.findById(captured.payment._id).orFail(),
                bookingFundReservation_model_1.BookingFundReservation.findById(captured.reservation._id).orFail(),
                bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({ bookingId: captured.booking._id })
                    .select("+allocationKey +escrowLedgerTransaction " +
                    "+allocationLedgerTransaction +allocationLedgerEntryIds " +
                    "+allocationFingerprint").orFail(),
                wallet_model_1.Wallet.findById(captured.fixture.actors.wallet._id).orFail(),
                ledgerEntry_model_1.LedgerEntry.find({ bookingId: captured.booking._id }),
            ]);
            strict_1.default.equal(booking.status, "COMPLETED");
            strict_1.default.equal(payment.status, paymentStatus_enum_1.PaymentStatus.CAPTURED);
            strict_1.default.equal(reservation.status, bookingFundReservationStatus_enum_1.BookingFundReservationStatus.CAPTURED);
            strict_1.default.equal(allocation.status, bookingEscrowAllocationStatus_enum_1.BookingEscrowAllocationStatus.ALLOCATED);
            strict_1.default.equal(allocation.allocationLedgerEntryIds.length, 4);
            strict_1.default.equal(accountBalance(entries, ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW), 0);
            strict_1.default.equal(accountBalance(entries, ledgerAccount_enum_1.LedgerAccount.PLATFORM_COMMISSION_PAYABLE), 200);
            strict_1.default.equal(accountBalance(entries, ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE), 800);
            strict_1.default.equal(accountBalance(entries, ledgerAccount_enum_1.LedgerAccount.PLATFORM_SERVICE_FEE_REVENUE), 50);
            const allocationEntries = entries.filter((entry) => entry.source === ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION);
            strict_1.default.equal(allocationEntries.length, 4);
            strict_1.default.equal(new Set(allocationEntries.map((entry) => entry.transactionId)).size, 1);
            strict_1.default.ok(allocationEntries.every((entry) => entry.type === ledgerEntryType_enum_1.LedgerEntryType.BOOKING_ESCROW_ALLOCATED &&
                !entry.walletId));
            strict_1.default.equal(allocationEntries.filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT)
                .reduce((sum, entry) => sum + entry.amount, 0), 1050);
            strict_1.default.equal(allocationEntries.filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT)
                .reduce((sum, entry) => sum + entry.amount, 0), 1050);
            strict_1.default.deepEqual([
                wallet.availableBalance,
                wallet.reservedBalance,
                wallet.lockedBalance,
                wallet.currentBalance,
            ], [
                beforeWallet.availableBalance,
                beforeWallet.reservedBalance,
                beforeWallet.lockedBalance,
                beforeWallet.currentBalance,
            ]);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(), beforeProjectionCount);
            strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({
                userId: captured.fixture.actors.creatorId,
            }), 0);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments({
                paymentId: payment._id,
            }), 0);
            strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(), beforeTopUpCount);
            strict_1.default.equal(await settlement_model_1.Settlement.countDocuments({ bookingId: booking._id }), 0);
            strict_1.default.equal(await payout_model_1.Payout.countDocuments(), 0);
            strict_1.default.equal(await withdrawal_model_1.Withdrawal.countDocuments(), 0);
            strict_1.default.equal(await refund_model_1.Refund.countDocuments({ paymentId: payment._id }), 0);
            const audit = await auditLog_model_1.AuditLog.findOne({
                action: auditAction_enum_1.AuditAction.BOOKING_ESCROW_ALLOCATED,
                entityId: allocation._id,
            }).orFail();
            strict_1.default.equal(audit.actorType, "SYSTEM");
            strict_1.default.equal(audit.financialContext?.domain, "ESCROW");
            strict_1.default.equal(audit.metadata?.commissionAmount, 200);
            strict_1.default.equal(audit.metadata?.creatorAmount, 800);
            strict_1.default.equal(audit.metadata?.platformFeeAmount, 50);
            strict_1.default.equal(audit.metadata?.totalAmount, 1050);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingEscrowAllocationFullFlowTests = registerBookingEscrowAllocationFullFlowTests;
