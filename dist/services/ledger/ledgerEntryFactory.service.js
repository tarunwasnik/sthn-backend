"use strict";
// backend/src/services/ledger/ledgerEntryFactory.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ledgerEntryFactoryService = exports.LedgerEntryFactoryService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const reference_util_1 = require("../../utils/financial/reference.util");
class LedgerEntryFactoryService {
    /* -------------------------------------------------------------------------- */
    /* Helpers                                                                     */
    /* -------------------------------------------------------------------------- */
    toObjectId(value) {
        if (!value) {
            return undefined;
        }
        return new mongoose_1.default.Types.ObjectId(value);
    }
    buildMetadata(input, idempotencyKey) {
        const fingerprint = (0, idempotency_util_1.createIdempotencyFingerprint)(input.transactionId, input.bookingId, input.paymentId, input.refundId, input.payoutId, input.settlementId, input.userId, input.type, input.source, input.direction, input.money.amount, input.money.currency, idempotencyKey);
        return {
            ...(input.metadata ?? {}),
            fingerprint,
            idempotencyKey,
            generatedAt: new Date().toISOString(),
        };
    }
    buildBaseEntry(input) {
        const idempotencyKey = input.idempotencyKey ?? (0, idempotency_util_1.generateIdempotencyKey)();
        return {
            ledgerReference: (0, reference_util_1.generateFinancialReference)("LEDGER"),
            transactionId: input.transactionId,
            idempotencyKey,
            type: input.type,
            source: input.source,
            direction: input.direction,
            amount: input.money.amount,
            currency: input.money.currency,
            bookingId: this.toObjectId(input.bookingId),
            paymentId: this.toObjectId(input.paymentId),
            refundId: this.toObjectId(input.refundId),
            payoutId: this.toObjectId(input.payoutId),
            settlementId: this.toObjectId(input.settlementId),
            userId: this.toObjectId(input.userId),
            description: input.description,
            metadata: this.buildMetadata(input, idempotencyKey),
        };
    }
    /* -------------------------------------------------------------------------- */
    /* Validation                                                                  */
    /* -------------------------------------------------------------------------- */
    validateInput(input) {
        if (!input.transactionId.trim()) {
            throw new Error("Transaction ID is required.");
        }
        if (!input.type) {
            throw new Error("Ledger entry type is required.");
        }
        if (!input.source) {
            throw new Error("Ledger source is required.");
        }
        if (!input.direction) {
            throw new Error("Money direction is required.");
        }
        if (!input.money) {
            throw new Error("Money is required.");
        }
        if (typeof input.money.amount !== "number" ||
            !Number.isFinite(input.money.amount)) {
            throw new Error("Invalid money amount.");
        }
        if (input.money.amount < 0) {
            throw new Error("Money amount cannot be negative.");
        }
        if (typeof input.money.currency !== "string" ||
            input.money.currency.trim().length !== 3) {
            throw new Error("Invalid ISO currency.");
        }
        const objectIds = [
            input.bookingId,
            input.paymentId,
            input.refundId,
            input.payoutId,
            input.settlementId,
            input.userId,
        ];
        for (const id of objectIds) {
            if (id && !mongoose_1.default.Types.ObjectId.isValid(id)) {
                throw new Error(`Invalid ObjectId: ${id}`);
            }
        }
    }
    /* -------------------------------------------------------------------------- */
    /* Factory                                                                     */
    /* -------------------------------------------------------------------------- */
    createEntry(input) {
        this.validateInput(input);
        return this.buildBaseEntry(input);
    }
    createEntries(input) {
        if (!Array.isArray(input.entries) || input.entries.length === 0) {
            throw new Error("At least one ledger entry is required.");
        }
        return input.entries.map((entry) => this.createEntry(entry));
    }
}
exports.LedgerEntryFactoryService = LedgerEntryFactoryService;
exports.ledgerEntryFactoryService = new LedgerEntryFactoryService();
