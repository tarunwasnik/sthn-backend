import crypto from "crypto";
import { Types } from "mongoose";

import { ledgerService } from "./ledger.service";
import { walletProjectionService } from "../wallet/walletProjection.service";
import { walletProjectionOperationRepository } from "../../repositories/wallet/walletProjectionOperation.repository";
import { walletTopUpRequestRepository } from "../../repositories/walletTopUpRequest.repository";
import { internalTopUpFundingRepository } from "../../repositories/internalTopUpFunding.repository";
import { ledgerEntryRepository } from "../../repositories/ledgerEntry.repository";
import { walletRepository } from "../../repositories/wallet/wallet.repository";
import { IWalletTopUpRequest } from "../../models/walletTopUpRequest.model";
import { IInternalTopUpFunding } from "../../models/internalTopUpFunding.model";
import { ILedgerEntry } from "../../models/ledgerEntry.model";
import { WalletProjectionOperationDocument } from "../../models/walletProjectionOperation.model";
import { WalletTopUpRequestStatus } from "../../enums/financial/walletTopUpRequestStatus.enum";
import { InternalTopUpFundingStatus } from "../../enums/financial/internalTopUpFundingStatus.enum";
import { LedgerEntryType } from "../../enums/financial/ledgerEntryType.enum";
import { LedgerSource } from "../../enums/financial/ledgerSource.enum";
import { LedgerAccount } from "../../enums/financial/ledgerAccount.enum";
import { MoneyDirection } from "../../enums/financial/moneyDirection.enum";
import {
  WalletTopUpAccountingError,
  WalletTopUpAccountingErrorCode as ErrorCode,
} from "../../errors/financial/WalletTopUpAccountingError";

interface TopUpAccountingResult {
  topUpReference: string;
  topUpStatus: WalletTopUpRequestStatus;
  amount: number;
  currency: string;
  providerFundingReference: string;
  providerStatus: InternalTopUpFundingStatus;
  ledgerReference: string;
  projectionOperationReference: string;
  transactionId: string;
  wallet: { currency: string; balance: number };
  completedAt: Date;
}

interface AccountingIdentity {
  transactionId: string;
  postingKey: string;
  operationKey: string;
}

export class TopUpAccountingOrchestratorService {
  private error(
    message: string,
    code: keyof typeof ErrorCode,
    statusCode = 409,
  ): WalletTopUpAccountingError {
    return new WalletTopUpAccountingError(message, ErrorCode[code], statusCode);
  }

  private accountingIdentity(
    request: IWalletTopUpRequest,
    funding: IInternalTopUpFunding,
  ): AccountingIdentity {
    const seed = `${request.topUpReference}|${funding.fundingReference}|${request.userId}|${request.walletId}|${request.amount}|${request.currency}`;
    const transactionId = `TUA-${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 24).toUpperCase()}`;
    return {
      transactionId,
      postingKey: `wallet-top-up:${transactionId}:ledger`,
      operationKey: `wallet-top-up:${transactionId}:projection`,
    };
  }

  private projectionReference(operationKey: string): string {
    return `WPO-${crypto.createHash("sha256").update(operationKey).digest("hex").slice(0, 16).toUpperCase()}`;
  }

  private projectionFingerprint(
    request: IWalletTopUpRequest,
    operationKey: string,
    ledgerEntryId: Types.ObjectId,
  ): string {
    const canonical = [
      request.userId.toString(), request.currency, operationKey,
      request.amount, 0, 0, 0, 0, 0, ledgerEntryId.toString(),
    ].join("|");
    return crypto.createHash("sha256").update(canonical).digest("hex");
  }

