import mongoose from "mongoose";

import { IWithdrawal } from "../../models/withdrawal.model";
import { withdrawalRepository } from "../../repositories/withdrawal.repository";
import { Money } from "../../types/financial/money.type";
import { isValidMoney } from "../../utils/financial/money.util";
import {
  isValidIdempotencyKey,
  normalizeIdempotencyKey,
} from "../../utils/financial/idempotency.util";
import { generateFinancialReference } from "../../utils/financial/reference.util";
import { WithdrawalError } from "../../errors/financial/WithdrawalError";
import { WithdrawalStatus } from "../../enums/financial/withdrawalStatus.enum";
import { creatorBalanceService } from "./creatorBalance.service";
import { payoutDestinationService } from "./payoutDestination.service";
import { ledgerService } from "./ledger.service";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { withdrawalCreatorBalanceProjectionOperationRepository as projectionOperations } from "../../repositories/withdrawalCreatorBalanceProjectionOperation.repository";
import { WithdrawalProjectionOperationType } from "../../enums/financial/withdrawalProjectionOperationType.enum";
import { createFinancialAudit } from "../auditLog.service";
import { AuditAction } from "../../enums/financial/auditAction.enum";
import { withdrawalEligibilityService } from "./withdrawalEligibility.service";

export interface RequestWithdrawalInput {
  creatorId: string;
  amount: Money;
  idempotencyKey: string;
  destinationReference: string;
  attributes?: Record<string, unknown>;
}

export class WithdrawalService {
  constructor(
    private readonly repository = withdrawalRepository,
    private readonly balances = creatorBalanceService,
  ) {}

