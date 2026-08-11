import mongoose, { ClientSession, Types } from "mongoose";

import { toWalletConversionAccountingResponseDto } from
  "../../dtos/wallet/walletConversionAccounting.response.dto";
import { InternalWalletConversionProviderRequestStatus } from
  "../../enums/financial/internalWalletConversionProviderRequestStatus.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import { WalletConversionAuditAction } from
  "../../enums/financial/walletConversionAuditAction.enum";
import { WalletConversionProviderOutcome } from
  "../../enums/financial/walletConversionProviderOutcome.enum";
import { WalletConversionRequestStatus } from
  "../../enums/financial/walletConversionRequestStatus.enum";
import { WalletConversionAccountingError,
  WalletConversionAccountingErrorCode } from
  "../../errors/financial/WalletConversionAccountingError";
import { WalletError } from "../../errors/financial/WalletError";
import { InternalWalletConversionProviderRequestDocument } from
  "../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { ILedgerEntry } from "../../models/ledgerEntry.model";
import { WalletDocument } from "../../models/wallet.model";
import { WalletConversionAudit } from
  "../../models/walletConversionAudit.model";
import { WalletConversionRequestDocument } from
  "../../models/walletConversionRequest.model";
import { WalletProjectionOperationDocument } from
  "../../models/walletProjectionOperation.model";
import { internalWalletConversionProviderRequestRepository } from
  "../../repositories/internalProvider/internalWalletConversionProviderRequest.repository";
import { ledgerEntryRepository } from
  "../../repositories/ledgerEntry.repository";
import { walletConversionAuditRepository } from
  "../../repositories/walletConversionAudit.repository";
import { walletConversionRequestRepository } from
  "../../repositories/walletConversionRequest.repository";
import { walletRepository } from
  "../../repositories/wallet/wallet.repository";
import { walletProjectionOperationRepository } from
  "../../repositories/wallet/walletProjectionOperation.repository";
import { createIdempotencyFingerprint } from
  "../../utils/financial/idempotency.util";
import { hasReferenceType } from "../../utils/financial/reference.util";
import { deriveWalletConversionAccountingIdentity } from
  "../../utils/financial/walletConversionAccountingIdentity.util";
import { walletCreationService } from "../wallet/walletCreation.service";
import { walletProjectionService } from
  "../wallet/walletProjection.service";
import { ledgerService } from "./ledger.service";
import { walletConversionProviderExecutionService } from
  "./walletConversionProviderExecution.service";

export type WalletConversionAccountingStage =
  | "AFTER_WALLET_CREATION"
  | "AFTER_LEDGER"
  | "AFTER_SOURCE_PROJECTION"
  | "AFTER_TARGET_PROJECTION"
  | "BEFORE_COMPLETED"
  | "BEFORE_AUDIT"
  | "BEFORE_COMMIT";

interface Options {
  now?: () => Date;
  failureInjector?: (stage: WalletConversionAccountingStage) =>
    void | Promise<void>;
}

type Identity = ReturnType<typeof deriveWalletConversionAccountingIdentity>;

const isTransient = (error: unknown) => {
  const value = error as { code?: number | string;
    hasErrorLabel?: (label: string) => boolean };
  return value?.code === 112 || value?.code === 251 ||
    value?.hasErrorLabel?.("TransientTransactionError") === true ||
    value?.hasErrorLabel?.("UnknownTransactionCommitResult") === true ||
    (error instanceof WalletError &&
      error.code === "WALLET_CREATION_CONFLICT");
};

export class WalletConversionAccountingService {
  private readonly now: () => Date;

  constructor(private readonly options: Options = {}) {
    this.now = options.now ?? (() => new Date());
  }

  private fail(message: string, code: WalletConversionAccountingErrorCode,
    cause?: unknown): never {
    throw new WalletConversionAccountingError(message, code, { cause });
  }

  private async inject(stage: WalletConversionAccountingStage) {
    await this.options.failureInjector?.(stage);
  }

  private normalize(reference: unknown) {
    if (typeof reference !== "string" ||
      !hasReferenceType(reference, "WALLET_CONVERSION")) {
      this.fail("Wallet conversion accounting input is invalid.",
        "WALLET_CONVERSION_ACCOUNTING_INVALID_INPUT");
    }
    return reference.trim();
  }

