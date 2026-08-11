import crypto from "node:crypto";
import mongoose, { ClientSession, Types } from "mongoose";

import User from "../../models/User";
import { AuditAction } from "../../enums/financial/auditAction.enum";
import { BookingCreatorSettlementFailureClassification as SettlementClassification } from "../../enums/financial/bookingCreatorSettlementFailureClassification.enum";
import { CreatorWithdrawalRequestStatus } from "../../enums/financial/creatorWithdrawalRequestStatus.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { PayoutDestinationVerificationStatus } from "../../enums/financial/payoutDestinationVerificationStatus.enum";
import { CreatorWithdrawalRequestError } from "../../errors/financial/CreatorWithdrawalRequestError";
import { LedgerError } from "../../errors/financial/LedgerError";
import { WalletError } from "../../errors/financial/WalletError";
import { AuditLog } from "../../models/auditLog.model";
import { CreatorProfile } from "../../models/creatorProfile.model";
import { CreatorWithdrawalRequestDocument } from "../../models/creatorWithdrawalRequest.model";
import { bookingCreatorSettlementRepository } from "../../repositories/bookingCreatorSettlement.repository";
import { creatorWithdrawalRequestRepository } from "../../repositories/creatorWithdrawalRequest.repository";
import { ledgerEntryRepository } from "../../repositories/ledgerEntry.repository";
import { payoutDestinationRepository } from "../../repositories/payoutDestination.repository";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { walletProjectionOperationRepository } from "../../repositories/wallet/walletProjectionOperation.repository";
import { Money } from "../../types/financial/money.type";
import {
  isValidIdempotencyKey,
  normalizeIdempotencyKey,
} from "../../utils/financial/idempotency.util";
import { isValidMoney } from "../../utils/financial/money.util";
import {
  deriveCreatorWithdrawalAuthorityFingerprint,
  deriveCreatorWithdrawalProjectionFingerprint,
  deriveCreatorWithdrawalRequestIdentity,
} from "../../utils/financial/creatorWithdrawalRequestIdentity.util";
import { resolveAccountGovernance } from "../accountGovernance/accountGovernanceResolver.service";
import { createFinancialAudit } from "../auditLog.service";
import { ledgerService } from "./ledger.service";
import { bookingCreatorSettlementOperationalInspectionService } from "./bookingCreatorSettlementOperationalInspection.service";
import { withdrawalEligibilityService } from "./withdrawalEligibility.service";
import { withdrawalRepository } from "../../repositories/withdrawal.repository";
import { walletProjectionService } from "../wallet/walletProjection.service";

export type CreatorWithdrawalReservationStage =
  | "AFTER_AUTHORITY"
  | "AFTER_LEDGER"
  | "AFTER_PROJECTION"
  | "BEFORE_RESERVED_TRANSITION"
  | "BEFORE_AUDIT"
  | "BEFORE_COMMIT";

export interface CreateCreatorWithdrawalRequestInput {
  authenticatedUserId: string;
  amount: Money;
  destinationReference: string;
  idempotencyKey: string;
}

