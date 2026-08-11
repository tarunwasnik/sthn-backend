"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.topUpAccountingOrchestratorService = exports.TopUpAccountingOrchestratorService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const ledger_service_1 = require("./ledger.service");
const walletProjection_service_1 = require("../wallet/walletProjection.service");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const walletTopUpRequest_repository_1 = require("../../repositories/walletTopUpRequest.repository");
const internalTopUpFunding_repository_1 = require("../../repositories/internalTopUpFunding.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletTopUpRequestStatus_enum_1 = require("../../enums/financial/walletTopUpRequestStatus.enum");
const internalTopUpFundingStatus_enum_1 = require("../../enums/financial/internalTopUpFundingStatus.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const WalletTopUpAccountingError_1 = require("../../errors/financial/WalletTopUpAccountingError");
class TopUpAccountingOrchestratorService {
    error(message, code, statusCode = 409) {
        return new WalletTopUpAccountingError_1.WalletTopUpAccountingError(message, WalletTopUpAccountingError_1.WalletTopUpAccountingErrorCode[code], statusCode);
    }
    accountingIdentity(request, funding) {
        const seed = `${request.topUpReference}|${funding.fundingReference}|${request.userId}|${request.walletId}|${request.amount}|${request.currency}`;
        const transactionId = `TUA-${crypto_1.default.createHash("sha256").update(seed).digest("hex").slice(0, 24).toUpperCase()}`;
        return {
            transactionId,
            postingKey: `wallet-top-up:${transactionId}:ledger`,
            operationKey: `wallet-top-up:${transactionId}:projection`,
        };
    }
    projectionReference(operationKey) {
        return `WPO-${crypto_1.default.createHash("sha256").update(operationKey).digest("hex").slice(0, 16).toUpperCase()}`;
    }
    projectionFingerprint(request, operationKey, ledgerEntryId) {
        const canonical = [
            request.userId.toString(), request.currency, operationKey,
            request.amount, 0, 0, 0, 0, 0, ledgerEntryId.toString(),
        ].join("|");
        return crypto_1.default.createHash("sha256").update(canonical).digest("hex");
    }
    validateFundingIdentity(request, funding) {
        if (!request.providerFundingId || !request.providerFundingReference) {
            throw this.error("Top-up request provider link is missing.", "PROVIDER_LINK_MISSING");
        }
        if (!funding || !funding._id.equals(request.providerFundingId) ||
            funding.fundingReference !== request.providerFundingReference ||
            !funding.topUpRequestId.equals(request._id) ||
            funding.topUpReference !== request.topUpReference) {
            throw this.error("Provider funding identity conflicts with the top-up request.", "PROVIDER_LINK_CONFLICT");
        }
        if (funding.status !== internalTopUpFundingStatus_enum_1.InternalTopUpFundingStatus.SUCCEEDED) {
            throw this.error("Provider funding is not successful.", "PROVIDER_NOT_SUCCEEDED");
        }
        if (funding.amount !== request.amount) {
            throw this.error("Provider funding amount conflicts with the top-up request.", "AMOUNT_CONFLICT");
        }
        if (funding.currency !== request.currency) {
            throw this.error("Provider funding currency conflicts with the top-up request.", "CURRENCY_CONFLICT");
        }
    }
    validateLedgerIdentity(request, funding, ledger, identity) {
        const metadata = ledger.metadata ?? {};
        if (ledger.transactionId !== identity.transactionId ||
            ledger.type !== ledgerEntryType_enum_1.LedgerEntryType.WALLET_TOP_UP ||
            ledger.source !== ledgerSource_enum_1.LedgerSource.INTERNAL_TOP_UP_FUNDING ||
            ledger.direction !== moneyDirection_enum_1.MoneyDirection.CREDIT ||
            ledger.account !== ledgerAccount_enum_1.LedgerAccount.CASH ||
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
    validateProjectionIdentity(request, ledger, operation, identity) {
        const ledgerId = ledger._id;
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
            throw this.error("Wallet projection operation identity conflicts with top-up accounting.", "PROJECTION_IDENTITY_CONFLICT");
        }
    }
    validateProcessingRequestLinks(request, funding, ledger, operation, identity) {
        if (request.accountingTransactionId !== undefined &&
            request.accountingTransactionId !== identity.transactionId) {
            throw this.error("Stored accounting transaction identity conflicts with this top-up.", "TRANSACTION_CONFLICT");
        }
        if ((request.ledgerEntryId !== undefined || request.ledgerReference !== undefined) && !ledger) {
            throw this.error("Stored Ledger link has no deterministic Ledger entry.", "LEDGER_NOT_FOUND", 404);
        }
        if ((request.walletProjectionOperationId !== undefined ||
            request.walletProjectionOperationReference !== undefined) && !operation) {
            throw this.error("Stored projection link has no deterministic projection operation.", "PROJECTION_NOT_FOUND", 404);
        }
        if (ledger)
            this.validateLedgerIdentity(request, funding, ledger, identity);
        if (operation) {
            if (!ledger) {
                throw this.error("Projection operation exists without its expected Ledger entry.", "LEDGER_NOT_FOUND", 404);
            }
            this.validateProjectionIdentity(request, ledger, operation, identity);
        }
    }
    async establishOrReuseLedger(request, funding, identity, discovered) {
        let ledger = discovered;
        if (!ledger) {
            try {
                ledger = await ledger_service_1.ledgerService.createCredit({
                    type: ledgerEntryType_enum_1.LedgerEntryType.WALLET_TOP_UP,
                    source: ledgerSource_enum_1.LedgerSource.INTERNAL_TOP_UP_FUNDING,
                    account: ledgerAccount_enum_1.LedgerAccount.CASH,
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
            }
            catch (error) {
                ledger = await ledgerEntry_repository_1.ledgerEntryRepository.findByPostingKey(identity.postingKey);
                if (!ledger)
                    throw error;
            }
        }
        this.validateLedgerIdentity(request, funding, ledger, identity);
        return ledger;
    }
    async establishOrReuseProjection(request, ledger, identity, discovered) {
        let operation = discovered;
        if (!operation) {
            await walletProjection_service_1.walletProjectionService.applyProjectionMutation({
                userId: request.userId,
                currency: request.currency,
                operationKey: identity.operationKey,
                deltas: { availableBalance: request.amount },
                ledgerEntryIds: [ledger._id],
            });
            operation = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.operationKey);
            if (!operation) {
                throw this.error("Wallet projection operation is missing after projection.", "PROJECTION_NOT_FOUND", 500);
            }
        }
        this.validateProjectionIdentity(request, ledger, operation, identity);
        return operation;
    }
    async validateCompletedAccountingReplay(topUpRequest) {
        const request = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReferenceForAccounting(topUpRequest.topUpReference);
        if (!request)
            throw this.error("Top-up request was not found.", "NOT_FOUND", 404);
        if (!request.providerFundingId || !request.providerFundingReference) {
            throw this.error("Completed top-up provider funding link is missing.", "PROVIDER_LINK_MISSING", 500);
        }
        if (!request.ledgerEntryId || !request.ledgerReference ||
            !request.walletProjectionOperationId || !request.walletProjectionOperationReference ||
            !request.accountingTransactionId || !(request.completedAt ?? request.accountingCompletedAt)) {
            throw this.error("Completed top-up accounting links are missing.", "LINK_MISSING", 500);
        }
        const funding = await internalTopUpFunding_repository_1.internalTopUpFundingRepository.findByFundingReference(request.providerFundingReference);
        this.validateFundingIdentity(request, funding);
        const identity = this.accountingIdentity(request, funding);
        if (request.accountingTransactionId !== identity.transactionId) {
            throw this.error("Completed accounting transaction identity conflicts with this top-up.", "TRANSACTION_CONFLICT");
        }
        const ledger = await ledgerEntry_repository_1.ledgerEntryRepository.findById(request.ledgerEntryId);
        if (!ledger)
            throw this.error("Linked Ledger entry was not found.", "LEDGER_NOT_FOUND", 404);
        this.validateLedgerIdentity(request, funding, ledger, identity);
        const operation = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findById(request.walletProjectionOperationId);
        if (!operation)
            throw this.error("Linked Wallet projection operation was not found.", "PROJECTION_NOT_FOUND", 404);
        this.validateProjectionIdentity(request, ledger, operation, identity);
        const wallet = await wallet_repository_1.walletRepository.findById(request.walletId);
        if (!wallet)
            throw this.error("Linked Wallet was not found.", "WALLET_NOT_FOUND", 404);
        if (!wallet._id.equals(request.walletId) || !wallet.userId.equals(request.userId)) {
            throw this.error("Linked Wallet ownership conflicts with the completed top-up request.", "WALLET_OWNERSHIP_CONFLICT");
        }
        if (wallet.currency !== request.currency) {
            throw this.error("Linked Wallet currency conflicts with completed top-up accounting.", "CURRENCY_CONFLICT");
        }
        const completedAt = request.completedAt ?? request.accountingCompletedAt;
        if (!completedAt)
            throw this.error("Completed top-up accounting timestamp is missing.", "LINK_MISSING", 500);
        return {
            topUpReference: request.topUpReference,
            topUpStatus: walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.COMPLETED,
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
    validateCompletionWinner(winner, replay, funding, ledger, operation, identity) {
        if (!winner.providerFundingId?.equals(funding._id) ||
            winner.providerFundingReference !== funding.fundingReference ||
            !winner.ledgerEntryId?.equals(ledger._id) ||
            winner.ledgerReference !== ledger.ledgerReference ||
            !winner.walletProjectionOperationId?.equals(operation._id) ||
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
    async completedWinnerOrThrow(request, funding, ledger, operation, identity) {
        const replay = await this.validateCompletedAccountingReplay(request);
        const winner = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReferenceForAccounting(request.topUpReference);
        if (!winner || winner.status !== walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.COMPLETED) {
            throw this.error("Completed accounting winner could not be reloaded.", "INTEGRITY_ERROR", 500);
        }
        this.validateCompletionWinner(winner, replay, funding, ledger, operation, identity);
        return replay;
    }
    async completeProcessingOrRecover(request, funding, ledger, operation, identity) {
        const completedAt = new Date();
        const complete = () => walletTopUpRequest_repository_1.walletTopUpRequestRepository.completeProcessingWithAccounting({
            topUpReference: request.topUpReference,
            providerFundingReference: funding.fundingReference,
            ledgerEntryId: ledger._id,
            ledgerReference: ledger.ledgerReference,
            walletProjectionOperationId: operation._id,
            walletProjectionOperationReference: operation.operationReference,
            accountingTransactionId: identity.transactionId,
            completedAt,
        });
        const first = await complete();
        if (first)
            return this.validateCompletedAccountingReplay(first);
        const afterFirstLoss = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReferenceForAccounting(request.topUpReference);
        if (!afterFirstLoss) {
            throw this.error("Top-up request disappeared during completion.", "INTEGRITY_ERROR", 500);
        }
        if (afterFirstLoss.status === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.COMPLETED) {
            return this.completedWinnerOrThrow(afterFirstLoss, funding, ledger, operation, identity);
        }
        if (afterFirstLoss.status !== walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING) {
            throw this.error("Top-up request changed to an invalid accounting status.", "INVALID_REQUEST_STATUS");
        }
        const second = await complete();
        if (second)
            return this.validateCompletedAccountingReplay(second);
        const afterSecondLoss = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReferenceForAccounting(request.topUpReference);
        if (!afterSecondLoss) {
            throw this.error("Top-up request disappeared during completion retry.", "INTEGRITY_ERROR", 500);
        }
        if (afterSecondLoss.status === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.COMPLETED) {
            return this.completedWinnerOrThrow(afterSecondLoss, funding, ledger, operation, identity);
        }
        if (afterSecondLoss.status !== walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING) {
            throw this.error("Top-up request changed to an invalid accounting status.", "INVALID_REQUEST_STATUS");
        }
        throw this.error("Top-up completion conflicted after one retry.", "COMPLETION_CONFLICT");
    }
    async complete(topUpReference) {
        const request = await walletTopUpRequest_repository_1.walletTopUpRequestRepository.findByReferenceForAccounting(topUpReference);
        if (!request)
            throw this.error("Top-up request was not found.", "NOT_FOUND", 404);
        if (request.status === walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.COMPLETED) {
            return this.validateCompletedAccountingReplay(request);
        }
        if (request.status !== walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING) {
            throw this.error("Top-up request is not ready for accounting.", "INVALID_REQUEST_STATUS");
        }
        const funding = await internalTopUpFunding_repository_1.internalTopUpFundingRepository.findByTopUpRequestId(request._id);
        this.validateFundingIdentity(request, funding);
        const identity = this.accountingIdentity(request, funding);
        const [discoveredLedger, discoveredOperation] = await Promise.all([
            ledgerEntry_repository_1.ledgerEntryRepository.findByPostingKey(identity.postingKey),
            walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.operationKey),
        ]);
        this.validateProcessingRequestLinks(request, funding, discoveredLedger, discoveredOperation, identity);
        const wallet = await wallet_repository_1.walletRepository.findById(request.walletId);
        if (!wallet)
            throw this.error("Top-up Wallet was not found.", "WALLET_NOT_FOUND", 404);
        if (!wallet.userId.equals(request.userId)) {
            throw this.error("Top-up Wallet ownership is invalid.", "WALLET_OWNERSHIP_CONFLICT");
        }
        if (wallet.currency !== request.currency) {
            throw this.error("Top-up Wallet currency is invalid.", "CURRENCY_CONFLICT");
        }
        const ledger = await this.establishOrReuseLedger(request, funding, identity, discoveredLedger);
        const operation = await this.establishOrReuseProjection(request, ledger, identity, discoveredOperation);
        return this.completeProcessingOrRecover(request, funding, ledger, operation, identity);
    }
}
exports.TopUpAccountingOrchestratorService = TopUpAccountingOrchestratorService;
exports.topUpAccountingOrchestratorService = new TopUpAccountingOrchestratorService();