  private async loadRequest(reference: string, session?: ClientSession) {
    const request = await walletConversionRequestRepository.findByReference(
      reference, session);
    if (!request) this.fail("Wallet conversion request was not found.",
      "WALLET_CONVERSION_ACCOUNTING_REQUEST_NOT_FOUND");
    return request;
  }

  private async loadProvider(request: WalletConversionRequestDocument,
    session?: ClientSession) {
    const provider = await
      internalWalletConversionProviderRequestRepository.findByConversion(
        request.conversionReference, session);
    if (!provider ||
      provider.providerRequestReference !== request.providerRequestReference ||
      provider.providerExecutionReference !==
        request.providerExecutionReference ||
      provider.providerStatus !== request.providerStatus ||
      provider.providerOutcome !== request.providerOutcome ||
      provider.processingAt?.getTime() !==
        request.providerProcessingAt?.getTime() ||
      provider.completedAt?.getTime() !==
        request.providerCompletedAt?.getTime() ||
      !provider.isTerminal || provider.version !== 2) {
      this.fail("Wallet conversion provider authority conflicts.",
        "WALLET_CONVERSION_ACCOUNTING_PROVIDER_CONFLICT");
    }
    return provider;
  }

  private async validateProviderReplay(reference: string,
    outcome: WalletConversionProviderOutcome,
    allowAccountingTerminal = false) {
    try {
      await walletConversionProviderExecutionService.validateReplay(reference,
        outcome, allowAccountingTerminal
          ? { allowAccountingTerminal: true } : undefined);
    } catch (error) {
      this.fail("Wallet conversion provider graph conflicts.",
        "WALLET_CONVERSION_ACCOUNTING_PROVIDER_CONFLICT", error);
    }
  }

  private identity(request: WalletConversionRequestDocument,
    targetWallet: WalletDocument) {
    if (!request.providerRequestReference ||
      !request.providerExecutionReference) {
      this.fail("Wallet conversion provider identity is incomplete.",
        "WALLET_CONVERSION_ACCOUNTING_PROVIDER_CONFLICT");
    }
    return deriveWalletConversionAccountingIdentity({
      conversionReference: request.conversionReference,
      conversionKey: request.conversionKey,
      providerRequestReference: request.providerRequestReference,
      providerExecutionReference: request.providerExecutionReference,
      fxSnapshotReference: request.fxSnapshotReference,
      userId: request.userId, sourceWalletId: request.sourceWalletId,
      targetWalletId: targetWallet._id as Types.ObjectId,
      sourceCurrency: request.sourceCurrency,
      targetCurrency: request.targetCurrency,
      sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
    });
  }

  private validateWallet(wallet: WalletDocument,
    request: WalletConversionRequestDocument, currency: string,
    expectedId?: Types.ObjectId) {
    if ((expectedId && !wallet._id.equals(expectedId)) ||
      !wallet.userId.equals(request.userId) || wallet.currency !== currency ||
      wallet.currentBalance !== wallet.availableBalance +
        wallet.reservedBalance + wallet.lockedBalance ||
      !Number.isSafeInteger(wallet.projectionVersion)) {
      this.fail("Wallet conversion Wallet identity conflicts.",
        "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT");
    }
  }

  private async resolveWallets(request: WalletConversionRequestDocument,
    session: ClientSession) {
    const sourceWallet = await walletRepository.findById(
      request.sourceWalletId, session);
    if (!sourceWallet) this.fail("Source Wallet was not found.",
      "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT");
    this.validateWallet(sourceWallet, request, request.sourceCurrency,
      request.sourceWalletId);
    if (sourceWallet.availableBalance < request.sourceAmount) {
      this.fail("Source Wallet available balance is insufficient.",
        "WALLET_CONVERSION_ACCOUNTING_INSUFFICIENT_BALANCE");
    }
    let targetWallet: WalletDocument;
    if (request.targetWalletId) {
      const existing = await walletRepository.findById(
        request.targetWalletId, session);
      if (!existing) this.fail("Bound target Wallet was not found.",
        "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT");
      targetWallet = existing;
    } else {
      try {
        targetWallet = await walletCreationService.createWallet(
          request.userId, request.targetCurrency, session);
      } catch (error) {
        if (isTransient(error)) throw error;
        this.fail("Target Wallet creation failed.",
          "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT", error);
      }
    }
    this.validateWallet(targetWallet, request, request.targetCurrency,
      request.targetWalletId);
    if (targetWallet._id.equals(sourceWallet._id)) {
      this.fail("Source and target Wallet identities conflict.",
        "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT");
    }
    return { sourceWallet, targetWallet };
  }

