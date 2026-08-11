import mongoose from "mongoose";
import crypto from "crypto";

import { IPayout } from "../../models/payout.model";
import { IWithdrawal } from "../../models/withdrawal.model";
import { PayoutSourceType } from "../../enums/financial/payoutSourceType.enum";
import { PayoutStatus } from "../../enums/financial/payoutStatus.enum";
import { WithdrawalStatus } from "../../enums/financial/withdrawalStatus.enum";
import { PayoutError } from "../../errors/financial/PayoutError";
import { payoutRepository } from "../../repositories/payout.repository";
import { payoutService } from "./payout.service";
import { payoutProviderRegistry } from "./payoutProviderRegistry.service";
import { withdrawalService } from "./withdrawal.service";
import { creatorBalanceService } from "./creatorBalance.service";
import { ledgerService } from "./ledger.service";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { PayoutProviderResult } from "../../contracts/financial/payoutProvider.types";
import { withdrawalDestinationExecutionService } from "./withdrawalDestinationExecution.service";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { withdrawalCreatorBalanceProjectionOperationRepository as projectionOperations } from "../../repositories/withdrawalCreatorBalanceProjectionOperation.repository";
import { WithdrawalProjectionOperationType } from "../../enums/financial/withdrawalProjectionOperationType.enum";
import { createFinancialAudit } from "../auditLog.service";
import { AuditAction } from "../../enums/financial/auditAction.enum";
import { payoutDestinationCryptoService } from "../security/payoutDestinationCrypto.service";
import { PayoutExecutionDestinationCommand } from "../../contracts/financial/payoutProvider.types";

export class WithdrawalPayoutLifecycleService {
  constructor(
    private readonly payouts = payoutService,
    private readonly withdrawals = withdrawalService,
    private readonly repository = payoutRepository,
    private readonly balances = creatorBalanceService,
    private readonly ledger = ledgerService,
  ) {}
  private async auditSafely(params: Parameters<typeof createFinancialAudit>[0]) { try { await createFinancialAudit(params); } catch (error) { console.error("Financial audit write failed", error); } }

  async initializeReservedWithdrawalPayout(withdrawalId: string): Promise<{
    withdrawal: IWithdrawal;
    payout: IPayout;
  }> {
    const preparation = await this.preparePayout(withdrawalId);

    await this.auditSafely({ action: AuditAction.PAYOUT_PROCESS_REQUESTED, actor: { type: "SYSTEM", reference: "withdrawal-payout-lifecycle" }, entityType: "PAYOUT", entityId: preparation.payout._id, financialContext: { domain: "PAYOUT", primaryReference: preparation.payout.payoutReference, payoutReference: preparation.payout.payoutReference, withdrawalReference: preparation.withdrawal.withdrawalReference, amount: preparation.withdrawal.amount, currency: preparation.withdrawal.currency, provider: preparation.payout.provider }, transition: { outcome: "PROCESSING" } });

    if (
      preparation.withdrawal.status === WithdrawalStatus.PROCESSING &&
      preparation.payout.status === PayoutStatus.PROCESSING &&
      preparation.payout.providerPayoutId
    ) {
      return preparation;
    }

    const provider = payoutProviderRegistry.get(preparation.payout.provider);
    const destination = await withdrawalDestinationExecutionService.getExecutionDestination(
      withdrawalId,
    );
    const providerResponse = await provider.initializePayout({
      payoutId: preparation.payout._id.toString(),
      payoutReference: preparation.payout.payoutReference,
      withdrawalReference: preparation.withdrawal.withdrawalReference,
      creatorId: preparation.withdrawal.creatorId.toString(),
      amount: {
        amount: preparation.withdrawal.amount,
        currency: preparation.withdrawal.currency,
      },
      provider: preparation.payout.provider,
      idempotencyKey: preparation.payout.idempotencyKey,
      destination,
    });
    this.verifyProviderInitializationIdentity(
      preparation.withdrawal,
      preparation.payout,
      destination,
      providerResponse,
    );
    await this.auditSafely({ action: AuditAction.PAYOUT_PROVIDER_REQUESTED, actor: { type: "PROVIDER", reference: preparation.payout.provider }, entityType: "PAYOUT", entityId: preparation.payout._id, financialContext: { domain: "PAYOUT", primaryReference: preparation.payout.payoutReference, payoutReference: preparation.payout.payoutReference, withdrawalReference: preparation.withdrawal.withdrawalReference, amount: preparation.withdrawal.amount, currency: preparation.withdrawal.currency, provider: preparation.payout.provider, providerReference: providerResponse.providerPayoutId }, transition: { outcome: "PROCESSING" } });

    return this.synchronizeProviderInitialization(
      withdrawalId,
      preparation.payout._id.toString(),
      providerResponse,
    );
  }

