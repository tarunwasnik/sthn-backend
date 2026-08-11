// backend/src/services/financial/ledger.service.ts

import mongoose from "mongoose";

import { ILedgerEntry } from "../../models/ledgerEntry.model";

import { ledgerEntryRepository } from "../../repositories/ledgerEntry.repository";

import { createMoney, isValidMoney } from "../../utils/financial/money.util";

import { generateFinancialReference } from "../../utils/financial/reference.util";

import { createIdempotencyFingerprint } from "../../utils/financial/idempotency.util";

import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";

import { Money } from "../../types/financial/money.type";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";

import { LedgerError } from "../../errors/financial/LedgerError";

export interface CreateLedgerEntryInput {
  type: LedgerEntryType;
  source: LedgerSource;
  direction: MoneyDirection;

  money: Money;

  transactionId: string;

  bookingId?: string;
  paymentId?: string;
  refundId?: string;
  payoutId?: string;
  settlementId?: string;

  userId?: string;
  walletId?: string;

  description?: string;

  metadata?: Record<string, unknown>;

  /**
   * Optional idempotency seed.
   * Used to prevent duplicate immutable entries.
   */
  idempotencyKey?: string;
  account?: LedgerAccount;
  /** Unique immutable posting identity where one economic operation has multiple entries. */
  postingKey?: string;
}

export interface LedgerSearchOptions {
  bookingId?: string;
  paymentId?: string;
  refundId?: string;
  payoutId?: string;
  settlementId?: string;

  userId?: string;

  type?: LedgerEntryType;
  source?: LedgerSource;
  direction?: MoneyDirection;
}

export class LedgerService {
  constructor(private readonly repository = ledgerEntryRepository) {}

  /* -------------------------------------------------------------------------- */
  /* Validation                                                                  */
  /* -------------------------------------------------------------------------- */

  private validateMoney(money: Money): void {
    if (!isValidMoney(money)) {
      throw new LedgerError("Invalid monetary value.");
    }
  }

  private validateObjectId(value: string | undefined, field: string): void {
    if (!value) {
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw new LedgerError(`${field} is invalid.`);
    }
  }