  private validateFundingIdentity(
    request: IWalletTopUpRequest,
    funding: IInternalTopUpFunding | null,
  ): asserts funding is IInternalTopUpFunding {
    if (!request.providerFundingId || !request.providerFundingReference) {
      throw this.error("Top-up request provider link is missing.", "PROVIDER_LINK_MISSING");
    }
    if (!funding || !funding._id.equals(request.providerFundingId) ||
      funding.fundingReference !== request.providerFundingReference ||
      !funding.topUpRequestId.equals(request._id) ||
      funding.topUpReference !== request.topUpReference) {
      throw this.error("Provider funding identity conflicts with the top-up request.", "PROVIDER_LINK_CONFLICT");
    }
    if (funding.status !== InternalTopUpFundingStatus.SUCCEEDED) {
      throw this.error("Provider funding is not successful.", "PROVIDER_NOT_SUCCEEDED");
    }
    if (funding.amount !== request.amount) {
      throw this.error("Provider funding amount conflicts with the top-up request.", "AMOUNT_CONFLICT");
    }
    if (funding.currency !== request.currency) {
      throw this.error("Provider funding currency conflicts with the top-up request.", "CURRENCY_CONFLICT");
    }
  }

  private validateLedgerIdentity(
    request: IWalletTopUpRequest,
    funding: IInternalTopUpFunding,
    ledger: ILedgerEntry,
    identity: AccountingIdentity,
  ): void {
    const metadata = ledger.metadata ?? {};
    if (ledger.transactionId !== identity.transactionId ||
      ledger.type !== LedgerEntryType.WALLET_TOP_UP ||
      ledger.source !== LedgerSource.INTERNAL_TOP_UP_FUNDING ||
      ledger.direction !== MoneyDirection.CREDIT ||
      ledger.account !== LedgerAccount.CASH ||
      !ledger.userId?.equals(request.userId) ||
      metadata.topUpReference !== request.topUpReference ||
      metadata.providerFundingReference !== funding.fundingReference ||
      (request.ledgerEntryId !== undefined && !ledger._id.equals(request.ledgerEntryId)) ||
      (request.ledgerReference !== undefined && ledger.ledgerReference !== request.ledgerReference)) {
      throw this.error("Ledger identity conflicts with top-up accounting.", "LEDGER_IDENTITY_CONFLICT");
    }
    if (ledger.amount !== request.amount) {
      throw this.error("Ledger amount conflicts with top-up accounting.", "AMOUNT_CONFLICT");
    }
    if (ledger.currency !== request.currency) {
      throw this.error("Ledger currency conflicts with top-up accounting.", "CURRENCY_CONFLICT");
    }
  }

  private validateProjectionIdentity(
    request: IWalletTopUpRequest,
    ledger: ILedgerEntry,
    operation: WalletProjectionOperationDocument,
    identity: AccountingIdentity,
  ): void {
    const ledgerId = ledger._id as Types.ObjectId;
    if (operation.operationReference !== this.projectionReference(identity.operationKey) ||
      operation.operationKey !== identity.operationKey ||
      !operation.walletId.equals(request.walletId) ||
      !operation.userId.equals(request.userId) ||
      operation.currency !== request.currency ||
      operation.deltas.availableBalance !== request.amount ||
      operation.deltas.reservedBalance !== 0 ||
      operation.deltas.lockedBalance !== 0 ||
      operation.ledgerEntryIds.length !== 1 ||
      !operation.ledgerEntryIds[0].equals(ledgerId) ||
      operation.fingerprint !== this.projectionFingerprint(request, identity.operationKey, ledgerId) ||
      (request.walletProjectionOperationId !== undefined && !operation._id.equals(request.walletProjectionOperationId)) ||
      (request.walletProjectionOperationReference !== undefined &&
        operation.operationReference !== request.walletProjectionOperationReference)) {
      throw this.error(
        "Wallet projection operation identity conflicts with top-up accounting.",
        "PROJECTION_IDENTITY_CONFLICT",
      );
    }
  }

