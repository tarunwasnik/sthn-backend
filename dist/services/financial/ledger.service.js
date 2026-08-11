"use strict";
// backend/src/services/financial/ledger.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ledgerService = exports.LedgerService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const money_util_1 = require("../../utils/financial/money.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const LedgerError_1 = require("../../errors/financial/LedgerError");
class LedgerService {
    constructor(repository = ledgerEntry_repository_1.ledgerEntryRepository) {
        this.repository = repository;
    }
    /* -------------------------------------------------------------------------- */
    /* Validation                                                                  */
    /* -------------------------------------------------------------------------- */
    validateMoney(money) {
        if (!(0, money_util_1.isValidMoney)(money)) {
            throw new LedgerError_1.LedgerError("Invalid monetary value.");
        }
    }
    validateObjectId(value, field) {
        if (!value) {
            return;
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new LedgerError_1.LedgerError(`${field} is invalid.`);
        }
    }
    validateInput(input) {
        this.validateMoney(input.money);
        if (!input.transactionId?.trim()) {
            throw new LedgerError_1.LedgerError("Transaction ID is required.");
        }
        this.validateObjectId(input.bookingId, "bookingId");
        this.validateObjectId(input.paymentId, "paymentId");
        this.validateObjectId(input.refundId, "refundId");
        this.validateObjectId(input.payoutId, "payoutId");
        this.validateObjectId(input.settlementId, "settlementId");
        this.validateObjectId(input.userId, "userId");
        this.validateObjectId(input.walletId, "walletId");
        if (!input.type) {
            throw new LedgerError_1.LedgerError("Ledger type is required.");
        }
        if (!input.source) {
            throw new LedgerError_1.LedgerError("Ledger source is required.");
        }
        if (!input.direction) {
            throw new LedgerError_1.LedgerError("Ledger direction is required.");
        }
    }
    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                     */
    /* -------------------------------------------------------------------------- */
    buildFingerprint(input) {
        return (0, idempotency_util_1.createIdempotencyFingerprint)(input.bookingId, input.paymentId, input.refundId, input.payoutId, input.settlementId, input.userId, input.walletId, input.type, input.source, input.direction, input.money.amount, input.money.currency, input.idempotencyKey, input.account, input.postingKey);
    }
    async ensureNotDuplicate(input, session) {
        const fingerprint = this.buildFingerprint(input);
        const exists = await this.repository.exists({ "metadata.fingerprint": fingerprint }, session);
        if (exists) {
            throw new LedgerError_1.LedgerError("Duplicate ledger transaction detected.");
        }
    }
    buildDocument(input) {
        return {
            ledgerReference: (0, reference_util_1.generateFinancialReference)("LEDGER"),
            transactionId: input.transactionId,
            idempotencyKey: input.idempotencyKey,
            account: input.account,
            postingKey: input.postingKey,
            type: input.type,
            source: input.source,
            direction: input.direction,
            amount: input.money.amount,
            currency: input.money.currency,
            bookingId: input.bookingId
                ? new mongoose_1.default.Types.ObjectId(input.bookingId)
                : undefined,
            paymentId: input.paymentId
                ? new mongoose_1.default.Types.ObjectId(input.paymentId)
                : undefined,
            refundId: input.refundId
                ? new mongoose_1.default.Types.ObjectId(input.refundId)
                : undefined,
            payoutId: input.payoutId
                ? new mongoose_1.default.Types.ObjectId(input.payoutId)
                : undefined,
            settlementId: input.settlementId
                ? new mongoose_1.default.Types.ObjectId(input.settlementId)
                : undefined,
            userId: input.userId
                ? new mongoose_1.default.Types.ObjectId(input.userId)
                : undefined,
            walletId: input.walletId
                ? new mongoose_1.default.Types.ObjectId(input.walletId)
                : undefined,
            description: input.description,
            metadata: {
                ...(input.metadata ?? {}),
                fingerprint: this.buildFingerprint(input),
            },
        };
    }
    /* -------------------------------------------------------------------------- */
    /* Create                                                                      */
    /* -------------------------------------------------------------------------- */
    async createEntry(input, session) {
        this.validateInput(input);
        await this.ensureNotDuplicate(input, session);
        return this.repository.create(this.buildDocument(input), session);
    }
    async createCredit(input, session) {
        return this.createEntry({
            ...input,
            direction: moneyDirection_enum_1.MoneyDirection.CREDIT,
        }, session);
    }
    async createDebit(input, session) {
        return this.createEntry({
            ...input,
            direction: moneyDirection_enum_1.MoneyDirection.DEBIT,
        }, session);
    }
    /* -------------------------------------------------------------------------- */
    /* Retrieval                                                                   */
    /* -------------------------------------------------------------------------- */
    async getById(id) {
        this.validateObjectId(id, "ledgerId");
        const ledger = await this.repository.findById(id);
        if (!ledger) {
            throw new LedgerError_1.LedgerError("Ledger entry not found.");
        }
        return ledger;
    }
    async getByReference(ledgerReference) {
        const ledger = await this.repository.findByLedgerReference(ledgerReference);
        if (!ledger) {
            throw new LedgerError_1.LedgerError("Ledger entry not found.");
        }
        return ledger;
    }
    async getByBooking(bookingId) {
        this.validateObjectId(bookingId, "bookingId");
        return this.repository.findByBookingId(bookingId);
    }
    async getByPayment(paymentId) {
        this.validateObjectId(paymentId, "paymentId");
        return this.repository.findByPaymentId(paymentId);
    }
    async getByRefund(refundId) {
        this.validateObjectId(refundId, "refundId");
        return this.repository.findByRefundId(refundId);
    }
    async getBySettlement(settlementId) {
        this.validateObjectId(settlementId, "settlementId");
        return this.repository.findBySettlementId(settlementId);
    }
    async getByPayout(payoutId) {
        this.validateObjectId(payoutId, "payoutId");
        return this.repository.findByPayoutId(payoutId);
    }
    async getByUser(userId) {
        this.validateObjectId(userId, "userId");
        return this.repository.findByUserId(userId);
    }
    async search(options) {
        const filter = {};
        if (options.bookingId)
            filter.bookingId = options.bookingId;
        if (options.paymentId)
            filter.paymentId = options.paymentId;
        if (options.refundId)
            filter.refundId = options.refundId;
        if (options.payoutId)
            filter.payoutId = options.payoutId;
        if (options.settlementId)
            filter.settlementId = options.settlementId;
        if (options.userId)
            filter.userId = options.userId;
        if (options.type)
            filter.type = options.type;
        if (options.source)
            filter.source = options.source;
        if (options.direction)
            filter.direction = options.direction;
        return this.repository.findMany(filter);
    }
    /* -------------------------------------------------------------------------- */
    /* Money Helpers                                                               */
    /* -------------------------------------------------------------------------- */
    async calculateUserBalance(userId, currency) {
        const entries = await this.getByUser(userId);
        let total = 0;
        for (const entry of entries) {
            if (entry.currency !== currency) {
                continue;
            }
            if (entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT) {
                total += entry.amount;
            }
            else {
                total -= entry.amount;
            }
        }
        return (0, money_util_1.createMoney)(total, currency);
    }
    /* -------------------------------------------------------------------------- */
    /* Integrity                                                                   */
    /* -------------------------------------------------------------------------- */
    async ledgerReferenceExists(ledgerReference) {
        return this.repository.exists({
            ledgerReference,
        });
    }
    async verifyIntegrity(ledgerId) {
        const ledger = await this.getById(ledgerId);
        if (!ledger.ledgerReference) {
            return false;
        }
        if (!ledger.currency) {
            return false;
        }
        if (ledger.amount < 0) {
            return false;
        }
        if (ledger.direction !== moneyDirection_enum_1.MoneyDirection.CREDIT &&
            ledger.direction !== moneyDirection_enum_1.MoneyDirection.DEBIT) {
            return false;
        }
        if (!ledger.type) {
            return false;
        }
        if (!ledger.source) {
            return false;
        }
        return true;
    }
    async verifyBookingLedger(bookingId) {
        const entries = await this.getByBooking(bookingId);
        return entries.every((entry) => entry.amount >= 0);
    }
    async verifyPaymentLedger(paymentId) {
        const entries = await this.getByPayment(paymentId);
        return entries.every((entry) => entry.amount >= 0);
    }
    async verifyRefundLedger(refundId) {
        const entries = await this.getByRefund(refundId);
        return entries.every((entry) => entry.amount >= 0);
    }
    async verifySettlementLedger(settlementId) {
        const entries = await this.getBySettlement(settlementId);
        return entries.every((entry) => entry.amount >= 0);
    }
    async verifyPayoutLedger(payoutId) {
        const entries = await this.getByPayout(payoutId);
        return entries.every((entry) => entry.amount >= 0);
    }
    /* -------------------------------------------------------------------------- */
    /* Audit                                                                       */
    /* -------------------------------------------------------------------------- */
    async countEntries() {
        return this.repository.count();
    }
    async countUserEntries(userId) {
        const entries = await this.getByUser(userId);
        return entries.length;
    }
    async findOne(filter) {
        return this.repository.findOne(filter);
    }
    async exists(filter) {
        return this.repository.exists(filter);
    }
    /* -------------------------------------------------------------------------- */
    /* Convenience APIs                                                            */
    /* -------------------------------------------------------------------------- */
    async getLatestBookingEntry(bookingId) {
        const entries = await this.getByBooking(bookingId);
        return entries[0] ?? null;
    }
    async getLatestPaymentEntry(paymentId) {
        const entries = await this.getByPayment(paymentId);
        return entries[0] ?? null;
    }
    async getLatestRefundEntry(refundId) {
        const entries = await this.getByRefund(refundId);
        return entries[0] ?? null;
    }
    async getLatestSettlementEntry(settlementId) {
        const entries = await this.getBySettlement(settlementId);
        return entries[0] ?? null;
    }
    async getLatestPayoutEntry(payoutId) {
        const entries = await this.getByPayout(payoutId);
        return entries[0] ?? null;
    }
    async getLatestUserEntry(userId) {
        const entries = await this.getByUser(userId);
        return entries[0] ?? null;
    }
    /* -------------------------------------------------------------------------- */
    /* Generic Queries                                                             */
    /* -------------------------------------------------------------------------- */
    async getCreditsForUser(userId) {
        return this.repository.findMany({
            userId,
            direction: moneyDirection_enum_1.MoneyDirection.CREDIT,
        });
    }
    async getDebitsForUser(userId) {
        return this.repository.findMany({
            userId,
            direction: moneyDirection_enum_1.MoneyDirection.DEBIT,
        });
    }
    async getCreditsByType(type) {
        return this.repository.findMany({
            type,
            direction: moneyDirection_enum_1.MoneyDirection.CREDIT,
        });
    }
    async getDebitsByType(type) {
        return this.repository.findMany({
            type,
            direction: moneyDirection_enum_1.MoneyDirection.DEBIT,
        });
    }
    async getBySource(source) {
        return this.repository.findMany({
            source,
        });
    }
    async getByType(type) {
        return this.repository.findMany({
            type,
        });
    }
    async getByDirection(direction) {
        return this.repository.findMany({
            direction,
        });
    }
    async getUserEntriesByType(userId, type) {
        return this.repository.findMany({
            userId,
            type,
        });
    }
    async getUserEntriesBySource(userId, source) {
        return this.repository.findMany({
            userId,
            source,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Audit / Reporting                                                           */
    /* -------------------------------------------------------------------------- */
    async getBookingLedgerTotal(bookingId, currency) {
        const entries = await this.getByBooking(bookingId);
        let balance = 0;
        for (const entry of entries) {
            if (entry.currency !== currency)
                continue;
            balance +=
                entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT
                    ? entry.amount
                    : -entry.amount;
        }
        return (0, money_util_1.createMoney)(balance, currency);
    }
    async getPaymentLedgerTotal(paymentId, currency) {
        const entries = await this.getByPayment(paymentId);
        let balance = 0;
        for (const entry of entries) {
            if (entry.currency !== currency)
                continue;
            balance +=
                entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT
                    ? entry.amount
                    : -entry.amount;
        }
        return (0, money_util_1.createMoney)(balance, currency);
    }
    async getRefundLedgerTotal(refundId, currency) {
        const entries = await this.getByRefund(refundId);
        let balance = 0;
        for (const entry of entries) {
            if (entry.currency !== currency)
                continue;
            balance +=
                entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT
                    ? entry.amount
                    : -entry.amount;
        }
        return (0, money_util_1.createMoney)(balance, currency);
    }
    async getUserLedgerTotal(userId, currency) {
        return this.calculateUserBalance(userId, currency);
    }
    async hasBookingLedger(bookingId) {
        return this.repository.exists({
            bookingId,
        });
    }
    async hasPaymentLedger(paymentId) {
        return this.repository.exists({
            paymentId,
        });
    }
    async hasRefundLedger(refundId) {
        return this.repository.exists({
            refundId,
        });
    }
    async hasSettlementLedger(settlementId) {
        return this.repository.exists({
            settlementId,
        });
    }
    async hasPayoutLedger(payoutId) {
        return this.repository.exists({
            payoutId,
        });
    }
    async hasUserLedger(userId) {
        return this.repository.exists({
            userId,
        });
    }
}
exports.LedgerService = LedgerService;
exports.ledgerService = new LedgerService();
