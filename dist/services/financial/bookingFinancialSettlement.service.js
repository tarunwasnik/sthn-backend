"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingFinancialSettlementService = exports.BookingFinancialSettlementService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const booking_model_1 = require("../../models/booking.model");
const dispute_model_1 = require("../../models/dispute.model");
const settlementCreatorBalanceProjectionOperation_model_1 = require("../../models/settlementCreatorBalanceProjectionOperation.model");
const payment_repository_1 = require("../../repositories/payment.repository");
const settlement_repository_1 = require("../../repositories/settlement.repository");
const creatorBalance_repository_1 = require("../../repositories/creatorBalance.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const ledger_service_1 = require("./ledger.service");
const settlementCalculation_service_1 = require("./settlementCalculation.service");
const settlementStatus_enum_1 = require("../../enums/financial/settlementStatus.enum");
const paymentStatus_enum_1 = require("../../enums/financial/paymentStatus.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const paymentProvider_enum_1 = require("../../enums/financial/paymentProvider.enum");
const reference_util_1 = require("../../utils/financial/reference.util");
const SettlementError_1 = require("../../errors/financial/SettlementError");
const auditLog_service_1 = require("../auditLog.service");
const auditAction_enum_1 = require("../../enums/financial/auditAction.enum");
class BookingFinancialSettlementService {
    async settleBooking(bookingId) {
        const session = await mongoose_1.default.startSession();
        let outcome;
        try {
            await session.withTransaction(async () => {
                const booking = await booking_model_1.Booking.findById(bookingId).session(session);
                if (!booking)
                    throw new SettlementError_1.SettlementError("Booking not found.", "SETTLEMENT_NOT_ELIGIBLE");
                if (booking.status !== "COMPLETED" || !booking.completedAt || !booking.settlementEligibleAt || booking.settlementEligibleAt > new Date() || booking.isFinancialLocked)
                    throw new SettlementError_1.SettlementError("Booking is not eligible for settlement.", "SETTLEMENT_NOT_ELIGIBLE");
                if (await dispute_model_1.Dispute.exists({ bookingId: booking._id, status: "OPEN" }).session(session))
                    throw new SettlementError_1.SettlementError("Open dispute blocks settlement.", "SETTLEMENT_NOT_ELIGIBLE");
                if (!booking.paymentId)
                    throw new SettlementError_1.SettlementError("Booking payment is missing.", "ESCROW_NOT_FOUND");
                const payment = await payment_repository_1.paymentRepository.findById(booking.paymentId, session);
                if (!payment || payment.status !== paymentStatus_enum_1.PaymentStatus.CAPTURED || payment.automaticSettlementBlocked)
                    throw new SettlementError_1.SettlementError("Payment is not eligible for settlement.", "SETTLEMENT_NOT_ELIGIBLE");
                const calculation = (0, settlementCalculation_service_1.calculateSettlement)({ serviceAmount: payment.serviceAmount, customerFeeAmount: payment.customerFeeAmount, grossEscrowAmount: payment.grossEscrowAmount, currency: payment.currency, pricingPolicy: payment.pricingPolicy, pricingVersion: payment.pricingVersion, paymentAmount: payment.amount });
                const { currency: _calculationCurrency, ...calculationFields } = calculation;
                const obligationKey = `booking-settlement:${booking._id.toString()}`;
                let settlement = await settlement_repository_1.settlementRepository.findByFinancialObligationKey(obligationKey, session);
                if (settlement?.status === settlementStatus_enum_1.SettlementStatus.COMPLETED) {
                    await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.SETTLEMENT_REPLAY_DETECTED, actor: { type: "SYSTEM", reference: "settlement-job" }, entityType: "SETTLEMENT", entityId: settlement._id, financialContext: { domain: "SETTLEMENT", primaryReference: settlement.settlementReference, settlementReference: settlement.settlementReference, paymentReference: payment.paymentReference, amount: settlement.amount, currency: settlement.currency }, transition: { outcome: "REPLAYED" }, session });
                    outcome = { settlement, replay: true };
                    return;
                }
                if (settlement && settlement.paymentId.toString() !== payment._id.toString())
                    throw new SettlementError_1.SettlementError("Settlement obligation conflicts.", "SETTLEMENT_ALREADY_RUNNING");
                const captureTx = `escrow-capture:${payment.paymentReference}`;
                const capture = await ledgerEntry_repository_1.ledgerEntryRepository.findByPostingKey(`${captureTx}:escrow-credit`, session);
                const captureDebit = await ledgerEntry_repository_1.ledgerEntryRepository.findByPostingKey(`${captureTx}:customer-debit`, session);
                if (!capture || !captureDebit || capture.amount !== calculation.grossEscrowAmount || capture.currency !== payment.currency)
                    throw new SettlementError_1.SettlementError("Escrow is not proven.", "ESCROW_NOT_FOUND");
                const priorDebits = await (await Promise.resolve().then(() => __importStar(require("../../models/ledgerEntry.model")))).LedgerEntry.aggregate([{ $match: { paymentId: payment._id, account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW, direction: "DEBIT" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]).session(session);
                if ((priorDebits[0]?.total ?? 0) !== 0)
                    throw new SettlementError_1.SettlementError("Escrow is not fully available.", "SETTLEMENT_NOT_ELIGIBLE");
                if (!settlement)
                    settlement = await settlement_repository_1.settlementRepository.create({ settlementReference: (0, reference_util_1.generateFinancialReference)("SETTLEMENT"), bookingId: booking._id, paymentId: payment._id, userId: payment.userId, creatorId: payment.creatorId, amount: calculation.grossEscrowAmount, currency: payment.currency, status: settlementStatus_enum_1.SettlementStatus.PROCESSING, provider: paymentProvider_enum_1.PaymentProvider.INTERNAL, attemptNumber: 1, retryable: false, idempotencyKey: obligationKey, financialObligationKey: obligationKey, ...calculationFields, ledgerTransactionReference: `settlement:${obligationKey}` }, session);
                const tx = settlement.ledgerTransactionReference;
                const legs = [
                    ["escrow-debit", "DEBIT", ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW, calculation.grossEscrowAmount],
                    ["creator-credit", "CREDIT", ledgerAccount_enum_1.LedgerAccount.CREATOR_AVAILABLE, calculation.creatorNetAmount],
                    ["customer-fee-credit", "CREDIT", ledgerAccount_enum_1.LedgerAccount.PLATFORM_CUSTOMER_FEE_REVENUE, calculation.customerFeeAmount],
                    ["commission-credit", "CREDIT", ledgerAccount_enum_1.LedgerAccount.PLATFORM_CREATOR_COMMISSION_REVENUE, calculation.platformCommissionAmount],
                ];
                for (const [key, direction, account, amount] of legs)
                    await ledger_service_1.ledgerService.createEntry({ type: ledgerEntryType_enum_1.LedgerEntryType.SETTLEMENT, source: ledgerSource_enum_1.LedgerSource.SETTLEMENT, direction: direction, account, postingKey: `${tx}:${key}`, transactionId: tx, bookingId: booking._id.toString(), paymentId: payment._id.toString(), settlementId: settlement._id.toString(), userId: payment.creatorId.toString(), money: { amount, currency: payment.currency }, idempotencyKey: tx }, session);
                const projection = await settlementCreatorBalanceProjectionOperation_model_1.SettlementCreatorBalanceProjectionOperation.findOne({ settlementId: settlement._id }).session(session);
                if (!projection) {
                    await settlementCreatorBalanceProjectionOperation_model_1.SettlementCreatorBalanceProjectionOperation.create([{ settlementId: settlement._id, creatorId: payment.creatorId, amount: calculation.creatorNetAmount, currency: payment.currency }], { session });
                    const balance = await creatorBalance_repository_1.creatorBalanceRepository.creditAvailableForSettlement(payment.creatorId.toString(), payment.currency, calculation.creatorNetAmount, session);
                    if (!balance)
                        throw new SettlementError_1.SettlementError("Creator balance is unavailable.", "CREATOR_BALANCE_FAILURE");
                }
                const completed = await settlement_repository_1.settlementRepository.updateById(settlement._id.toString(), { status: settlementStatus_enum_1.SettlementStatus.COMPLETED, settledAt: new Date() }, session);
                if (!completed)
                    throw new SettlementError_1.SettlementError("Settlement completion conflicted.");
                await booking_model_1.Booking.updateOne({ _id: booking._id, settlementId: { $exists: false } }, { $set: { settlementId: completed._id, settledAt: completed.settledAt } }, { session });
                await (0, auditLog_service_1.createFinancialAudit)({ action: auditAction_enum_1.AuditAction.SETTLEMENT_COMPLETED, actor: { type: "SYSTEM", reference: "settlement-job" }, entityType: "SETTLEMENT", entityId: completed._id, financialContext: { domain: "SETTLEMENT", primaryReference: completed.settlementReference, settlementReference: completed.settlementReference, paymentReference: payment.paymentReference, amount: completed.amount, currency: completed.currency, ledgerTransactionReference: tx, projectionOperationReference: `settlement:${completed._id}:creator-balance` }, transition: { fromStatus: settlementStatus_enum_1.SettlementStatus.PROCESSING, toStatus: settlementStatus_enum_1.SettlementStatus.COMPLETED, outcome: "SUCCEEDED" }, session });
                outcome = { settlement: completed, replay: false };
            });
        }
        finally {
            await session.endSession();
        }
        return outcome;
    }
}
exports.BookingFinancialSettlementService = BookingFinancialSettlementService;
exports.bookingFinancialSettlementService = new BookingFinancialSettlementService();