  private validateProcessingRequestLinks(
    request: IWalletTopUpRequest,
    funding: IInternalTopUpFunding,
    ledger: ILedgerEntry | null,
    operation: WalletProjectionOperationDocument | null,
    identity: AccountingIdentity,
  ): void {
    if (request.accountingTransactionId !== undefined &&
      request.accountingTransactionId !== identity.transactionId) {
      throw this.error(
        "Stored accounting transaction identity conflicts with this top-up.",
        "TRANSACTION_CONFLICT",
      );
    }
    if ((request.ledgerEntryId !== undefined || request.ledgerReference !== undefined) && !ledger) {
      throw this.error("Stored Ledger link has no deterministic Ledger entry.", "LEDGER_NOT_FOUND", 404);
    }
    if ((request.walletProjectionOperationId !== undefined ||
      request.walletProjectionOperationReference !== undefined) && !operation) {
      throw this.error("Stored projection link has no deterministic projection operation.", "PROJECTION_NOT_FOUND", 404);
    }
    if (ledger) this.validateLedgerIdentity(request, funding, ledger, identity);
    if (operation) {
      if (!ledger) {
        throw this.error("Projection operation exists without its expected Ledger entry.", "LEDGER_NOT_FOUND", 404);
      }
      this.validateProjectionIdentity(request, ledger, operation, identity);
    }
  }

  private async establishOrReuseLedger(
    request: IWalletTopUpRequest,
    funding: IInternalTopUpFunding,
    identity: AccountingIdentity,
    discovered: ILedgerEntry | null,
  ): Promise<ILedgerEntry> {
    let ledger = discovered;
    if (!ledger) {
      try {
        ledger = await ledgerService.createCredit({
          type: LedgerEntryType.WALLET_TOP_UP,
          source: LedgerSource.INTERNAL_TOP_UP_FUNDING,
          account: LedgerAccount.CASH,
          money: { amount: request.amount, currency: request.currency },
          transactionId: identity.transactionId,
          userId: request.userId.toString(),
          idempotencyKey: identity.transactionId,
          postingKey: identity.postingKey,
          description: "Wallet top-up credit",
          metadata: {
            topUpReference: request.topUpReference,
            providerFundingReference: funding.fundingReference,
          },
        });
      } catch (error) {
        ledger = await ledgerEntryRepository.findByPostingKey(identity.postingKey);
        if (!ledger) throw error;
      }
    }
    this.validateLedgerIdentity(request, funding, ledger, identity);
    return ledger;
  }

  private async establishOrReuseProjection(
    request: IWalletTopUpRequest,
    ledger: ILedgerEntry,
    identity: AccountingIdentity,
    discovered: WalletProjectionOperationDocument | null,
  ): Promise<WalletProjectionOperationDocument> {
    let operation = discovered;
    if (!operation) {
      await walletProjectionService.applyProjectionMutation({
        userId: request.userId,
        currency: request.currency,
        operationKey: identity.operationKey,
        deltas: { availableBalance: request.amount },
        ledgerEntryIds: [ledger._id as Types.ObjectId],
      });
      operation = await walletProjectionOperationRepository.findByOperationKey(identity.operationKey);
      if (!operation) {
        throw this.error("Wallet projection operation is missing after projection.", "PROJECTION_NOT_FOUND", 500);
      }
    }
    this.validateProjectionIdentity(request, ledger, operation, identity);
    return operation;
  }