  private validateLedger(request: WalletConversionRequestDocument,
    targetWallet: WalletDocument, identity: Identity, entries: ILedgerEntry[]) {
    if (entries.length !== 2) this.fail(
      "Wallet conversion Ledger transaction conflicts.",
      "WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT");
    const source = entries.find((entry) =>
      entry.postingKey === identity.sourcePostingKey);
    const target = entries.find((entry) =>
      entry.postingKey === identity.targetPostingKey);
    const common = (entry: ILedgerEntry | undefined) => entry &&
      entry.transactionId === identity.accountingTransactionReference &&
      entry.type === LedgerEntryType.WALLET_CONVERSION_COMPLETED &&
      entry.source === LedgerSource.WALLET_CONVERSION &&
      entry.account === LedgerAccount.WALLET_AVAILABLE &&
      entry.userId?.equals(request.userId) &&
      entry.metadata?.conversionReference === request.conversionReference &&
      entry.metadata?.accountingReference === identity.accountingReference &&
      entry.metadata?.providerExecutionReference ===
        request.providerExecutionReference &&
      entry.metadata?.fxSnapshotReference === request.fxSnapshotReference;
    if (!common(source) || source!.direction !== MoneyDirection.DEBIT ||
      !source!.walletId?.equals(request.sourceWalletId) ||
      source!.amount !== request.sourceAmount ||
      source!.currency !== request.sourceCurrency || !common(target) ||
      target!.direction !== MoneyDirection.CREDIT ||
      !target!.walletId?.equals(targetWallet._id) ||
      target!.amount !== request.targetAmount ||
      target!.currency !== request.targetCurrency) {
      this.fail("Wallet conversion Ledger identity conflicts.",
        "WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT");
    }
    return { source: source!, target: target! };
  }

  private validateProjection(request: WalletConversionRequestDocument,
    targetWallet: WalletDocument, identity: Identity,
    sourceLedger: ILedgerEntry, targetLedger: ILedgerEntry,
    source: WalletProjectionOperationDocument,
    target: WalletProjectionOperationDocument) {
    const valid =
      source.operationKey === identity.sourceProjectionKey &&
      source.operationReference === identity.sourceProjectionReference &&
      source.walletId.equals(request.sourceWalletId) &&
      source.userId.equals(request.userId) &&
      source.currency === request.sourceCurrency &&
      source.deltas.availableBalance === -request.sourceAmount &&
      source.deltas.reservedBalance === 0 && source.deltas.lockedBalance === 0 &&
      source.ledgerEntryIds.length === 1 &&
      source.ledgerEntryIds[0].equals(sourceLedger._id) &&
      target.operationKey === identity.targetProjectionKey &&
      target.operationReference === identity.targetProjectionReference &&
      target.walletId.equals(targetWallet._id) &&
      target.userId.equals(request.userId) &&
      target.currency === request.targetCurrency &&
      target.deltas.availableBalance === request.targetAmount &&
      target.deltas.reservedBalance === 0 && target.deltas.lockedBalance === 0 &&
      target.ledgerEntryIds.length === 1 &&
      target.ledgerEntryIds[0].equals(targetLedger._id);
    if (!valid) this.fail("Wallet conversion projection identity conflicts.",
      "WALLET_CONVERSION_ACCOUNTING_PROJECTION_CONFLICT");
  }