  private validateInput(input: RequestWithdrawalInput): void {
    if (!mongoose.Types.ObjectId.isValid(input.creatorId)) {
      throw new WithdrawalError("Invalid creator id.");
    }

    if (!isValidMoney(input.amount)) {
      throw new WithdrawalError("Invalid withdrawal amount.");
    }

    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      throw new WithdrawalError("Invalid idempotency key.");
    }
    if (typeof input.destinationReference !== "string" || !input.destinationReference.trim()) {
      throw new WithdrawalError("Invalid payout destination reference.");
    }
  }

  private ensureSameRequest(
    withdrawal: IWithdrawal,
    input: RequestWithdrawalInput,
  ): void {
    if (
      withdrawal.creatorId.toString() !== input.creatorId ||
      withdrawal.amount !== input.amount.amount ||
      withdrawal.currency !== input.amount.currency
      || !withdrawal.destinationSnapshot
      || withdrawal.destinationSnapshot.destinationReference !== input.destinationReference
    ) {
      throw new WithdrawalError(
        "Idempotency key conflicts with an existing withdrawal request.",
        "WITHDRAWAL_IDEMPOTENCY_CONFLICT",
      );
    }

    if (
      withdrawal.status !== WithdrawalStatus.RESERVED &&
      withdrawal.status !== WithdrawalStatus.PROCESSING &&
      withdrawal.status !== WithdrawalStatus.COMPLETED &&
      withdrawal.status !== WithdrawalStatus.FAILED
    ) {
      throw new WithdrawalError(
        "Existing withdrawal is not in the reserved state.",
        "WITHDRAWAL_INVALID_STATE",
      );
    }
  }

  async requestWithdrawal(
    input: RequestWithdrawalInput,
  ): Promise<IWithdrawal> {
    this.validateInput(input);

    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    const normalizedInput = { ...input, idempotencyKey };

    const existing = await this.repository.findByIdempotencyKey(
      idempotencyKey,
    );

    if (existing) {
      this.ensureSameRequest(existing, normalizedInput);
      return existing;
    }
    const eligibility = await withdrawalEligibilityService.evaluate({
      creatorId: input.creatorId,
      amount: input.amount,
      destinationReference: input.destinationReference,
    });
    if (!eligibility.allowed) {
      throw new WithdrawalError(
        "Withdrawal is not currently eligible.",
        `WITHDRAWAL_ELIGIBILITY_${eligibility.reason}`,
      );
    }
    const active = await this.repository.findActiveByCreator(input.creatorId);
    if (active) throw new WithdrawalError("Creator already has an active withdrawal.", "ACTIVE_WITHDRAWAL_ALREADY_EXISTS");

    const session = await mongoose.startSession();
    let reservedWithdrawal: IWithdrawal | null = null;

    try {
      await session.withTransaction(async () => {
        const existingInTransaction =
          await this.repository.findByIdempotencyKey(idempotencyKey, session);

        if (existingInTransaction) {
          this.ensureSameRequest(existingInTransaction, normalizedInput);
          reservedWithdrawal = existingInTransaction;
          return;
        }
        const activeInTransaction = await this.repository.findActiveByCreator(input.creatorId, session);
        if (activeInTransaction) throw new WithdrawalError("Creator already has an active withdrawal.", "ACTIVE_WITHDRAWAL_ALREADY_EXISTS");

        const withdrawalReference = generateFinancialReference("WITHDRAWAL");

        const binding = await payoutDestinationService.createWithdrawalBindingSnapshot({
          creatorId: input.creatorId,
          destinationReference: input.destinationReference,
          withdrawalReference,
          session,
        });

        const withdrawal = await this.repository.create(
          {
            withdrawalReference,
            creatorId: new mongoose.Types.ObjectId(input.creatorId),
            amount: input.amount.amount,
            currency: input.amount.currency,
            status: WithdrawalStatus.REQUESTED,
            idempotencyKey,
            payoutDestinationId: binding.payoutDestinationId,
            destinationSnapshot: binding.snapshot,
            requestedAt: new Date(),
            attributes: input.attributes ?? {},
            isActiveObligation: true,
          },
          session,
        );

        await this.balances.reserveAvailableBalance(
          {
            creatorId: input.creatorId,
            money: input.amount,
          },
          session,
        );

        const reserveTx = `withdrawal:${withdrawalReference}:reserve`;
        await ledgerService.createDebit({ type: LedgerEntryType.PAYOUT, source: LedgerSource.PAYOUT, account: LedgerAccount.CREATOR_AVAILABLE, postingKey: `${reserveTx}:available-debit`, transactionId: reserveTx, userId: input.creatorId, money: input.amount, description: "Creator withdrawal reservation" }, session);
        await ledgerService.createCredit({ type: LedgerEntryType.PAYOUT, source: LedgerSource.PAYOUT, account: LedgerAccount.CREATOR_PAYOUT_RESERVED, postingKey: `${reserveTx}:reserved-credit`, transactionId: reserveTx, userId: input.creatorId, money: input.amount, description: "Creator withdrawal reservation" }, session);
        await projectionOperations.create({ creatorId: new mongoose.Types.ObjectId(input.creatorId), withdrawalId: withdrawal._id, operationReference: `withdrawal:${withdrawalReference}:projection:reserve`, operationType: WithdrawalProjectionOperationType.RESERVE, amount: input.amount.amount, currency: input.amount.currency, sourceReference: withdrawalReference, ledgerTransactionReference: reserveTx, appliedAt: new Date() }, session);

        const reserved = await this.repository.updateById(
          withdrawal._id.toString(),
          {
            status: WithdrawalStatus.RESERVED,
            reservedAt: new Date(),
          },
          session,
        );

        if (!reserved) {
          throw new WithdrawalError("Failed to reserve withdrawal.");
        }

        await createFinancialAudit({ action: AuditAction.WITHDRAWAL_FUNDS_RESERVED, actor: { type: "CREATOR", id: new mongoose.Types.ObjectId(input.creatorId) }, entityType: "WITHDRAWAL", entityId: reserved._id, financialContext: { domain: "WITHDRAWAL", primaryReference: reserved.withdrawalReference, withdrawalReference: reserved.withdrawalReference, amount: reserved.amount, currency: reserved.currency, ledgerTransactionReference: reserveTx, projectionOperationReference: `withdrawal:${withdrawalReference}:projection:reserve` }, transition: { fromStatus: WithdrawalStatus.REQUESTED, toStatus: WithdrawalStatus.RESERVED, outcome: "SUCCEEDED" }, session });

        reservedWithdrawal = reserved;
      });

      if (!reservedWithdrawal) {
        throw new WithdrawalError("Failed to reserve withdrawal.");
      }

      return reservedWithdrawal;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        const concurrent = await this.repository.findByIdempotencyKey(
          idempotencyKey,
        );

        if (concurrent) {
          this.ensureSameRequest(concurrent, normalizedInput);
          return concurrent;
        }
      }

      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getWithdrawal(
    withdrawalId: string,
    session?: mongoose.ClientSession,
  ): Promise<IWithdrawal> {
    if (!mongoose.Types.ObjectId.isValid(withdrawalId)) {
      throw new WithdrawalError("Invalid withdrawal id.");
    }

    const withdrawal = await this.repository.findById(withdrawalId, session);

    if (!withdrawal) {
      throw new WithdrawalError("Withdrawal not found.");
    }

    return withdrawal;
  }

  async cancelWithdrawal(withdrawalId: string, creatorId: string, reason?: string): Promise<IWithdrawal> {
    const session = await mongoose.startSession(); let result: IWithdrawal | null = null;
    try { await session.withTransaction(async () => {
      const withdrawal = await this.getWithdrawal(withdrawalId, session);
      if (withdrawal.creatorId.toString() !== creatorId) throw new WithdrawalError("Withdrawal is not owned by this creator.", "WITHDRAWAL_NOT_OWNED");
      if ((withdrawal as any).cancelledAt) { result = withdrawal; return; }
      if (withdrawal.status !== WithdrawalStatus.RESERVED) throw new WithdrawalError("Withdrawal cannot be cancelled after payout processing begins.", "WITHDRAWAL_NOT_CANCELLABLE");
      const tx = `withdrawal:${withdrawal.withdrawalReference}:cancel`;
      await ledgerService.createDebit({ type: LedgerEntryType.PAYOUT, source: LedgerSource.PAYOUT, account: LedgerAccount.CREATOR_PAYOUT_RESERVED, postingKey: `${tx}:reserved-debit`, transactionId: tx, userId: creatorId, money: { amount: withdrawal.amount, currency: withdrawal.currency }, description: "Withdrawal cancellation release" }, session);
      await ledgerService.createCredit({ type: LedgerEntryType.PAYOUT, source: LedgerSource.PAYOUT, account: LedgerAccount.CREATOR_AVAILABLE, postingKey: `${tx}:available-credit`, transactionId: tx, userId: creatorId, money: { amount: withdrawal.amount, currency: withdrawal.currency }, description: "Withdrawal cancellation release" }, session);
      await this.balances.releaseReservedBalance({ creatorId, money: { amount: withdrawal.amount, currency: withdrawal.currency } }, session);
      await projectionOperations.create({ creatorId: new mongoose.Types.ObjectId(creatorId), withdrawalId: withdrawal._id, operationReference: `withdrawal:${withdrawal.withdrawalReference}:projection:cancel-release`, operationType: WithdrawalProjectionOperationType.CANCEL_RELEASE, amount: withdrawal.amount, currency: withdrawal.currency, sourceReference: withdrawal.withdrawalReference, ledgerTransactionReference: tx, appliedAt: new Date() }, session);
      const updated = await this.repository.updateById(withdrawalId, { status: WithdrawalStatus.CANCELLED, isActiveObligation: false, cancelledAt: new Date(), cancelledBy: new mongoose.Types.ObjectId(creatorId), cancellationReason: reason?.trim() }, session);
      if (!updated) throw new WithdrawalError("Withdrawal cancellation conflicted.");
      await createFinancialAudit({ action: AuditAction.WITHDRAWAL_CANCELLED, actor: { type: "CREATOR", id: new mongoose.Types.ObjectId(creatorId) }, entityType: "WITHDRAWAL", entityId: updated._id, financialContext: { domain: "WITHDRAWAL", primaryReference: updated.withdrawalReference, withdrawalReference: updated.withdrawalReference, amount: updated.amount, currency: updated.currency, ledgerTransactionReference: tx, projectionOperationReference: `withdrawal:${updated.withdrawalReference}:projection:cancel-release` }, transition: { fromStatus: WithdrawalStatus.RESERVED, toStatus: WithdrawalStatus.CANCELLED, outcome: "SUCCEEDED" }, session }); result = updated;
    }); } finally { await session.endSession(); }
    if (!result) throw new WithdrawalError("Withdrawal cancellation failed."); return result;
  }

  async markProcessing(
    withdrawalId: string,
    payoutId: string,
    session?: mongoose.ClientSession,
  ): Promise<IWithdrawal> {
    const withdrawal = await this.getWithdrawal(withdrawalId, session);

    if (withdrawal.status === WithdrawalStatus.PROCESSING) {
      if (!withdrawal.payoutId || withdrawal.payoutId.toString() !== payoutId) {
        throw new WithdrawalError(
          "Processing withdrawal has a conflicting payout relationship.",
          "WITHDRAWAL_PAYOUT_CONFLICT",
        );
      }

      return withdrawal;
    }

    if (withdrawal.status !== WithdrawalStatus.RESERVED) {
      throw new WithdrawalError(
        "Withdrawal must be reserved before payout initialization.",
        "WITHDRAWAL_INVALID_STATE",
      );
    }

    const updated = await this.repository.updateById(
      withdrawalId,
      {
        payoutId: new mongoose.Types.ObjectId(payoutId),
        status: WithdrawalStatus.PROCESSING,
        processingAt: new Date(),
      },
      session,
    );

    if (!updated) {
      throw new WithdrawalError("Failed to mark withdrawal as processing.");
    }

    return updated;
  }

  async linkPayout(
    withdrawalId: string,
    payoutId: string,
    session?: mongoose.ClientSession,
  ): Promise<IWithdrawal> {
    const withdrawal = await this.getWithdrawal(withdrawalId, session);

    if (
      withdrawal.payoutId &&
      withdrawal.payoutId.toString() !== payoutId
    ) {
      throw new WithdrawalError(
        "Withdrawal has a conflicting payout relationship.",
        "WITHDRAWAL_PAYOUT_CONFLICT",
      );
    }

    if (withdrawal.payoutId) {
      return withdrawal;
    }

    const updated = await this.repository.updateById(
      withdrawalId,
      { payoutId: new mongoose.Types.ObjectId(payoutId) },
      session,
    );

    if (!updated) {
      throw new WithdrawalError("Failed to link withdrawal payout.");
    }

    return updated;
  }

  async markCompleted(
    withdrawalId: string,
    session?: mongoose.ClientSession,
  ): Promise<IWithdrawal> {
    const withdrawal = await this.getWithdrawal(withdrawalId, session);

    if (withdrawal.status === WithdrawalStatus.COMPLETED) {
      return withdrawal;
    }

    if (withdrawal.status !== WithdrawalStatus.PROCESSING) {
      throw new WithdrawalError("Withdrawal must be processing before completion.");
    }

    const updated = await this.repository.updateById(
      withdrawalId,
      { status: WithdrawalStatus.COMPLETED, completedAt: new Date(), isActiveObligation: false },
      session,
    );

    if (!updated) {
      throw new WithdrawalError("Failed to complete withdrawal.");
    }

    return updated;
  }

  async markFailed(
    withdrawalId: string,
    failureReason?: string,
    session?: mongoose.ClientSession,
  ): Promise<IWithdrawal> {
    const withdrawal = await this.getWithdrawal(withdrawalId, session);

    if (withdrawal.status === WithdrawalStatus.FAILED) {
      return withdrawal;
    }

    if (withdrawal.status !== WithdrawalStatus.PROCESSING) {
      throw new WithdrawalError("Withdrawal must be processing before failure.");
    }

    const updated = await this.repository.updateById(
      withdrawalId,
      {
        status: WithdrawalStatus.FAILED,
        failedAt: new Date(),
        failureReason,
        isActiveObligation: false,
      },
      session,
    );

    if (!updated) {
      throw new WithdrawalError("Failed to fail withdrawal.");
    }

    return updated;
  }
}

export const withdrawalService = new WithdrawalService();