  private verifyProviderInitializationIdentity(
    withdrawal: IWithdrawal,
    payout: IPayout,
    destination: PayoutExecutionDestinationCommand,
    response: { providerPayoutId: string; initializationIdentity: { providerPayoutId: string; payoutId: string; withdrawalReference: string; amount: { amount: number; currency: string }; destinationSnapshotVersion: 1; destinationReference: string; destinationFingerprint: string } },
  ): void {
    const identity = response.initializationIdentity;
    const expectedFingerprint = this.destinationFingerprint(destination);
    if (
      !identity ||
      response.providerPayoutId !== identity.providerPayoutId ||
      !identity.providerPayoutId ||
      identity.payoutId !== payout._id.toString() ||
      identity.withdrawalReference !== withdrawal.withdrawalReference ||
      identity.amount.amount !== withdrawal.amount ||
      identity.amount.currency !== withdrawal.currency ||
      identity.destinationSnapshotVersion !== destination.snapshotVersion ||
      identity.destinationReference !== destination.destinationReference ||
      !this.fingerprintsEqual(identity.destinationFingerprint, expectedFingerprint)
    ) {
      throw new PayoutError(
        "Provider payout initialization identity conflicts with the withdrawal.",
        "PROVIDER_PAYOUT_INITIALIZATION_IDENTITY_CONFLICT",
      );
    }
  }

  private destinationFingerprint(destination: PayoutExecutionDestinationCommand): string {
    if (destination.type === "BANK_ACCOUNT") {
      const execution = destination.executionDestination;
      return payoutDestinationCryptoService.createInternalPayoutDestinationFingerprint(
        JSON.stringify({ type: execution.type, accountHolderName: execution.accountHolderName, accountNumber: execution.accountNumber, ifsc: execution.ifsc }),
      );
    }
    const execution = destination.executionDestination;
    return payoutDestinationCryptoService.createInternalPayoutDestinationFingerprint(
      JSON.stringify({ type: execution.type, upiId: execution.upiId }),
    );
  }