  private async validateCompletedAccountingReplay(
    topUpRequest: IWalletTopUpRequest,
  ): Promise<TopUpAccountingResult> {
    const request = await walletTopUpRequestRepository.findByReferenceForAccounting(topUpRequest.topUpReference);
    if (!request) throw this.error("Top-up request was not found.", "NOT_FOUND", 404);
    if (!request.providerFundingId || !request.providerFundingReference) {
      throw this.error("Completed top-up provider funding link is missing.", "PROVIDER_LINK_MISSING", 500);
    }
    if (!request.ledgerEntryId || !request.ledgerReference ||
      !request.walletProjectionOperationId || !request.walletProjectionOperationReference ||
      !request.accountingTransactionId || !(request.completedAt ?? request.accountingCompletedAt)) {
      throw this.error("Completed top-up accounting links are missing.", "LINK_MISSING", 500);
    }

    const funding = await internalTopUpFundingRepository.findByFundingReference(request.providerFundingReference);
    this.validateFundingIdentity(request, funding);
    const identity = this.accountingIdentity(request, funding);
    if (request.accountingTransactionId !== identity.transactionId) {
      throw this.error("Completed accounting transaction identity conflicts with this top-up.", "TRANSACTION_CONFLICT");
    }

    const ledger = await ledgerEntryRepository.findById(request.ledgerEntryId);
    if (!ledger) throw this.error("Linked Ledger entry was not found.", "LEDGER_NOT_FOUND", 404);
    this.validateLedgerIdentity(request, funding, ledger, identity);

    const operation = await walletProjectionOperationRepository.findById(request.walletProjectionOperationId);
    if (!operation) throw this.error("Linked Wallet projection operation was not found.", "PROJECTION_NOT_FOUND", 404);
    this.validateProjectionIdentity(request, ledger, operation, identity);

    const wallet = await walletRepository.findById(request.walletId);
    if (!wallet) throw this.error("Linked Wallet was not found.", "WALLET_NOT_FOUND", 404);
    if (!wallet._id.equals(request.walletId) || !wallet.userId.equals(request.userId)) {
      throw this.error("Linked Wallet ownership conflicts with the completed top-up request.", "WALLET_OWNERSHIP_CONFLICT");
    }
    if (wallet.currency !== request.currency) {
      throw this.error("Linked Wallet currency conflicts with completed top-up accounting.", "CURRENCY_CONFLICT");
    }

    const completedAt = request.completedAt ?? request.accountingCompletedAt;
    if (!completedAt) throw this.error("Completed top-up accounting timestamp is missing.", "LINK_MISSING", 500);
    return {
      topUpReference: request.topUpReference,
      topUpStatus: WalletTopUpRequestStatus.COMPLETED,
      amount: request.amount,
      currency: request.currency,
      providerFundingReference: funding.fundingReference,
      providerStatus: funding.status,
      ledgerReference: ledger.ledgerReference,
      projectionOperationReference: operation.operationReference,
      transactionId: request.accountingTransactionId,
      wallet: { currency: wallet.currency, balance: wallet.availableBalance },
      completedAt,
    };
  }

  private validateCompletionWinner(
    winner: IWalletTopUpRequest,
    replay: TopUpAccountingResult,
    funding: IInternalTopUpFunding,
    ledger: ILedgerEntry,
    operation: WalletProjectionOperationDocument,
    identity: AccountingIdentity,
  ): void {
    if (!winner.providerFundingId?.equals(funding._id as Types.ObjectId) ||
      winner.providerFundingReference !== funding.fundingReference ||
      !winner.ledgerEntryId?.equals(ledger._id as Types.ObjectId) ||
      winner.ledgerReference !== ledger.ledgerReference ||
      !winner.walletProjectionOperationId?.equals(operation._id as Types.ObjectId) ||
      winner.walletProjectionOperationReference !== operation.operationReference ||
      winner.accountingTransactionId !== identity.transactionId ||
      winner.amount !== replay.amount || winner.currency !== replay.currency ||
      replay.providerFundingReference !== funding.fundingReference ||
      replay.ledgerReference !== ledger.ledgerReference ||
      replay.projectionOperationReference !== operation.operationReference ||
      replay.transactionId !== identity.transactionId) {
      throw this.error("Completed accounting winner conflicts with this execution.", "COMPLETION_CONFLICT");
    }
  }

  private async completedWinnerOrThrow(
    request: IWalletTopUpRequest,
    funding: IInternalTopUpFunding,
    ledger: ILedgerEntry,
    operation: WalletProjectionOperationDocument,
    identity: AccountingIdentity,
  ): Promise<TopUpAccountingResult> {
    const replay = await this.validateCompletedAccountingReplay(request);
    const winner = await walletTopUpRequestRepository.findByReferenceForAccounting(request.topUpReference);
    if (!winner || winner.status !== WalletTopUpRequestStatus.COMPLETED) {
      throw this.error("Completed accounting winner could not be reloaded.", "INTEGRITY_ERROR", 500);
    }
    this.validateCompletionWinner(winner, replay, funding, ledger, operation, identity);
    return replay;
  }

