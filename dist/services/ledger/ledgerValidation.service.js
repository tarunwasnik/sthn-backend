"use strict";
//backend/src/services/ledger/ledgerValidation.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ledgerValidationService = exports.LedgerValidationService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
class LedgerValidationService {
    /**
     * Validate a single ledger entry before persistence.
     */
    validateEntry(entry) {
        this.validateRequiredFields(entry);
        this.validateIdentifiers(entry);
        this.validateAmount(entry);
        this.validateCurrency(entry);
        this.validateEnums(entry);
    }
    /**
     * Validate multiple ledger entries.
     */
    validateEntries(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            throw new Error("At least one ledger entry is required.");
        }
        for (const entry of entries) {
            this.validateEntry(entry);
        }
    }
    validateRequiredFields(entry) {
        if (!entry.ledgerReference) {
            throw new Error("Ledger reference is required.");
        }
        if (!entry.transactionId) {
            throw new Error("Transaction ID is required.");
        }
        if (!entry.type) {
            throw new Error("Ledger entry type is required.");
        }
        if (!entry.source) {
            throw new Error("Ledger source is required.");
        }
        if (!entry.direction) {
            throw new Error("Money direction is required.");
        }
        if (entry.amount === undefined || entry.amount === null) {
            throw new Error("Ledger amount is required.");
        }
        if (!entry.currency) {
            throw new Error("Currency is required.");
        }
    }
    validateIdentifiers(entry) {
        const ids = [
            entry.bookingId,
            entry.paymentId,
            entry.refundId,
            entry.payoutId,
            entry.settlementId,
            entry.userId,
        ];
        for (const id of ids) {
            if (id && !mongoose_1.default.Types.ObjectId.isValid(id)) {
                throw new Error(`Invalid ObjectId: ${id}`);
            }
        }
    }
    validateAmount(entry) {
        if (typeof entry.amount !== "number") {
            throw new Error("Amount must be a number.");
        }
        if (!Number.isFinite(entry.amount)) {
            throw new Error("Amount must be finite.");
        }
        if (entry.amount < 0) {
            throw new Error("Amount cannot be negative.");
        }
    }
    validateCurrency(entry) {
        if (typeof entry.currency !== "string") {
            throw new Error("Currency must be a string.");
        }
        if (entry.currency.trim().length !== 3) {
            throw new Error("Currency must be a valid ISO-4217 code.");
        }
    }
    validateEnums(entry) {
        if (!Object.values(ledgerEntryType_enum_1.LedgerEntryType).includes(entry.type)) {
            throw new Error("Invalid ledger entry type.");
        }
        if (!Object.values(ledgerSource_enum_1.LedgerSource).includes(entry.source)) {
            throw new Error("Invalid ledger source.");
        }
        if (!Object.values(moneyDirection_enum_1.MoneyDirection).includes(entry.direction)) {
            throw new Error("Invalid money direction.");
        }
    }
}
exports.LedgerValidationService = LedgerValidationService;
exports.ledgerValidationService = new LedgerValidationService();