  private validateInput(input: CreateLedgerEntryInput): void {
    this.validateMoney(input.money);
    if (!input.transactionId?.trim()) {
      throw new LedgerError("Transaction ID is required.");
    }

    this.validateObjectId(input.bookingId, "bookingId");
    this.validateObjectId(input.paymentId, "paymentId");
    this.validateObjectId(input.refundId, "refundId");
    this.validateObjectId(input.payoutId, "payoutId");
    this.validateObjectId(input.settlementId, "settlementId");
    this.validateObjectId(input.userId, "userId");
    this.validateObjectId(input.walletId, "walletId");

    if (!input.type) {
      throw new LedgerError("Ledger type is required.");
    }

    if (!input.source) {
      throw new LedgerError("Ledger source is required.");
    }

    if (!input.direction) {
      throw new LedgerError("Ledger direction is required.");
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Helpers                                                                     */
  /* -------------------------------------------------------------------------- */

  private buildFingerprint(input: CreateLedgerEntryInput): string {
    return createIdempotencyFingerprint(
      input.bookingId,
      input.paymentId,
      input.refundId,
      input.payoutId,
      input.settlementId,

      input.userId,
      input.walletId,
      input.type,
      input.source,
      input.direction,
      input.money.amount,
      input.money.currency,
      input.idempotencyKey,
      input.account,
      input.postingKey,
    );
  }

  private async ensureNotDuplicate(
    input: CreateLedgerEntryInput,
    session?: mongoose.ClientSession,
  ): Promise<void> {
    const fingerprint = this.buildFingerprint(input);

    const exists = await this.repository.exists(
      { "metadata.fingerprint": fingerprint },
      session,
    );

    if (exists) {
      throw new LedgerError("Duplicate ledger transaction detected.");
    }
  }

  private buildDocument(input: CreateLedgerEntryInput): Partial<ILedgerEntry> {
    return {
      ledgerReference: generateFinancialReference("LEDGER"),
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
        ? new mongoose.Types.ObjectId(input.bookingId)
        : undefined,

      paymentId: input.paymentId
        ? new mongoose.Types.ObjectId(input.paymentId)
        : undefined,

      refundId: input.refundId
        ? new mongoose.Types.ObjectId(input.refundId)
        : undefined,

      payoutId: input.payoutId
        ? new mongoose.Types.ObjectId(input.payoutId)
        : undefined,

      settlementId: input.settlementId
        ? new mongoose.Types.ObjectId(input.settlementId)
        : undefined,

      userId: input.userId
        ? new mongoose.Types.ObjectId(input.userId)
        : undefined,

      walletId: input.walletId
        ? new mongoose.Types.ObjectId(input.walletId)
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

  async createEntry(
    input: CreateLedgerEntryInput,
    session?: mongoose.ClientSession,
  ): Promise<ILedgerEntry> {
    this.validateInput(input);

    await this.ensureNotDuplicate(input, session);

    return this.repository.create(this.buildDocument(input), session);
  }

  async createCredit(
    input: Omit<CreateLedgerEntryInput, "direction">,
    session?: mongoose.ClientSession,
  ): Promise<ILedgerEntry> {
    return this.createEntry({
      ...input,
      direction: MoneyDirection.CREDIT,
    }, session);
  }

  async createDebit(
    input: Omit<CreateLedgerEntryInput, "direction">,
    session?: mongoose.ClientSession,
  ): Promise<ILedgerEntry> {
    return this.createEntry({
      ...input,
      direction: MoneyDirection.DEBIT,
    }, session);
  }

  /* -------------------------------------------------------------------------- */
  /* Retrieval                                                                   */
  /* -------------------------------------------------------------------------- */

  async getById(id: string): Promise<ILedgerEntry> {
    this.validateObjectId(id, "ledgerId");

    const ledger = await this.repository.findById(id);

    if (!ledger) {
      throw new LedgerError("Ledger entry not found.");
    }

    return ledger;
  }

  async getByReference(ledgerReference: string): Promise<ILedgerEntry> {
    const ledger = await this.repository.findByLedgerReference(ledgerReference);

    if (!ledger) {
      throw new LedgerError("Ledger entry not found.");
    }

    return ledger;
  }

  async getByBooking(bookingId: string): Promise<ILedgerEntry[]> {
    this.validateObjectId(bookingId, "bookingId");

    return this.repository.findByBookingId(bookingId);
  }

  async getByPayment(paymentId: string): Promise<ILedgerEntry[]> {
    this.validateObjectId(paymentId, "paymentId");

    return this.repository.findByPaymentId(paymentId);
  }

  async getByRefund(refundId: string): Promise<ILedgerEntry[]> {
    this.validateObjectId(refundId, "refundId");

    return this.repository.findByRefundId(refundId);
  }

  async getBySettlement(settlementId: string): Promise<ILedgerEntry[]> {
    this.validateObjectId(settlementId, "settlementId");

    return this.repository.findBySettlementId(settlementId);
  }

  async getByPayout(payoutId: string): Promise<ILedgerEntry[]> {
    this.validateObjectId(payoutId, "payoutId");

    return this.repository.findByPayoutId(payoutId);
  }

  async getByUser(userId: string): Promise<ILedgerEntry[]> {
    this.validateObjectId(userId, "userId");

    return this.repository.findByUserId(userId);
  }

  async search(options: LedgerSearchOptions): Promise<ILedgerEntry[]> {
    const filter: Record<string, unknown> = {};

    if (options.bookingId) filter.bookingId = options.bookingId;

    if (options.paymentId) filter.paymentId = options.paymentId;

    if (options.refundId) filter.refundId = options.refundId;

    if (options.payoutId) filter.payoutId = options.payoutId;

    if (options.settlementId) filter.settlementId = options.settlementId;

    if (options.userId) filter.userId = options.userId;

    if (options.type) filter.type = options.type;

    if (options.source) filter.source = options.source;

    if (options.direction) filter.direction = options.direction;

    return this.repository.findMany(filter);
  }

  /* -------------------------------------------------------------------------- */
  /* Money Helpers                                                               */
  /* -------------------------------------------------------------------------- */

  async calculateUserBalance(
    userId: string,
    currency: SupportedCurrency,
  ): Promise<Money> {
    const entries = await this.getByUser(userId);

    let total = 0;

    for (const entry of entries) {
      if (entry.currency !== currency) {
        continue;
      }

      if (entry.direction === MoneyDirection.CREDIT) {
        total += entry.amount;
      } else {
        total -= entry.amount;
      }
    }

    return createMoney(total, currency);
  }

  /* -------------------------------------------------------------------------- */
  /* Integrity                                                                   */
  /* -------------------------------------------------------------------------- */

  async ledgerReferenceExists(ledgerReference: string): Promise<boolean> {
    return this.repository.exists({
      ledgerReference,
    });
  }

  async verifyIntegrity(ledgerId: string): Promise<boolean> {
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

    if (
      ledger.direction !== MoneyDirection.CREDIT &&
      ledger.direction !== MoneyDirection.DEBIT
    ) {
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

  async verifyBookingLedger(bookingId: string): Promise<boolean> {
    const entries = await this.getByBooking(bookingId);

    return entries.every((entry) => entry.amount >= 0);
  }

  async verifyPaymentLedger(paymentId: string): Promise<boolean> {
    const entries = await this.getByPayment(paymentId);

    return entries.every((entry) => entry.amount >= 0);
  }

  async verifyRefundLedger(refundId: string): Promise<boolean> {
    const entries = await this.getByRefund(refundId);

    return entries.every((entry) => entry.amount >= 0);
  }

  async verifySettlementLedger(settlementId: string): Promise<boolean> {
    const entries = await this.getBySettlement(settlementId);

    return entries.every((entry) => entry.amount >= 0);
  }

  async verifyPayoutLedger(payoutId: string): Promise<boolean> {
    const entries = await this.getByPayout(payoutId);

    return entries.every((entry) => entry.amount >= 0);
  }

  /* -------------------------------------------------------------------------- */
  /* Audit                                                                       */
  /* -------------------------------------------------------------------------- */

  async countEntries(): Promise<number> {
    return this.repository.count();
  }

  async countUserEntries(userId: string): Promise<number> {
    const entries = await this.getByUser(userId);

    return entries.length;
  }

  async findOne(filter: Record<string, unknown>): Promise<ILedgerEntry | null> {
    return this.repository.findOne(filter);
  }

  async exists(filter: Record<string, unknown>): Promise<boolean> {
    return this.repository.exists(filter);
  }
  /* -------------------------------------------------------------------------- */
  /* Convenience APIs                                                            */
  /* -------------------------------------------------------------------------- */

  async getLatestBookingEntry(bookingId: string): Promise<ILedgerEntry | null> {
    const entries = await this.getByBooking(bookingId);

    return entries[0] ?? null;
  }

  async getLatestPaymentEntry(paymentId: string): Promise<ILedgerEntry | null> {
    const entries = await this.getByPayment(paymentId);

    return entries[0] ?? null;
  }

  async getLatestRefundEntry(refundId: string): Promise<ILedgerEntry | null> {
    const entries = await this.getByRefund(refundId);

    return entries[0] ?? null;
  }

  async getLatestSettlementEntry(
    settlementId: string,
  ): Promise<ILedgerEntry | null> {
    const entries = await this.getBySettlement(settlementId);

    return entries[0] ?? null;
  }

  async getLatestPayoutEntry(payoutId: string): Promise<ILedgerEntry | null> {
    const entries = await this.getByPayout(payoutId);

    return entries[0] ?? null;
  }

  async getLatestUserEntry(userId: string): Promise<ILedgerEntry | null> {
    const entries = await this.getByUser(userId);

    return entries[0] ?? null;
  }

  /* -------------------------------------------------------------------------- */
  /* Generic Queries                                                             */
  /* -------------------------------------------------------------------------- */

  async getCreditsForUser(userId: string): Promise<ILedgerEntry[]> {
    return this.repository.findMany({
      userId,
      direction: MoneyDirection.CREDIT,
    });
  }

  async getDebitsForUser(userId: string): Promise<ILedgerEntry[]> {
    return this.repository.findMany({
      userId,
      direction: MoneyDirection.DEBIT,
    });
  }

  async getCreditsByType(type: LedgerEntryType): Promise<ILedgerEntry[]> {
    return this.repository.findMany({
      type,
      direction: MoneyDirection.CREDIT,
    });
  }

  async getDebitsByType(type: LedgerEntryType): Promise<ILedgerEntry[]> {
    return this.repository.findMany({
      type,
      direction: MoneyDirection.DEBIT,
    });
  }

  async getBySource(source: LedgerSource): Promise<ILedgerEntry[]> {
    return this.repository.findMany({
      source,
    });
  }

  async getByType(type: LedgerEntryType): Promise<ILedgerEntry[]> {
    return this.repository.findMany({
      type,
    });
  }

  async getByDirection(direction: MoneyDirection): Promise<ILedgerEntry[]> {
    return this.repository.findMany({
      direction,
    });
  }

  async getUserEntriesByType(
    userId: string,
    type: LedgerEntryType,
  ): Promise<ILedgerEntry[]> {
    return this.repository.findMany({
      userId,
      type,
    });
  }

  async getUserEntriesBySource(
    userId: string,
    source: LedgerSource,
  ): Promise<ILedgerEntry[]> {
    return this.repository.findMany({
      userId,
      source,
    });
  }
  /* -------------------------------------------------------------------------- */
  /* Audit / Reporting                                                           */
  /* -------------------------------------------------------------------------- */

  async getBookingLedgerTotal(
    bookingId: string,
    currency: SupportedCurrency,
  ): Promise<Money> {
    const entries = await this.getByBooking(bookingId);

    let balance = 0;

    for (const entry of entries) {
      if (entry.currency !== currency) continue;

      balance +=
        entry.direction === MoneyDirection.CREDIT
          ? entry.amount
          : -entry.amount;
    }

    return createMoney(balance, currency);
  }

  async getPaymentLedgerTotal(
    paymentId: string,
    currency: SupportedCurrency,
  ): Promise<Money> {
    const entries = await this.getByPayment(paymentId);

    let balance = 0;

    for (const entry of entries) {
      if (entry.currency !== currency) continue;

      balance +=
        entry.direction === MoneyDirection.CREDIT
          ? entry.amount
          : -entry.amount;
    }

    return createMoney(balance, currency);
  }

  async getRefundLedgerTotal(
    refundId: string,
    currency: SupportedCurrency,
  ): Promise<Money> {
    const entries = await this.getByRefund(refundId);

    let balance = 0;

    for (const entry of entries) {
      if (entry.currency !== currency) continue;

      balance +=
        entry.direction === MoneyDirection.CREDIT
          ? entry.amount
          : -entry.amount;
    }

    return createMoney(balance, currency);
  }

  async getUserLedgerTotal(
    userId: string,
    currency: SupportedCurrency,
  ): Promise<Money> {
    return this.calculateUserBalance(userId, currency);
  }

  async hasBookingLedger(bookingId: string): Promise<boolean> {
    return this.repository.exists({
      bookingId,
    });
  }

  async hasPaymentLedger(paymentId: string): Promise<boolean> {
    return this.repository.exists({
      paymentId,
    });
  }

  async hasRefundLedger(refundId: string): Promise<boolean> {
    return this.repository.exists({
      refundId,
    });
  }

  async hasSettlementLedger(settlementId: string): Promise<boolean> {
    return this.repository.exists({
      settlementId,
    });
  }

  async hasPayoutLedger(payoutId: string): Promise<boolean> {
    return this.repository.exists({
      payoutId,
    });
  }

  async hasUserLedger(userId: string): Promise<boolean> {
    return this.repository.exists({
      userId,
    });
  }
}

export const ledgerService = new LedgerService();