  private async completeProcessingOrRecover(
    request: IWalletTopUpRequest,
    funding: IInternalTopUpFunding,
    ledger: ILedgerEntry,
    operation: WalletProjectionOperationDocument,
    identity: AccountingIdentity,
  ): Promise<TopUpAccountingResult> {
    const completedAt = new Date();
    const complete = () => walletTopUpRequestRepository.completeProcessingWithAccounting({
      topUpReference: request.topUpReference,
      providerFundingReference: funding.fundingReference,
      ledgerEntryId: ledger._id as Types.ObjectId,
      ledgerReference: ledger.ledgerReference,
      walletProjectionOperationId: operation._id as Types.ObjectId,
      walletProjectionOperationReference: operation.operationReference,
      accountingTransactionId: identity.transactionId,
      completedAt,
    });

    const first = await complete();
    if (first) return this.validateCompletedAccountingReplay(first);

    const afterFirstLoss = await walletTopUpRequestRepository.findByReferenceForAccounting(request.topUpReference);
    if (!afterFirstLoss) {
      throw this.error("Top-up request disappeared during completion.", "INTEGRITY_ERROR", 500);
    }
    if (afterFirstLoss.status === WalletTopUpRequestStatus.COMPLETED) {
      return this.completedWinnerOrThrow(afterFirstLoss, funding, ledger, operation, identity);
    }
    if (afterFirstLoss.status !== WalletTopUpRequestStatus.PROCESSING) {
      throw this.error("Top-up request changed to an invalid accounting status.", "INVALID_REQUEST_STATUS");
    }

    const second = await complete();
    if (second) return this.validateCompletedAccountingReplay(second);

    const afterSecondLoss = await walletTopUpRequestRepository.findByReferenceForAccounting(request.topUpReference);
    if (!afterSecondLoss) {
      throw this.error("Top-up request disappeared during completion retry.", "INTEGRITY_ERROR", 500);
    }
    if (afterSecondLoss.status === WalletTopUpRequestStatus.COMPLETED) {
      return this.completedWinnerOrThrow(afterSecondLoss, funding, ledger, operation, identity);
    }
    if (afterSecondLoss.status !== WalletTopUpRequestStatus.PROCESSING) {
      throw this.error("Top-up request changed to an invalid accounting status.", "INVALID_REQUEST_STATUS");
    }
    throw this.error("Top-up completion conflicted after one retry.", "COMPLETION_CONFLICT");
  }

  async complete(topUpReference: string): Promise<TopUpAccountingResult> {
    const request = await walletTopUpRequestRepository.findByReferenceForAccounting(topUpReference);
    if (!request) throw this.error("Top-up request was not found.", "NOT_FOUND", 404);
    if (request.status === WalletTopUpRequestStatus.COMPLETED) {
      return this.validateCompletedAccountingReplay(request);
    }
    if (request.status !== WalletTopUpRequestStatus.PROCESSING) {
      throw this.error("Top-up request is not ready for accounting.", "INVALID_REQUEST_STATUS");
    }

    const funding = await internalTopUpFundingRepository.findByTopUpRequestId(request._id);
    this.validateFundingIdentity(request, funding);
    const identity = this.accountingIdentity(request, funding);

    const [discoveredLedger, discoveredOperation] = await Promise.all([
      ledgerEntryRepository.findByPostingKey(identity.postingKey),
      walletProjectionOperationRepository.findByOperationKey(identity.operationKey),
    ]);
    this.validateProcessingRequestLinks(
      request, funding, discoveredLedger, discoveredOperation, identity,
    );

    const wallet = await walletRepository.findById(request.walletId);
    if (!wallet) throw this.error("Top-up Wallet was not found.", "WALLET_NOT_FOUND", 404);
    if (!wallet.userId.equals(request.userId)) {
      throw this.error("Top-up Wallet ownership is invalid.", "WALLET_OWNERSHIP_CONFLICT");
    }
    if (wallet.currency !== request.currency) {
      throw this.error("Top-up Wallet currency is invalid.", "CURRENCY_CONFLICT");
    }

    const ledger = await this.establishOrReuseLedger(
      request, funding, identity, discoveredLedger,
    );
    const operation = await this.establishOrReuseProjection(
      request, ledger, identity, discoveredOperation,
    );
    return this.completeProcessingOrRecover(request, funding, ledger, operation, identity);
  }
}

export const topUpAccountingOrchestratorService = new TopUpAccountingOrchestratorService();