  private auditBase(request: WalletConversionRequestDocument,
    provider: InternalWalletConversionProviderRequestDocument) {
    return {
      conversionReference: request.conversionReference,
      sourceCurrency: request.sourceCurrency,
      targetCurrency: request.targetCurrency,
      sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
      fxSnapshotReference: request.fxSnapshotReference,
      fxEffectiveDate: request.fxEffectiveDate, requestedAt: request.requestedAt,
      providerRequestReference: provider.providerRequestReference,
      providerExecutionReference: provider.providerExecutionReference,
      providerStatus: provider.providerStatus,
      providerOutcome: provider.providerOutcome,
      processingAt: provider.processingAt,
      failureCode: provider.failureCode,
    };
  }

  private async finalizeFailed(reference: string) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const request = await this.loadRequest(reference, session);
        if (request.status !== WalletConversionRequestStatus.APPROVED ||
          request.providerStatus !==
            InternalWalletConversionProviderRequestStatus.FAILED ||
          request.providerOutcome !== WalletConversionProviderOutcome.FAILURE) {
          this.fail("Conversion is not eligible for failed finalization.",
            "WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS");
        }
        const provider = await this.loadProvider(request, session);
        const existingEntries = await ledgerEntryRepository.findMany({
          "metadata.conversionReference": reference,
          type: LedgerEntryType.WALLET_CONVERSION_COMPLETED,
        }, session);
        if (existingEntries.length) this.fail(
          "Failed conversion contains accounting entries.",
          "WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT");
        const failedAt = this.now();
        const failed = await walletConversionRequestRepository
          .failApprovedFromProvider({ conversionReference: reference,
            providerExecutionReference: provider.providerExecutionReference,
            failedAt, session });
        if (!failed) this.fail("Failed conversion transition conflicted.",
          "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT");
        await this.inject("BEFORE_AUDIT");
        await walletConversionAuditRepository.createOnce({
          ...this.auditBase(request, provider),
          auditKey: createIdempotencyFingerprint(
            WalletConversionAuditAction.FAILED, request.conversionKey),
          action: WalletConversionAuditAction.FAILED, failedAt,
        }, session);
        await this.inject("BEFORE_COMMIT");
      });
    } finally { await session.endSession(); }
  }

  private async completeTransaction(reference: string) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const request = await this.loadRequest(reference, session);
        if (request.status !== WalletConversionRequestStatus.APPROVED ||
          request.providerStatus !==
            InternalWalletConversionProviderRequestStatus.SUCCEEDED ||
          request.providerOutcome !== WalletConversionProviderOutcome.SUCCESS ||
          request.accountingReference || request.accountingTransactionReference) {
          this.fail("Conversion is not eligible for accounting.",
            "WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS");
        }
        const provider = await this.loadProvider(request, session);
        const { sourceWallet, targetWallet } = await this.resolveWallets(
          request, session);
        await this.inject("AFTER_WALLET_CREATION");
        const identity = this.identity(request, targetWallet);
        const [existingEntries, sourceExisting, targetExisting] =
          await Promise.all([
            ledgerEntryRepository.findManyWithPostingKeys({
              transactionId: identity.accountingTransactionReference,
            }, session),
            walletProjectionOperationRepository.findByOperationKey(
              identity.sourceProjectionKey, session),
            walletProjectionOperationRepository.findByOperationKey(
              identity.targetProjectionKey, session),
          ]);
        if (existingEntries.length || sourceExisting || targetExisting) {
          this.fail("Partial conversion accounting already exists.",
            "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT");
        }
        const common = {
          type: LedgerEntryType.WALLET_CONVERSION_COMPLETED,
          source: LedgerSource.WALLET_CONVERSION,
          account: LedgerAccount.WALLET_AVAILABLE,
          transactionId: identity.accountingTransactionReference,
          userId: request.userId.toString(),
          idempotencyKey: identity.accountingReference,
          metadata: {
            conversionReference: request.conversionReference,
            accountingReference: identity.accountingReference,
            providerRequestReference: provider.providerRequestReference,
            providerExecutionReference: provider.providerExecutionReference,
            fxSnapshotReference: request.fxSnapshotReference,
          },
        } as const;
        let sourceLedger: ILedgerEntry;
        let targetLedger: ILedgerEntry;
        try {
          sourceLedger = await ledgerService.createDebit({ ...common,
            money: { amount: request.sourceAmount,
              currency: request.sourceCurrency },
            walletId: sourceWallet._id.toString(),
            postingKey: identity.sourcePostingKey,
            description: "Wallet conversion source debit",
          }, session);
          targetLedger = await ledgerService.createCredit({ ...common,
            money: { amount: request.targetAmount,
              currency: request.targetCurrency },
            walletId: targetWallet._id.toString(),
            postingKey: identity.targetPostingKey,
            description: "Wallet conversion target credit",
          }, session);
        } catch (error) {
          if (isTransient(error)) throw error;
          this.fail("Wallet conversion Ledger posting failed.",
            "WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT", error);
        }
        await this.inject("AFTER_LEDGER");
        let projectedSource: WalletDocument;
        let projectedTarget: WalletDocument;
        try {
          projectedSource = await walletProjectionService
            .applyProjectionMutation({ userId: request.userId,
              currency: request.sourceCurrency,
              operationKey: identity.sourceProjectionKey,
              deltas: { availableBalance: -request.sourceAmount,
                reservedBalance: 0, lockedBalance: 0 },
              minimums: { availableBalance: request.sourceAmount },
              ledgerEntryIds: [sourceLedger._id as Types.ObjectId],
            }, session);
          await this.inject("AFTER_SOURCE_PROJECTION");
          projectedTarget = await walletProjectionService
            .applyProjectionMutation({ userId: request.userId,
              currency: request.targetCurrency,
              operationKey: identity.targetProjectionKey,
              deltas: { availableBalance: request.targetAmount,
                reservedBalance: 0, lockedBalance: 0 },
              ledgerEntryIds: [targetLedger._id as Types.ObjectId],
            }, session);
        } catch (error) {
          if (isTransient(error)) throw error;
          if (error instanceof WalletError &&
            error.code === "WALLET_INSUFFICIENT_BALANCE") {
            this.fail("Source Wallet available balance is insufficient.",
              "WALLET_CONVERSION_ACCOUNTING_INSUFFICIENT_BALANCE", error);
          }
          this.fail("Wallet conversion projection failed.",
            "WALLET_CONVERSION_ACCOUNTING_PROJECTION_CONFLICT", error);
        }
        await this.inject("AFTER_TARGET_PROJECTION");
        const [sourceProjection, targetProjection] = await Promise.all([
          walletProjectionOperationRepository.findByOperationKey(
            identity.sourceProjectionKey, session),
          walletProjectionOperationRepository.findByOperationKey(
            identity.targetProjectionKey, session),
        ]);
        if (!sourceProjection || !targetProjection) this.fail(
          "Wallet conversion projection authority is missing.",
          "WALLET_CONVERSION_ACCOUNTING_PROJECTION_CONFLICT");
        this.validateProjection(request, targetWallet, identity, sourceLedger,
          targetLedger, sourceProjection, targetProjection);
        await this.inject("BEFORE_COMPLETED");
        const completedAt = this.now();
        const completed = await walletConversionRequestRepository
          .completeApprovedWithAccounting({
            conversionReference: reference,
            providerExecutionReference: provider.providerExecutionReference,
            accountingReference: identity.accountingReference,
            accountingKey: identity.accountingKey,
            accountingFingerprint: identity.accountingFingerprint,
            accountingTransactionReference:
              identity.accountingTransactionReference,
            accountingTargetWalletId: targetWallet._id as Types.ObjectId,
            sourceProjectionReference: identity.sourceProjectionReference,
            targetProjectionReference: identity.targetProjectionReference,
            sourceWalletVersion: projectedSource.projectionVersion,
            targetWalletVersion: projectedTarget.projectionVersion,
            completedAt, session,
          });
        if (!completed) this.fail("Conversion completion guard conflicted.",
          "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT");
        await this.inject("BEFORE_AUDIT");
        await walletConversionAuditRepository.createOnce({
          ...this.auditBase(request, provider),
          auditKey: createIdempotencyFingerprint(
            WalletConversionAuditAction.COMPLETED, request.conversionKey),
          action: WalletConversionAuditAction.COMPLETED,
          accountingReference: identity.accountingReference,
          transactionReference: identity.accountingTransactionReference,
          sourceProjectionReference: identity.sourceProjectionReference,
          targetProjectionReference: identity.targetProjectionReference,
          sourceWalletVersion: projectedSource.projectionVersion,
          targetWalletVersion: projectedTarget.projectionVersion,
          completedAt,
        }, session);
        await this.inject("BEFORE_COMMIT");
      });
    } finally { await session.endSession(); }
  }

  private async validateCompletedReplay(reference: string) {
    await this.validateProviderReplay(reference,
      WalletConversionProviderOutcome.SUCCESS, true);
    const request = await this.loadRequest(reference);
    if (request.status !== WalletConversionRequestStatus.COMPLETED ||
      !request.completedAt || !request.accountingReference ||
      !request.accountingKey || !request.accountingFingerprint ||
      !request.accountingTransactionReference ||
      !request.accountingTargetWalletId ||
      !request.sourceProjectionReference || !request.targetProjectionReference ||
      !request.sourceWalletVersion || !request.targetWalletVersion ||
      request.failedAt) {
      this.fail("Completed conversion authority is incomplete.",
        "WALLET_CONVERSION_ACCOUNTING_REPLAY_CONFLICT");
    }
    const provider = await this.loadProvider(request);
    const [sourceWallet, targetWallet] = await Promise.all([
      walletRepository.findById(request.sourceWalletId),
      walletRepository.findById(request.accountingTargetWalletId),
    ]);
    if (!sourceWallet || !targetWallet) this.fail(
      "Completed conversion Wallet is missing.",
      "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT");
    this.validateWallet(sourceWallet, request, request.sourceCurrency,
      request.sourceWalletId);
    this.validateWallet(targetWallet, request, request.targetCurrency,
      request.accountingTargetWalletId);
    const identity = this.identity(request, targetWallet);
    if (request.accountingReference !== identity.accountingReference ||
      request.accountingKey !== identity.accountingKey ||
      request.accountingFingerprint !== identity.accountingFingerprint ||
      request.accountingTransactionReference !==
        identity.accountingTransactionReference ||
      request.sourceProjectionReference !== identity.sourceProjectionReference ||
      request.targetProjectionReference !== identity.targetProjectionReference ||
      sourceWallet.projectionVersion < request.sourceWalletVersion ||
      targetWallet.projectionVersion < request.targetWalletVersion) {
      this.fail("Completed conversion accounting identity conflicts.",
        "WALLET_CONVERSION_ACCOUNTING_IDENTITY_CONFLICT");
    }
    const entries = await ledgerEntryRepository.findManyWithPostingKeys({
      transactionId: identity.accountingTransactionReference,
    });
    const ledger = this.validateLedger(request, targetWallet, identity, entries);
    const [sourceProjection, targetProjection] = await Promise.all([
      walletProjectionOperationRepository.findByOperationKey(
        identity.sourceProjectionKey),
      walletProjectionOperationRepository.findByOperationKey(
        identity.targetProjectionKey),
    ]);
    if (!sourceProjection || !targetProjection) this.fail(
      "Completed conversion projection is missing.",
      "WALLET_CONVERSION_ACCOUNTING_PROJECTION_CONFLICT");
    this.validateProjection(request, targetWallet, identity, ledger.source,
      ledger.target, sourceProjection, targetProjection);
    if (sourceProjection.projectionVersion !== request.sourceWalletVersion ||
      targetProjection.projectionVersion !== request.targetWalletVersion) {
      this.fail("Completed conversion Wallet versions conflict.",
        "WALLET_CONVERSION_ACCOUNTING_REPLAY_CONFLICT");
    }
    const audits = await WalletConversionAudit.find({
      conversionReference: reference,
      action: WalletConversionAuditAction.COMPLETED,
    });
    if (audits.length !== 1 ||
      audits[0].accountingReference !== identity.accountingReference ||
      audits[0].transactionReference !==
        identity.accountingTransactionReference ||
      audits[0].sourceProjectionReference !==
        identity.sourceProjectionReference ||
      audits[0].targetProjectionReference !==
        identity.targetProjectionReference ||
      audits[0].sourceWalletVersion !== request.sourceWalletVersion ||
      audits[0].targetWalletVersion !== request.targetWalletVersion ||
      audits[0].completedAt?.getTime() !== request.completedAt.getTime()) {
      this.fail("Completed conversion audit conflicts.",
        "WALLET_CONVERSION_ACCOUNTING_AUDIT_CONFLICT");
    }
    return toWalletConversionAccountingResponseDto(request);
  }

  private async validateFailedReplay(reference: string) {
    await this.validateProviderReplay(reference,
      WalletConversionProviderOutcome.FAILURE, true);
    const request = await this.loadRequest(reference);
    if (request.status !== WalletConversionRequestStatus.FAILED ||
      !request.failedAt || request.completedAt || request.accountingReference ||
      request.accountingTransactionReference || request.sourceProjectionReference ||
      request.targetProjectionReference) {
      this.fail("Failed conversion authority conflicts.",
        "WALLET_CONVERSION_ACCOUNTING_REPLAY_CONFLICT");
    }
    const [entries, audits] = await Promise.all([
      ledgerEntryRepository.findMany({
        "metadata.conversionReference": reference,
        type: LedgerEntryType.WALLET_CONVERSION_COMPLETED,
      }),
      WalletConversionAudit.find({ conversionReference: reference,
        action: WalletConversionAuditAction.FAILED }),
    ]);
    if (entries.length || audits.length !== 1 ||
      audits[0].failedAt?.getTime() !== request.failedAt.getTime() ||
      audits[0].providerStatus !==
        InternalWalletConversionProviderRequestStatus.FAILED ||
      audits[0].providerOutcome !== WalletConversionProviderOutcome.FAILURE) {
      this.fail("Failed conversion financial graph conflicts.",
        "WALLET_CONVERSION_ACCOUNTING_REPLAY_CONFLICT");
    }
    return toWalletConversionAccountingResponseDto(request);
  }

  async validateReplay(reference: string) {
    const normalized = this.normalize(reference);
    const request = await this.loadRequest(normalized);
    if (request.status === WalletConversionRequestStatus.COMPLETED) {
      return this.validateCompletedReplay(normalized);
    }
    if (request.status === WalletConversionRequestStatus.FAILED) {
      return this.validateFailedReplay(normalized);
    }
    this.fail("Wallet conversion has no terminal accounting authority.",
      "WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS");
  }

  async account(reference: string) {
    const normalized = this.normalize(reference);
    let request = await this.loadRequest(normalized);
    if ([WalletConversionRequestStatus.COMPLETED,
      WalletConversionRequestStatus.FAILED].includes(request.status)) {
      return this.validateReplay(normalized);
    }
    if (request.status !== WalletConversionRequestStatus.APPROVED ||
      ![WalletConversionProviderOutcome.SUCCESS,
        WalletConversionProviderOutcome.FAILURE]
        .includes(request.providerOutcome as WalletConversionProviderOutcome)) {
      this.fail("Wallet conversion is not eligible for accounting.",
        "WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS");
    }
    const providerOutcome = request.providerOutcome as
      WalletConversionProviderOutcome;
    await this.validateProviderReplay(normalized, providerOutcome);
    let lastError: unknown;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        if (providerOutcome === WalletConversionProviderOutcome.FAILURE) {
          await this.finalizeFailed(normalized);
        } else {
          await this.completeTransaction(normalized);
        }
        return this.validateReplay(normalized);
      } catch (error) {
        lastError = error;
        const winner = await this.loadRequest(normalized);
        if ([WalletConversionRequestStatus.COMPLETED,
          WalletConversionRequestStatus.FAILED].includes(winner.status)) {
          return this.validateReplay(normalized);
        }
        if (error instanceof WalletConversionAccountingError &&
          error.code !== "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT") {
          throw error;
        }
        if (!isTransient(error) && !(error instanceof
          WalletConversionAccountingError && error.code ===
            "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT")) break;
        request = winner;
      }
    }
    if (lastError instanceof WalletConversionAccountingError) throw lastError;
    this.fail("Wallet conversion accounting transaction conflicted.",
      "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT", lastError);
  }
}

export const walletConversionAccountingService =
  new WalletConversionAccountingService();