  private fingerprintsEqual(first: string, second: string): boolean {
    const left = Buffer.from(first, "utf8");
    const right = Buffer.from(second, "utf8");
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  async processInitializedWithdrawalPayout(withdrawalId: string): Promise<{
    withdrawal: IWithdrawal;
    payout: IPayout;
  }> {
    const current = await this.getProcessingRelationship(withdrawalId);

    if (
      current.withdrawal.status === WithdrawalStatus.COMPLETED ||
      current.withdrawal.status === WithdrawalStatus.FAILED
    ) {
      return current;
    }

    if (!current.payout.providerPayoutId) {
      throw new PayoutError("Payout provider initialization is incomplete.");
    }

    const provider = payoutProviderRegistry.get(current.payout.provider);
    const result = await provider.getPayoutResult({
      payoutId: current.payout._id.toString(),
      providerPayoutId: current.payout.providerPayoutId,
    });

    this.validateProviderResult(current.payout, result);

    if (!result.terminal) {
      await this.auditSafely({ action: AuditAction.PAYOUT_OUTCOME_UNKNOWN, actor: { type: "PROVIDER", reference: current.payout.provider }, entityType: "PAYOUT", entityId: current.payout._id, financialContext: { domain: "PAYOUT", primaryReference: current.payout.payoutReference, payoutReference: current.payout.payoutReference, withdrawalReference: current.withdrawal.withdrawalReference, amount: current.withdrawal.amount, currency: current.withdrawal.currency, provider: current.payout.provider, providerReference: current.payout.providerPayoutId }, transition: { fromStatus: current.payout.status, toStatus: current.payout.status, outcome: "UNKNOWN" } });
      return current;
    }

    if (result.outcome === "COMPLETED") {
      return this.finalizeSuccess(withdrawalId, result);
    }

    return this.finalizeFailure(withdrawalId, result);
  }

  private async getProcessingRelationship(withdrawalId: string): Promise<{
    withdrawal: IWithdrawal;
    payout: IPayout;
  }> {
    const withdrawal = await this.withdrawals.getWithdrawal(withdrawalId);

    if (!withdrawal.payoutId) {
      throw new PayoutError("Withdrawal payout relationship is missing.");
    }

    const payout = await this.repository.findById(withdrawal.payoutId.toString());

    if (
      !payout ||
      payout.sourceType !== PayoutSourceType.WITHDRAWAL ||
      !payout.withdrawalId ||
      payout.withdrawalId.toString() !== withdrawalId
    ) {
      throw new PayoutError("Withdrawal has a conflicting payout relationship.");
    }

    if (
      withdrawal.status !== WithdrawalStatus.PROCESSING &&
      withdrawal.status !== WithdrawalStatus.COMPLETED &&
      withdrawal.status !== WithdrawalStatus.FAILED
    ) {
      throw new PayoutError("Withdrawal must be processing before terminal payout processing.");
    }

    return { withdrawal, payout };
  }

  private validateProviderResult(
    payout: IPayout,
    result: PayoutProviderResult,
  ): void {
    if (result.providerPayoutId !== payout.providerPayoutId) {
      throw new PayoutError("Provider payout identifier conflicts with payout.");
    }

    if (
      result.amount.amount !== payout.amount ||
      result.amount.currency !== payout.currency
    ) {
      throw new PayoutError("Provider payout amount or currency conflicts with payout.");
    }
  }

  private async finalizeSuccess(
    withdrawalId: string,
    result: Extract<PayoutProviderResult, { outcome: "COMPLETED" }>,
  ): Promise<{ withdrawal: IWithdrawal; payout: IPayout }> {
    const session = await mongoose.startSession();
    let finalized: { withdrawal: IWithdrawal; payout: IPayout } | null = null;

    try {
      await session.withTransaction(async () => {
        const current = await this.getProcessingRelationshipInSession(
          withdrawalId,
          session,
        );

        if (current.withdrawal.status === WithdrawalStatus.COMPLETED) {
          await createFinancialAudit({ action: AuditAction.PAYOUT_REPLAY_DETECTED, actor: { type: "SYSTEM", reference: "withdrawal-payout-lifecycle" }, entityType: "PAYOUT", entityId: current.payout._id, financialContext: { domain: "PAYOUT", primaryReference: current.payout.payoutReference, payoutReference: current.payout.payoutReference, withdrawalReference: current.withdrawal.withdrawalReference, amount: current.withdrawal.amount, currency: current.withdrawal.currency, provider: current.payout.provider, providerReference: current.payout.providerPayoutId }, transition: { outcome: "REPLAYED" }, session });
          finalized = current;
          return;
        }

        const payoutTx = `withdrawal:${current.withdrawal.withdrawalReference}:paid`;
        await this.ledger.createDebit(
          {
            payoutId: current.payout._id.toString(),
            userId: current.withdrawal.creatorId.toString(),
            transactionId: payoutTx,
            account: LedgerAccount.CREATOR_PAYOUT_RESERVED,
            postingKey: `${payoutTx}:reserved-debit`,
            money: {
              amount: current.withdrawal.amount,
              currency: current.withdrawal.currency,
            },
            type: LedgerEntryType.PAYOUT,
            source: LedgerSource.PAYOUT,
            description: "Creator withdrawal payout completed",
            idempotencyKey: payoutTx,
          },
          session,
        );
        await this.ledger.createCredit({ payoutId: current.payout._id.toString(), userId: current.withdrawal.creatorId.toString(), transactionId: payoutTx, account: LedgerAccount.PAYOUT_CLEARING, postingKey: `${payoutTx}:clearing-credit`, money: { amount: current.withdrawal.amount, currency: current.withdrawal.currency }, type: LedgerEntryType.PAYOUT, source: LedgerSource.PAYOUT, description: "Creator withdrawal payout cleared", idempotencyKey: payoutTx }, session);

        await this.balances.consumeReservedBalance(
          {
            creatorId: current.withdrawal.creatorId.toString(),
            money: {
              amount: current.withdrawal.amount,
              currency: current.withdrawal.currency,
            },
          },
          session,
        );
        await projectionOperations.create({ creatorId: current.withdrawal.creatorId, withdrawalId: current.withdrawal._id, operationReference: `withdrawal:${current.withdrawal.withdrawalReference}:projection:paid`, operationType: WithdrawalProjectionOperationType.PAYOUT_COMPLETE, amount: current.withdrawal.amount, currency: current.withdrawal.currency, sourceReference: current.withdrawal.withdrawalReference, ledgerTransactionReference: payoutTx, appliedAt: new Date() }, session);

        const payout = await this.repository.updateById(
          current.payout._id.toString(),
          {
            status: PayoutStatus.COMPLETED,
            completedAt: result.completedAt ?? new Date(),
            providerPayload: result.payload ?? {},
          },
          session,
        );

        if (!payout) {
          throw new PayoutError("Failed to complete payout.");
        }

        const withdrawal = await this.withdrawals.markCompleted(
          withdrawalId,
          session,
        );

        await createFinancialAudit({ action: AuditAction.PAYOUT_SUCCEEDED, actor: { type: "PROVIDER", reference: current.payout.provider }, entityType: "PAYOUT", entityId: payout._id, financialContext: { domain: "PAYOUT", primaryReference: payout.payoutReference, payoutReference: payout.payoutReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, provider: payout.provider, providerReference: payout.providerPayoutId, ledgerTransactionReference: payoutTx, projectionOperationReference: `withdrawal:${withdrawal.withdrawalReference}:projection:paid` }, transition: { fromStatus: PayoutStatus.PROCESSING, toStatus: PayoutStatus.COMPLETED, outcome: "SUCCEEDED" }, session });

        finalized = { withdrawal, payout };
      });
    } finally {
      await session.endSession();
    }

    if (!finalized) {
      throw new PayoutError("Failed to finalize payout completion.");
    }

    return finalized;
  }

  private async finalizeFailure(
    withdrawalId: string,
    result: Extract<PayoutProviderResult, { outcome: "FAILED" }>,
  ): Promise<{ withdrawal: IWithdrawal; payout: IPayout }> {
    const session = await mongoose.startSession();
    let finalized: { withdrawal: IWithdrawal; payout: IPayout } | null = null;

    try {
      await session.withTransaction(async () => {
        const current = await this.getProcessingRelationshipInSession(
          withdrawalId,
          session,
        );

        if (current.withdrawal.status === WithdrawalStatus.FAILED) {
          await createFinancialAudit({ action: AuditAction.PAYOUT_REPLAY_DETECTED, actor: { type: "SYSTEM", reference: "withdrawal-payout-lifecycle" }, entityType: "PAYOUT", entityId: current.payout._id, financialContext: { domain: "PAYOUT", primaryReference: current.payout.payoutReference, payoutReference: current.payout.payoutReference, withdrawalReference: current.withdrawal.withdrawalReference, amount: current.withdrawal.amount, currency: current.withdrawal.currency, provider: current.payout.provider, providerReference: current.payout.providerPayoutId }, transition: { outcome: "REPLAYED" }, session });
          finalized = current;
          return;
        }

        const failureTx = `withdrawal:${current.withdrawal.withdrawalReference}:failure`;
        await this.ledger.createDebit({ payoutId: current.payout._id.toString(), userId: current.withdrawal.creatorId.toString(), transactionId: failureTx, account: LedgerAccount.CREATOR_PAYOUT_RESERVED, postingKey: `${failureTx}:reserved-debit`, money: { amount: current.withdrawal.amount, currency: current.withdrawal.currency }, type: LedgerEntryType.PAYOUT, source: LedgerSource.PAYOUT, description: "Withdrawal payout failure release", idempotencyKey: failureTx }, session);
        await this.ledger.createCredit({ payoutId: current.payout._id.toString(), userId: current.withdrawal.creatorId.toString(), transactionId: failureTx, account: LedgerAccount.CREATOR_AVAILABLE, postingKey: `${failureTx}:available-credit`, money: { amount: current.withdrawal.amount, currency: current.withdrawal.currency }, type: LedgerEntryType.PAYOUT, source: LedgerSource.PAYOUT, description: "Withdrawal payout failure release", idempotencyKey: failureTx }, session);

        await this.balances.releaseReservedBalance(
          {
            creatorId: current.withdrawal.creatorId.toString(),
            money: {
              amount: current.withdrawal.amount,
              currency: current.withdrawal.currency,
            },
          },
          session,
        );
        await projectionOperations.create({ creatorId: current.withdrawal.creatorId, withdrawalId: current.withdrawal._id, operationReference: `withdrawal:${current.withdrawal.withdrawalReference}:projection:failure-release`, operationType: WithdrawalProjectionOperationType.FAILURE_RELEASE, amount: current.withdrawal.amount, currency: current.withdrawal.currency, sourceReference: current.withdrawal.withdrawalReference, ledgerTransactionReference: failureTx, appliedAt: new Date() }, session);

        const payout = await this.repository.updateById(
          current.payout._id.toString(),
          {
            status: PayoutStatus.FAILED,
            failedAt: result.failedAt ?? new Date(),
            failureMessage: result.failureReason,
            providerPayload: result.payload ?? {},
          },
          session,
        );

        if (!payout) {
          throw new PayoutError("Failed to fail payout.");
        }

        const withdrawal = await this.withdrawals.markFailed(
          withdrawalId,
          result.failureReason,
          session,
        );

        await createFinancialAudit({ action: AuditAction.PAYOUT_FAILED, actor: { type: "PROVIDER", reference: current.payout.provider }, entityType: "PAYOUT", entityId: payout._id, financialContext: { domain: "PAYOUT", primaryReference: payout.payoutReference, payoutReference: payout.payoutReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, provider: payout.provider, providerReference: payout.providerPayoutId, ledgerTransactionReference: failureTx, projectionOperationReference: `withdrawal:${withdrawal.withdrawalReference}:projection:failure-release` }, transition: { fromStatus: PayoutStatus.PROCESSING, toStatus: PayoutStatus.FAILED, outcome: "FAILED" }, session });

        finalized = { withdrawal, payout };
      });
    } finally {
      await session.endSession();
    }

    if (!finalized) {
      throw new PayoutError("Failed to finalize payout failure.");
    }

    return finalized;
  }

  private async getProcessingRelationshipInSession(
    withdrawalId: string,
    session: mongoose.ClientSession,
  ): Promise<{ withdrawal: IWithdrawal; payout: IPayout }> {
    const withdrawal = await this.withdrawals.getWithdrawal(withdrawalId, session);

    if (!withdrawal.payoutId) {
      throw new PayoutError("Withdrawal payout relationship is missing.");
    }

    const payout = await this.repository.findById(
      withdrawal.payoutId.toString(),
      session,
    );

    if (
      !payout ||
      payout.sourceType !== PayoutSourceType.WITHDRAWAL ||
      !payout.withdrawalId ||
      payout.withdrawalId.toString() !== withdrawalId
    ) {
      throw new PayoutError("Withdrawal has a conflicting payout relationship.");
    }

    if (
      withdrawal.status !== WithdrawalStatus.PROCESSING &&
      withdrawal.status !== WithdrawalStatus.COMPLETED &&
      withdrawal.status !== WithdrawalStatus.FAILED
    ) {
      throw new PayoutError("Withdrawal must be processing before finalization.");
    }

    return { withdrawal, payout };
  }

  private async preparePayout(withdrawalId: string): Promise<{
    withdrawal: IWithdrawal;
    payout: IPayout;
  }> {
    const session = await mongoose.startSession();
    let result: { withdrawal: IWithdrawal; payout: IPayout } | null = null;

    try {
      await session.withTransaction(async () => {
        const withdrawal = await this.withdrawals.getWithdrawal(
          withdrawalId,
          session,
        );

        if (
          withdrawal.status !== WithdrawalStatus.RESERVED &&
          withdrawal.status !== WithdrawalStatus.PROCESSING
        ) {
          throw new PayoutError("Withdrawal must be reserved before payout initialization.");
        }

        let payout: IPayout | null = null;

        if (withdrawal.payoutId) {
          payout = await this.repository.findById(
            withdrawal.payoutId.toString(),
            session,
          );
        } else {
          payout = await this.payouts.getByWithdrawal(withdrawalId, session);
        }

        if (!payout) {
          payout = await this.payouts.createWithdrawalPayout(
            {
              withdrawalId,
              creatorId: withdrawal.creatorId.toString(),
              amount: {
                amount: withdrawal.amount,
                currency: withdrawal.currency,
              },
              idempotencyKey: `withdrawal-payout:${withdrawal.withdrawalReference}`,
            },
            session,
          );
        }

        if (
          payout.sourceType !== PayoutSourceType.WITHDRAWAL ||
          !payout.withdrawalId ||
          payout.withdrawalId.toString() !== withdrawalId ||
          payout.creatorId.toString() !== withdrawal.creatorId.toString() ||
          payout.amount !== withdrawal.amount ||
          payout.currency !== withdrawal.currency
        ) {
          throw new PayoutError("Withdrawal has a conflicting payout relationship.");
        }

        const linkedWithdrawal = await this.withdrawals.linkPayout(
          withdrawalId,
          payout._id.toString(),
          session,
        );

        result = { withdrawal: linkedWithdrawal, payout };
      });
    } finally {
      await session.endSession();
    }

    if (!result) {
      throw new PayoutError("Failed to prepare withdrawal payout.");
    }

    return result;
  }

  private async synchronizeProviderInitialization(
    withdrawalId: string,
    payoutId: string,
    providerResponse: {
      providerPayoutId: string;
      providerReference?: string;
      payload?: Record<string, unknown>;
    },
  ): Promise<{ withdrawal: IWithdrawal; payout: IPayout }> {
    const session = await mongoose.startSession();
    let result: { withdrawal: IWithdrawal; payout: IPayout } | null = null;

    try {
      await session.withTransaction(async () => {
        const payout = await this.repository.findById(payoutId, session);

        if (!payout) {
          throw new PayoutError("Payout not found.");
        }

        if (
          payout.providerPayoutId &&
          payout.providerPayoutId !== providerResponse.providerPayoutId
        ) {
          throw new PayoutError("Provider payout identifier conflicts with payout.");
        }

        const updatedPayout = await this.repository.updateById(
          payoutId,
          {
            providerPayoutId: providerResponse.providerPayoutId,
            providerTransferId: providerResponse.providerReference,
            providerPayload: providerResponse.payload ?? {},
            status: PayoutStatus.PROCESSING,
          },
          session,
        );

        if (!updatedPayout) {
          throw new PayoutError("Failed to synchronize payout initialization.");
        }

        const withdrawal = await this.withdrawals.markProcessing(
          withdrawalId,
          payoutId,
          session,
        );

        await createFinancialAudit({ action: AuditAction.PAYOUT_PROCESSING_STARTED, actor: { type: "SYSTEM", reference: "withdrawal-payout-lifecycle" }, entityType: "PAYOUT", entityId: updatedPayout._id, financialContext: { domain: "PAYOUT", primaryReference: updatedPayout.payoutReference, payoutReference: updatedPayout.payoutReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, provider: updatedPayout.provider, providerReference: updatedPayout.providerPayoutId }, transition: { fromStatus: PayoutStatus.CREATED, toStatus: PayoutStatus.PROCESSING, outcome: "PROCESSING" }, session });
        await createFinancialAudit({ action: AuditAction.PAYOUT_PROVIDER_SYNCHRONIZED, actor: { type: "PROVIDER", reference: updatedPayout.provider }, entityType: "PAYOUT", entityId: updatedPayout._id, financialContext: { domain: "PAYOUT", primaryReference: updatedPayout.payoutReference, payoutReference: updatedPayout.payoutReference, withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, provider: updatedPayout.provider, providerReference: updatedPayout.providerPayoutId }, transition: { toStatus: PayoutStatus.PROCESSING, outcome: "PROCESSING" }, session });

        result = { withdrawal, payout: updatedPayout };
      });
    } finally {
      await session.endSession();
    }

    if (!result) {
      throw new PayoutError("Failed to synchronize withdrawal payout.");
    }

    return result;
  }
}

export const withdrawalPayoutLifecycleService =
  new WithdrawalPayoutLifecycleService();
