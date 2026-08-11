// backend/src/services/ledger/ledgerEntryFactory.service.ts

import mongoose from "mongoose";

import { ILedgerEntry } from "../../models/ledgerEntry.model";

import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";

import { Money } from "../../types/financial/money.type";

import {
  createIdempotencyFingerprint,
  generateIdempotencyKey,
} from "../../utils/financial/idempotency.util";

import { generateFinancialReference } from "../../utils/financial/reference.util";

export interface CreateLedgerEntryInput {
  /**
   * Financial transaction identifier.
   * Shared across all ledger entries that belong
   * to the same financial transaction.
   */
  transactionId: string;

  /**
   * Ledger classification.
   */
  type: LedgerEntryType;

  /**
   * Originating financial component.
   */
  source: LedgerSource;

  /**
   * Credit or debit.
   */
  direction: MoneyDirection;

  /**
   * Monetary value.
   */
  money: Money;

  bookingId?: string;
  paymentId?: string;
  refundId?: string;
  payoutId?: string;
  settlementId?: string;

  /**
   * Marketplace user.
   */
  userId?: string;

  /**
   * Optional description.
   */
  description?: string;

  /**
   * Immutable audit metadata.
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional external idempotency key.
   */
  idempotencyKey?: string;
}

export interface CreateLedgerEntriesInput {
  entries: CreateLedgerEntryInput[];
}

export class LedgerEntryFactoryService {
  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                     */
  /* -------------------------------------------------------------------------- */

  private toObjectId(value?: string): mongoose.Types.ObjectId | undefined {
    if (!value) {
      return undefined;
    }

    return new mongoose.Types.ObjectId(value);
  }

  private buildMetadata(
    input: CreateLedgerEntryInput,
    idempotencyKey: string,
  ): Record<string, unknown> {
    const fingerprint = createIdempotencyFingerprint(
      input.transactionId,
      input.bookingId,
      input.paymentId,
      input.refundId,
      input.payoutId,
      input.settlementId,
      input.userId,
      input.type,
      input.source,
      input.direction,
      input.money.amount,
      input.money.currency,
      idempotencyKey,
    );

    return {
      ...(input.metadata ?? {}),
      fingerprint,
      idempotencyKey,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildBaseEntry(input: CreateLedgerEntryInput): Partial<ILedgerEntry> {
    const idempotencyKey = input.idempotencyKey ?? generateIdempotencyKey();
    return {
      ledgerReference: generateFinancialReference("LEDGER"),

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

  private validateInput(input: CreateLedgerEntryInput): void {
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

    if (
      typeof input.money.amount !== "number" ||
      !Number.isFinite(input.money.amount)
    ) {
      throw new Error("Invalid money amount.");
    }

    if (input.money.amount < 0) {
      throw new Error("Money amount cannot be negative.");
    }

    if (
      typeof input.money.currency !== "string" ||
      input.money.currency.trim().length !== 3
    ) {
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
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ObjectId: ${id}`);
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Factory                                                                     */
  /* -------------------------------------------------------------------------- */

  createEntry(input: CreateLedgerEntryInput): Partial<ILedgerEntry> {
    this.validateInput(input);

    return this.buildBaseEntry(input);
  }

  createEntries(input: CreateLedgerEntriesInput): Partial<ILedgerEntry>[] {
    if (!Array.isArray(input.entries) || input.entries.length === 0) {
      throw new Error("At least one ledger entry is required.");
    }

    return input.entries.map((entry) => this.createEntry(entry));
  }
}

export const ledgerEntryFactoryService = new LedgerEntryFactoryService();
