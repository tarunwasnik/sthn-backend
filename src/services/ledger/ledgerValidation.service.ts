//backend/src/services/ledger/ledgerValidation.service.ts

import mongoose from "mongoose";

import { ILedgerEntry } from "../../models/ledgerEntry.model";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";

export class LedgerValidationService {
  /**
   * Validate a single ledger entry before persistence.
   */
  validateEntry(entry: Partial<ILedgerEntry>): void {
    this.validateRequiredFields(entry);
    this.validateIdentifiers(entry);
    this.validateAmount(entry);
    this.validateCurrency(entry);
    this.validateEnums(entry);
  }

  /**
   * Validate multiple ledger entries.
   */
  validateEntries(entries: Partial<ILedgerEntry>[]): void {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error("At least one ledger entry is required.");
    }

    for (const entry of entries) {
      this.validateEntry(entry);
    }
  }

  private validateRequiredFields(entry: Partial<ILedgerEntry>): void {
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

  private validateIdentifiers(entry: Partial<ILedgerEntry>): void {
    const ids = [
      entry.bookingId,
      entry.paymentId,
      entry.refundId,
      entry.payoutId,
      entry.settlementId,
      entry.userId,
    ];

    for (const id of ids) {
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ObjectId: ${id}`);
      }
    }
  }

  private validateAmount(entry: Partial<ILedgerEntry>): void {
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

  private validateCurrency(entry: Partial<ILedgerEntry>): void {
    if (typeof entry.currency !== "string") {
      throw new Error("Currency must be a string.");
    }

    if (entry.currency.trim().length !== 3) {
      throw new Error("Currency must be a valid ISO-4217 code.");
    }
  }

  private validateEnums(entry: Partial<ILedgerEntry>): void {
    if (
      !Object.values(LedgerEntryType).includes(entry.type as LedgerEntryType)
    ) {
      throw new Error("Invalid ledger entry type.");
    }

    if (!Object.values(LedgerSource).includes(entry.source as LedgerSource)) {
      throw new Error("Invalid ledger source.");
    }

    if (
      !Object.values(MoneyDirection).includes(entry.direction as MoneyDirection)
    ) {
      throw new Error("Invalid money direction.");
    }
  }
}

export const ledgerValidationService = new LedgerValidationService();