interface ResolvedContext {
  creator: Awaited<ReturnType<typeof CreatorProfile.findOne>>;
  wallet: NonNullable<Awaited<ReturnType<typeof walletRepository.findByUserAndCurrency>>>;
  destination: NonNullable<Awaited<ReturnType<typeof payoutDestinationRepository.findByCreatorAndReference>>>;
}

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export class CreatorWithdrawalRequestService {
  constructor(
    private readonly onStage: (
      stage: CreatorWithdrawalReservationStage,
    ) => void | Promise<void> = () => undefined,
  ) {}

  private fail(
    message: string,
    code: ConstructorParameters<typeof CreatorWithdrawalRequestError>[1],
    cause?: unknown,
  ): never {
    throw new CreatorWithdrawalRequestError(message, code, { cause });
  }

  private validateInput(input: CreateCreatorWithdrawalRequestInput) {
    if (
      !mongoose.Types.ObjectId.isValid(input.authenticatedUserId) ||
      !isValidMoney(input.amount) ||
      input.amount.amount <= 0 ||
      !isValidIdempotencyKey(input.idempotencyKey) ||
      typeof input.destinationReference !== "string" ||
      !input.destinationReference.trim()
    ) {
      this.fail(
        "Invalid Creator withdrawal request.",
        "CREATOR_WITHDRAWAL_INVALID_REQUEST",
      );
    }
  }

  private async resolveContext(
    input: CreateCreatorWithdrawalRequestInput,
    session?: ClientSession,
  ): Promise<ResolvedContext> {
    const creatorUserId = new Types.ObjectId(input.authenticatedUserId);
    const [creator, user, wallet] = await Promise.all([
      CreatorProfile.findOne({ userId: creatorUserId })
        .session(session ?? null),
      User.findById(creatorUserId).session(session ?? null),
      walletRepository.findByUserAndCurrency(
        creatorUserId,
        input.amount.currency,
        session,
      ),
    ]);
    if (!creator || creator.status !== "active" || !user ||
      resolveAccountGovernance(user).hasNoAccountAccess) {
      this.fail(
        "Creator is not eligible to request a withdrawal.",
        "CREATOR_WITHDRAWAL_CREATOR_INACTIVE",
      );
    }
    if (!wallet) {
      const anyWallet = await walletRepository.findAnyByUser(
        creatorUserId,
        session,
      );
      this.fail(
        anyWallet
          ? "Creator Wallet currency does not match the withdrawal."
          : "Creator Wallet was not found.",
        anyWallet
          ? "CREATOR_WITHDRAWAL_CURRENCY_MISMATCH"
          : "CREATOR_WITHDRAWAL_WALLET_MISSING",
      );
    }
    if (
      wallet.currentBalance !==
        wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance
    ) {
      this.fail(
        "Creator Wallet integrity validation failed.",
        "CREATOR_WITHDRAWAL_INTEGRITY_CONFLICT",
      );
    }
    if (wallet.lockedBalance > 0) {
      this.fail(
        "Creator Wallet has a financial lock.",
        "CREATOR_WITHDRAWAL_ELIGIBILITY_FAILURE",
      );
    }
    if (wallet.availableBalance < input.amount.amount) {
      this.fail(
        "Creator Wallet has insufficient available balance.",
        "CREATOR_WITHDRAWAL_INSUFFICIENT_BALANCE",
      );
    }
    const destination =
      await payoutDestinationRepository.findByCreatorAndReference(
        input.authenticatedUserId,
        input.destinationReference.trim(),
        session,
      );
    if (
      !destination ||
      destination.verificationStatus !==
        PayoutDestinationVerificationStatus.VERIFIED ||
      !destination.isActive ||
      !destination.verifiedAt
    ) {
      this.fail(
        "An active verified withdrawal destination was not found.",
        "CREATOR_WITHDRAWAL_DESTINATION_MISSING",
      );
    }
    return { creator, wallet, destination };
  }

  private async assertSettlementIntegrity(
    creatorUserId: Types.ObjectId,
    session?: ClientSession,
  ) {
    const settlements =
      await bookingCreatorSettlementRepository.findManyByCreatorUser(
        creatorUserId,
        session,
      );
    for (const settlement of settlements) {
      const inspection =
        await bookingCreatorSettlementOperationalInspectionService.inspect(
          settlement.settlementReference,
          session,
        );
      if (inspection.classification !== SettlementClassification.HEALTHY) {
        this.fail(
          "Creator settlement integrity is not healthy.",
          "CREATOR_WITHDRAWAL_INTEGRITY_CONFLICT",
        );
      }
    }
  }

  private authorityFingerprint(request: CreatorWithdrawalRequestDocument) {
    return deriveCreatorWithdrawalAuthorityFingerprint({
      withdrawalReference: request.withdrawalReference,
      creatorId: request.creatorId,
      creatorUserId: request.creatorUserId,
      walletId: request.walletId,
      destinationId: request.destinationId,
      destinationReference: request.destinationReference,
      currency: request.currency,
      amount: request.amount,
    });
  }

  private ensureSameIntent(
    request: CreatorWithdrawalRequestDocument,
    fingerprint: string,
  ) {
    if (request.requestFingerprint !== fingerprint) {
      this.fail(
        "Withdrawal replay conflicts with the original immutable request.",
        "CREATOR_WITHDRAWAL_REPLAY_CONFLICT",
      );
    }
  }

  private safe(request: CreatorWithdrawalRequestDocument, replay: boolean) {
    return {
      withdrawalReference: request.withdrawalReference,
      amount: request.amount,
      reservedAmount: request.reservedAmount,
      currency: request.currency,
      status: request.status,
      destinationReference: request.destinationReference,
      projectionReference: request.projectionReference,
      requestedAt: request.requestedAt,
      reservedAt: request.reservedAt,
      replay,
    };
  }

  async validateReplay(withdrawalReference: string) {
    const request =
      await creatorWithdrawalRequestRepository.findByReference(
        withdrawalReference,
      );
    if (!request) {
      this.fail(
        "Creator withdrawal request was not found.",
        "CREATOR_WITHDRAWAL_REPLAY_CONFLICT",
      );
    }
    const expectedFingerprint = this.authorityFingerprint(request);
    const expectedReference =
      `CWR-${hash(request.withdrawalKey).slice(0, 20).toUpperCase()}`;
    const transactionReference =
      `creator-withdrawal-reservation:${request.withdrawalReference}`;
    const operationKey = `${transactionReference}:wallet-projection`;
    const expectedProjectionReference =
      `WPO-${hash(operationKey).slice(0, 16).toUpperCase()}`;
    const reservationStillHeld =
      request.status === CreatorWithdrawalRequestStatus.RESERVED &&
      request.reservedAmount === request.amount;
    const reservationFinalized = [
      CreatorWithdrawalRequestStatus.COMPLETED,
      CreatorWithdrawalRequestStatus.FAILED,
    ].includes(request.status) &&
      request.reservedAmount === 0 &&
      !!request.finalizationReference &&
      !!request.finalizationOutcome;
    if (
      (!reservationStillHeld && !reservationFinalized) ||
      !request.reservedAt ||
      request.requestFingerprint !== expectedFingerprint ||
      request.withdrawalReference !== expectedReference ||
      request.ledgerTransactionReference !== transactionReference ||
      request.projectionReference !== expectedProjectionReference ||
      request.ledgerEntryIds.length !== 2
    ) {
      this.fail(
        "Creator withdrawal authority conflicts with deterministic identity.",
        "CREATOR_WITHDRAWAL_REPLAY_CONFLICT",
      );
    }
    const entries = await ledgerEntryRepository.findManyWithPostingKeys({
      transactionId: transactionReference,
    });
    const expectedIds = new Set(request.ledgerEntryIds.map(String));
    const commonValid = entries.length === 2 && entries.every((entry) =>
      expectedIds.has(entry._id.toString()) &&
      entry.type === LedgerEntryType.CREATOR_WITHDRAWAL_RESERVED &&
      entry.source === LedgerSource.CREATOR_WITHDRAWAL_RESERVATION &&
      entry.userId?.equals(request.creatorUserId) &&
      entry.walletId?.equals(request.walletId) &&
      entry.amount === request.amount &&
      entry.currency === request.currency &&
      entry.metadata?.withdrawalReference === request.withdrawalReference &&
      entry.metadata?.destinationReference === request.destinationReference);
    const debit = entries.find((entry) =>
      entry.direction === MoneyDirection.DEBIT &&
      entry.account === LedgerAccount.WALLET_AVAILABLE &&
      entry.postingKey === `${transactionReference}:wallet-available-debit`);
    const credit = entries.find((entry) =>
      entry.direction === MoneyDirection.CREDIT &&
      entry.account === LedgerAccount.WITHDRAWAL_RESERVED &&
      entry.postingKey === `${transactionReference}:withdrawal-reserved-credit`);
    if (!commonValid || !debit || !credit) {
      this.fail(
        "Creator withdrawal Ledger reservation conflicts.",
        "CREATOR_WITHDRAWAL_LEDGER_CONFLICT",
      );
    }
    const projection =
      await walletProjectionOperationRepository.findByOperationKey(operationKey);
    const projectionFingerprint =
      deriveCreatorWithdrawalProjectionFingerprint({
        creatorUserId: request.creatorUserId,
        currency: request.currency,
        operationKey,
        amount: request.amount,
        ledgerEntryIds: request.ledgerEntryIds,
      });
    if (
      !projection ||
      projection.operationReference !== expectedProjectionReference ||
      projection.fingerprint !== projectionFingerprint ||
      !projection.walletId.equals(request.walletId) ||
      !projection.userId.equals(request.creatorUserId) ||
      projection.currency !== request.currency ||
      projection.deltas.availableBalance !== -request.amount ||
      projection.deltas.reservedBalance !== request.amount ||
      projection.deltas.lockedBalance !== 0 ||
      projection.ledgerEntryIds.length !== 2 ||
      new Set(projection.ledgerEntryIds.map(String)).size !== 2 ||
      !projection.ledgerEntryIds.every((id) => expectedIds.has(id.toString()))
    ) {
      this.fail(
        "Creator withdrawal Wallet projection conflicts.",
        "CREATOR_WITHDRAWAL_PROJECTION_CONFLICT",
      );
    }
    const [wallet, destination, auditCount] = await Promise.all([
      walletRepository.findById(request.walletId),
      payoutDestinationRepository.findByCreatorAndReference(
        request.creatorUserId.toString(),
        request.destinationReference,
      ),
      AuditLog.countDocuments({
        action: AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
        entityId: request._id,
        "financialContext.primaryReference": request.withdrawalReference,
      }),
    ]);
    if (
      !wallet ||
      !wallet.userId.equals(request.creatorUserId) ||
      wallet.currency !== request.currency ||
      wallet.currentBalance !==
        wallet.availableBalance + wallet.reservedBalance + wallet.lockedBalance ||
      wallet.projectionVersion < projection.projectionVersion ||
      !destination ||
      !destination._id.equals(request.destinationId) ||
      destination.verificationStatus !==
        PayoutDestinationVerificationStatus.VERIFIED ||
      !destination.isActive ||
      auditCount !== 1
    ) {
      this.fail(
        "Creator withdrawal integrity validation failed.",
        "CREATOR_WITHDRAWAL_INTEGRITY_CONFLICT",
      );
    }
    await this.assertSettlementIntegrity(request.creatorUserId);
    return this.safe(request, true);
  }

  async request(input: CreateCreatorWithdrawalRequestInput) {
    this.validateInput(input);
    const normalizedInput = {
      ...input,
      destinationReference: input.destinationReference.trim(),
      idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
    };
    const replayKey = `creator-withdrawal:` +
      `${normalizedInput.authenticatedUserId}:${normalizedInput.idempotencyKey}`;
    const replay = await creatorWithdrawalRequestRepository.findByKey(replayKey);
    if (replay) {
      const replayIdentity = deriveCreatorWithdrawalRequestIdentity({
        creatorId: replay.creatorId,
        creatorUserId: replay.creatorUserId,
        walletId: replay.walletId,
        destinationId: replay.destinationId,
        destinationReference: normalizedInput.destinationReference,
        currency: normalizedInput.amount.currency,
        amount: normalizedInput.amount.amount,
        idempotencyKey: normalizedInput.idempotencyKey,
      });
      this.ensureSameIntent(replay, replayIdentity.requestFingerprint);
      return this.validateReplay(replay.withdrawalReference);
    }
    const context = await this.resolveContext(normalizedInput);
    const identity = deriveCreatorWithdrawalRequestIdentity({
      creatorId: context.creator!._id as Types.ObjectId,
      creatorUserId: context.creator!.userId,
      walletId: context.wallet._id as Types.ObjectId,
      destinationId: context.destination._id as Types.ObjectId,
      destinationReference: context.destination.destinationReference,
      currency: context.wallet.currency,
      amount: normalizedInput.amount.amount,
      idempotencyKey: normalizedInput.idempotencyKey,
    });
    const existing =
      await creatorWithdrawalRequestRepository.findByKey(identity.withdrawalKey);
    if (existing) {
      this.ensureSameIntent(existing, identity.requestFingerprint);
      return this.validateReplay(existing.withdrawalReference);
    }
    const eligibility = await withdrawalEligibilityService.evaluate({
      creatorId: normalizedInput.authenticatedUserId,
      amount: normalizedInput.amount,
      destinationReference: normalizedInput.destinationReference,
      balanceSnapshot: {
        currency: context.wallet.currency,
        availableBalance: context.wallet.availableBalance,
      },
    });
    if (!eligibility.allowed) {
      this.fail(
        `Creator withdrawal eligibility failed: ${eligibility.reason}.`,
        eligibility.reason === "INSUFFICIENT_BALANCE"
          ? "CREATOR_WITHDRAWAL_INSUFFICIENT_BALANCE"
          : eligibility.reason === "PENDING_WITHDRAWAL"
            ? "CREATOR_WITHDRAWAL_EXISTING_WITHDRAWAL"
            : "CREATOR_WITHDRAWAL_ELIGIBILITY_FAILURE",
      );
    }
    await this.assertSettlementIntegrity(context.creator!.userId);
    const session = await mongoose.startSession();
    let committedReference: string | null = null;
    let createdHere = false;
    try {
      await session.withTransaction(async () => {
        const replay =
          await creatorWithdrawalRequestRepository.findByKey(
            identity.withdrawalKey,
            session,
          );
        if (replay) {
          this.ensureSameIntent(replay, identity.requestFingerprint);
          committedReference = replay.withdrawalReference;
          return;
        }
        const transactionalContext =
          await this.resolveContext(normalizedInput, session);
        await this.assertSettlementIntegrity(
          transactionalContext.creator!.userId,
          session,
        );
        if (
          await creatorWithdrawalRequestRepository.findActiveByCreatorUser(
            transactionalContext.creator!.userId,
            session,
          ) ||
          await withdrawalRepository.findActiveByCreator(
            normalizedInput.authenticatedUserId,
            session,
          )
        ) {
          this.fail(
            "Creator already has an active withdrawal.",
            "CREATOR_WITHDRAWAL_EXISTING_WITHDRAWAL",
          );
        }
        const requestedAt = new Date();
        const authority =
          await creatorWithdrawalRequestRepository.createPending({
            withdrawalReference: identity.withdrawalReference,
            withdrawalKey: identity.withdrawalKey,
            creatorId: transactionalContext.creator!._id as Types.ObjectId,
            creatorUserId: transactionalContext.creator!.userId,
            walletId: transactionalContext.wallet._id as Types.ObjectId,
            destinationId:
              transactionalContext.destination._id as Types.ObjectId,
            destinationReference:
              transactionalContext.destination.destinationReference,
            currency: transactionalContext.wallet.currency,
            amount: normalizedInput.amount.amount,
            requestFingerprint: identity.requestFingerprint,
            requestedAt,
          }, session);
        createdHere = true;
        await this.onStage("AFTER_AUTHORITY");
        const money = {
          amount: authority.amount,
          currency: authority.currency,
        };
        const metadata = {
          withdrawalReference: authority.withdrawalReference,
          creatorId: authority.creatorId.toString(),
          destinationReference: authority.destinationReference,
        };
        const debit = await ledgerService.createDebit({
          type: LedgerEntryType.CREATOR_WITHDRAWAL_RESERVED,
          source: LedgerSource.CREATOR_WITHDRAWAL_RESERVATION,
          account: LedgerAccount.WALLET_AVAILABLE,
          postingKey: identity.availableDebitPostingKey,
          transactionId: identity.ledgerTransactionReference,
          userId: authority.creatorUserId.toString(),
          walletId: authority.walletId.toString(),
          money,
          description: "Creator withdrawal available-fund reservation",
          metadata,
        }, session);
        const credit = await ledgerService.createCredit({
          type: LedgerEntryType.CREATOR_WITHDRAWAL_RESERVED,
          source: LedgerSource.CREATOR_WITHDRAWAL_RESERVATION,
          account: LedgerAccount.WITHDRAWAL_RESERVED,
          postingKey: identity.reservedCreditPostingKey,
          transactionId: identity.ledgerTransactionReference,
          userId: authority.creatorUserId.toString(),
          walletId: authority.walletId.toString(),
          money,
          description: "Creator withdrawal reserved-fund recognition",
          metadata,
        }, session);
        const ledgerEntryIds = [
          debit._id as Types.ObjectId,
          credit._id as Types.ObjectId,
        ];
        await this.onStage("AFTER_LEDGER");
        await walletProjectionService.applyProjectionMutation({
          userId: authority.creatorUserId,
          currency: authority.currency,
          operationKey: identity.projectionOperationKey,
          deltas: {
            availableBalance: -authority.amount,
            reservedBalance: authority.amount,
            lockedBalance: 0,
          },
          minimums: { availableBalance: authority.amount },
          ledgerEntryIds,
        }, session);
        await this.onStage("AFTER_PROJECTION");
        await this.onStage("BEFORE_RESERVED_TRANSITION");
        const reserved = await creatorWithdrawalRequestRepository.reserve({
          requestId: authority._id as Types.ObjectId,
          withdrawalKey: identity.withdrawalKey,
          requestFingerprint: identity.requestFingerprint,
          amount: authority.amount,
          ledgerTransactionReference: identity.ledgerTransactionReference,
          ledgerEntryIds,
          projectionReference: identity.projectionReference,
          reservedAt: new Date(),
          expectedVersion: authority.version,
        }, session);
        if (!reserved) {
          this.fail(
            "Creator withdrawal reservation transition conflicted.",
            "CREATOR_WITHDRAWAL_TRANSACTION_CONFLICT",
          );
        }
        await this.onStage("BEFORE_AUDIT");
        await createFinancialAudit({
          action: AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
          actor: {
            type: "CREATOR",
            id: authority.creatorUserId,
          },
          entityType: "CREATOR_WITHDRAWAL_REQUEST",
          entityId: authority._id as Types.ObjectId,
          financialContext: {
            domain: "WITHDRAWAL",
            primaryReference: authority.withdrawalReference,
            withdrawalReference: authority.withdrawalReference,
            amount: authority.amount,
            currency: authority.currency,
            ledgerTransactionReference: identity.ledgerTransactionReference,
            projectionOperationReference: identity.projectionReference,
          },
          transition: {
            fromStatus: CreatorWithdrawalRequestStatus.PENDING,
            toStatus: CreatorWithdrawalRequestStatus.RESERVED,
            outcome: "SUCCEEDED",
          },
          metadata: {
            creatorReference: transactionalContext.creator!.slug,
            walletReference:
              `WAL-${hash(authority.walletId.toString()).slice(0, 16).toUpperCase()}`,
            destinationReference: authority.destinationReference,
            reasonCode: "CREATOR_WITHDRAWAL_FUNDS_RESERVED",
          },
          session,
        });
        await this.onStage("BEFORE_COMMIT");
        committedReference = reserved.withdrawalReference;
      });
      if (!committedReference) {
        this.fail(
          "Creator withdrawal reservation did not commit.",
          "CREATOR_WITHDRAWAL_TRANSACTION_CONFLICT",
        );
      }
      const validated = await this.validateReplay(committedReference);
      return { ...validated, replay: !createdHere };
    } catch (error) {
      const winner =
        await creatorWithdrawalRequestRepository.findByKey(
          identity.withdrawalKey,
        );
      if (winner) {
        this.ensureSameIntent(winner, identity.requestFingerprint);
        return this.validateReplay(winner.withdrawalReference);
      }
      if (error instanceof CreatorWithdrawalRequestError) throw error;
      if (error instanceof LedgerError) {
        this.fail(
          "Creator withdrawal Ledger reservation failed.",
          "CREATOR_WITHDRAWAL_LEDGER_CONFLICT",
          error,
        );
      }
      if (error instanceof WalletError) {
        this.fail(
          error.code === "WALLET_INSUFFICIENT_BALANCE"
            ? "Creator Wallet has insufficient available balance."
            : "Creator Wallet projection failed.",
          error.code === "WALLET_INSUFFICIENT_BALANCE"
            ? "CREATOR_WITHDRAWAL_INSUFFICIENT_BALANCE"
            : "CREATOR_WITHDRAWAL_PROJECTION_CONFLICT",
          error,
        );
      }
      this.fail(
        "Creator withdrawal reservation transaction failed.",
        "CREATOR_WITHDRAWAL_TRANSACTION_CONFLICT",
        error,
      );
    } finally {
      await session.endSession();
    }
  }
}

export const creatorWithdrawalRequestService =
  new CreatorWithdrawalRequestService();
