"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletConversionAccountingService = exports.WalletConversionAccountingService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const walletConversionAccounting_response_dto_1 = require("../../dtos/wallet/walletConversionAccounting.response.dto");
const internalWalletConversionProviderRequestStatus_enum_1 = require("../../enums/financial/internalWalletConversionProviderRequestStatus.enum");
const ledgerAccount_enum_1 = require("../../enums/financial/ledgerAccount.enum");
const ledgerEntryType_enum_1 = require("../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../enums/financial/ledgerSource.enum");
const moneyDirection_enum_1 = require("../../enums/financial/moneyDirection.enum");
const walletConversionAuditAction_enum_1 = require("../../enums/financial/walletConversionAuditAction.enum");
const walletConversionProviderOutcome_enum_1 = require("../../enums/financial/walletConversionProviderOutcome.enum");
const walletConversionRequestStatus_enum_1 = require("../../enums/financial/walletConversionRequestStatus.enum");
const WalletConversionAccountingError_1 = require("../../errors/financial/WalletConversionAccountingError");
const WalletError_1 = require("../../errors/financial/WalletError");
const walletConversionAudit_model_1 = require("../../models/walletConversionAudit.model");
const internalWalletConversionProviderRequest_repository_1 = require("../../repositories/internalProvider/internalWalletConversionProviderRequest.repository");
const ledgerEntry_repository_1 = require("../../repositories/ledgerEntry.repository");
const walletConversionAudit_repository_1 = require("../../repositories/walletConversionAudit.repository");
const walletConversionRequest_repository_1 = require("../../repositories/walletConversionRequest.repository");
const wallet_repository_1 = require("../../repositories/wallet/wallet.repository");
const walletProjectionOperation_repository_1 = require("../../repositories/wallet/walletProjectionOperation.repository");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const walletConversionAccountingIdentity_util_1 = require("../../utils/financial/walletConversionAccountingIdentity.util");
const walletCreation_service_1 = require("../wallet/walletCreation.service");
const walletProjection_service_1 = require("../wallet/walletProjection.service");
const ledger_service_1 = require("./ledger.service");
const walletConversionProviderExecution_service_1 = require("./walletConversionProviderExecution.service");
const isTransient = (error) => {
    const value = error;
    return value?.code === 112 || value?.code === 251 ||
        value?.hasErrorLabel?.("TransientTransactionError") === true ||
        value?.hasErrorLabel?.("UnknownTransactionCommitResult") === true ||
        (error instanceof WalletError_1.WalletError &&
            error.code === "WALLET_CREATION_CONFLICT");
};
class WalletConversionAccountingService {
    constructor(options = {}) {
        this.options = options;
        this.now = options.now ?? (() => new Date());
    }
    fail(message, code, cause) {
        throw new WalletConversionAccountingError_1.WalletConversionAccountingError(message, code, { cause });
    }
    async inject(stage) {
        await this.options.failureInjector?.(stage);
    }
    normalize(reference) {
        if (typeof reference !== "string" ||
            !(0, reference_util_1.hasReferenceType)(reference, "WALLET_CONVERSION")) {
            this.fail("Wallet conversion accounting input is invalid.", "WALLET_CONVERSION_ACCOUNTING_INVALID_INPUT");
        }
        return reference.trim();
    }
    async loadRequest(reference, session) {
        const request = await walletConversionRequest_repository_1.walletConversionRequestRepository.findByReference(reference, session);
        if (!request)
            this.fail("Wallet conversion request was not found.", "WALLET_CONVERSION_ACCOUNTING_REQUEST_NOT_FOUND");
        return request;
    }
    async loadProvider(request, session) {
        const provider = await internalWalletConversionProviderRequest_repository_1.internalWalletConversionProviderRequestRepository.findByConversion(request.conversionReference, session);
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
            this.fail("Wallet conversion provider authority conflicts.", "WALLET_CONVERSION_ACCOUNTING_PROVIDER_CONFLICT");
        }
        return provider;
    }
    async validateProviderReplay(reference, outcome, allowAccountingTerminal = false) {
        try {
            await walletConversionProviderExecution_service_1.walletConversionProviderExecutionService.validateReplay(reference, outcome, allowAccountingTerminal
                ? { allowAccountingTerminal: true } : undefined);
        }
        catch (error) {
            this.fail("Wallet conversion provider graph conflicts.", "WALLET_CONVERSION_ACCOUNTING_PROVIDER_CONFLICT", error);
        }
    }
    identity(request, targetWallet) {
        if (!request.providerRequestReference ||
            !request.providerExecutionReference) {
            this.fail("Wallet conversion provider identity is incomplete.", "WALLET_CONVERSION_ACCOUNTING_PROVIDER_CONFLICT");
        }
        return (0, walletConversionAccountingIdentity_util_1.deriveWalletConversionAccountingIdentity)({
            conversionReference: request.conversionReference,
            conversionKey: request.conversionKey,
            providerRequestReference: request.providerRequestReference,
            providerExecutionReference: request.providerExecutionReference,
            fxSnapshotReference: request.fxSnapshotReference,
            userId: request.userId, sourceWalletId: request.sourceWalletId,
            targetWalletId: targetWallet._id,
            sourceCurrency: request.sourceCurrency,
            targetCurrency: request.targetCurrency,
            sourceAmount: request.sourceAmount, targetAmount: request.targetAmount,
        });
    }
    validateWallet(wallet, request, currency, expectedId) {
        if ((expectedId && !wallet._id.equals(expectedId)) ||
            !wallet.userId.equals(request.userId) || wallet.currency !== currency ||
            wallet.currentBalance !== wallet.availableBalance +
                wallet.reservedBalance + wallet.lockedBalance ||
            !Number.isSafeInteger(wallet.projectionVersion)) {
            this.fail("Wallet conversion Wallet identity conflicts.", "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT");
        }
    }
    async resolveWallets(request, session) {
        const sourceWallet = await wallet_repository_1.walletRepository.findById(request.sourceWalletId, session);
        if (!sourceWallet)
            this.fail("Source Wallet was not found.", "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT");
        this.validateWallet(sourceWallet, request, request.sourceCurrency, request.sourceWalletId);
        if (sourceWallet.availableBalance < request.sourceAmount) {
            this.fail("Source Wallet available balance is insufficient.", "WALLET_CONVERSION_ACCOUNTING_INSUFFICIENT_BALANCE");
        }
        let targetWallet;
        if (request.targetWalletId) {
            const existing = await wallet_repository_1.walletRepository.findById(request.targetWalletId, session);
            if (!existing)
                this.fail("Bound target Wallet was not found.", "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT");
            targetWallet = existing;
        }
        else {
            try {
                targetWallet = await walletCreation_service_1.walletCreationService.createWallet(request.userId, request.targetCurrency, session);
            }
            catch (error) {
                if (isTransient(error))
                    throw error;
                this.fail("Target Wallet creation failed.", "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT", error);
            }
        }
        this.validateWallet(targetWallet, request, request.targetCurrency, request.targetWalletId);
        if (targetWallet._id.equals(sourceWallet._id)) {
            this.fail("Source and target Wallet identities conflict.", "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT");
        }
        return { sourceWallet, targetWallet };
    }
    validateLedger(request, targetWallet, identity, entries) {
        if (entries.length !== 2)
            this.fail("Wallet conversion Ledger transaction conflicts.", "WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT");
        const source = entries.find((entry) => entry.postingKey === identity.sourcePostingKey);
        const target = entries.find((entry) => entry.postingKey === identity.targetPostingKey);
        const common = (entry) => entry &&
            entry.transactionId === identity.accountingTransactionReference &&
            entry.type === ledgerEntryType_enum_1.LedgerEntryType.WALLET_CONVERSION_COMPLETED &&
            entry.source === ledgerSource_enum_1.LedgerSource.WALLET_CONVERSION &&
            entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE &&
            entry.userId?.equals(request.userId) &&
            entry.metadata?.conversionReference === request.conversionReference &&
            entry.metadata?.accountingReference === identity.accountingReference &&
            entry.metadata?.providerExecutionReference ===
                request.providerExecutionReference &&
            entry.metadata?.fxSnapshotReference === request.fxSnapshotReference;
        if (!common(source) || source.direction !== moneyDirection_enum_1.MoneyDirection.DEBIT ||
            !source.walletId?.equals(request.sourceWalletId) ||
            source.amount !== request.sourceAmount ||
            source.currency !== request.sourceCurrency || !common(target) ||
            target.direction !== moneyDirection_enum_1.MoneyDirection.CREDIT ||
            !target.walletId?.equals(targetWallet._id) ||
            target.amount !== request.targetAmount ||
            target.currency !== request.targetCurrency) {
            this.fail("Wallet conversion Ledger identity conflicts.", "WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT");
        }
        return { source: source, target: target };
    }
    validateProjection(request, targetWallet, identity, sourceLedger, targetLedger, source, target) {
        const valid = source.operationKey === identity.sourceProjectionKey &&
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
        if (!valid)
            this.fail("Wallet conversion projection identity conflicts.", "WALLET_CONVERSION_ACCOUNTING_PROJECTION_CONFLICT");
    }
    auditBase(request, provider) {
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
    async finalizeFailed(reference) {
        const session = await mongoose_1.default.startSession();
        try {
            await session.withTransaction(async () => {
                const request = await this.loadRequest(reference, session);
                if (request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED ||
                    request.providerStatus !==
                        internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.FAILED ||
                    request.providerOutcome !== walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.FAILURE) {
                    this.fail("Conversion is not eligible for failed finalization.", "WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS");
                }
                const provider = await this.loadProvider(request, session);
                const existingEntries = await ledgerEntry_repository_1.ledgerEntryRepository.findMany({
                    "metadata.conversionReference": reference,
                    type: ledgerEntryType_enum_1.LedgerEntryType.WALLET_CONVERSION_COMPLETED,
                }, session);
                if (existingEntries.length)
                    this.fail("Failed conversion contains accounting entries.", "WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT");
                const failedAt = this.now();
                const failed = await walletConversionRequest_repository_1.walletConversionRequestRepository
                    .failApprovedFromProvider({ conversionReference: reference,
                    providerExecutionReference: provider.providerExecutionReference,
                    failedAt, session });
                if (!failed)
                    this.fail("Failed conversion transition conflicted.", "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT");
                await this.inject("BEFORE_AUDIT");
                await walletConversionAudit_repository_1.walletConversionAuditRepository.createOnce({
                    ...this.auditBase(request, provider),
                    auditKey: (0, idempotency_util_1.createIdempotencyFingerprint)(walletConversionAuditAction_enum_1.WalletConversionAuditAction.FAILED, request.conversionKey),
                    action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.FAILED, failedAt,
                }, session);
                await this.inject("BEFORE_COMMIT");
            });
        }
        finally {
            await session.endSession();
        }
    }
    async completeTransaction(reference) {
        const session = await mongoose_1.default.startSession();
        try {
            await session.withTransaction(async () => {
                const request = await this.loadRequest(reference, session);
                if (request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED ||
                    request.providerStatus !==
                        internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.SUCCEEDED ||
                    request.providerOutcome !== walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS ||
                    request.accountingReference || request.accountingTransactionReference) {
                    this.fail("Conversion is not eligible for accounting.", "WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS");
                }
                const provider = await this.loadProvider(request, session);
                const { sourceWallet, targetWallet } = await this.resolveWallets(request, session);
                await this.inject("AFTER_WALLET_CREATION");
                const identity = this.identity(request, targetWallet);
                const [existingEntries, sourceExisting, targetExisting] = await Promise.all([
                    ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
                        transactionId: identity.accountingTransactionReference,
                    }, session),
                    walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.sourceProjectionKey, session),
                    walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.targetProjectionKey, session),
                ]);
                if (existingEntries.length || sourceExisting || targetExisting) {
                    this.fail("Partial conversion accounting already exists.", "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT");
                }
                const common = {
                    type: ledgerEntryType_enum_1.LedgerEntryType.WALLET_CONVERSION_COMPLETED,
                    source: ledgerSource_enum_1.LedgerSource.WALLET_CONVERSION,
                    account: ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE,
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
                };
                let sourceLedger;
                let targetLedger;
                try {
                    sourceLedger = await ledger_service_1.ledgerService.createDebit({ ...common,
                        money: { amount: request.sourceAmount,
                            currency: request.sourceCurrency },
                        walletId: sourceWallet._id.toString(),
                        postingKey: identity.sourcePostingKey,
                        description: "Wallet conversion source debit",
                    }, session);
                    targetLedger = await ledger_service_1.ledgerService.createCredit({ ...common,
                        money: { amount: request.targetAmount,
                            currency: request.targetCurrency },
                        walletId: targetWallet._id.toString(),
                        postingKey: identity.targetPostingKey,
                        description: "Wallet conversion target credit",
                    }, session);
                }
                catch (error) {
                    if (isTransient(error))
                        throw error;
                    this.fail("Wallet conversion Ledger posting failed.", "WALLET_CONVERSION_ACCOUNTING_LEDGER_CONFLICT", error);
                }
                await this.inject("AFTER_LEDGER");
                let projectedSource;
                let projectedTarget;
                try {
                    projectedSource = await walletProjection_service_1.walletProjectionService
                        .applyProjectionMutation({ userId: request.userId,
                        currency: request.sourceCurrency,
                        operationKey: identity.sourceProjectionKey,
                        deltas: { availableBalance: -request.sourceAmount,
                            reservedBalance: 0, lockedBalance: 0 },
                        minimums: { availableBalance: request.sourceAmount },
                        ledgerEntryIds: [sourceLedger._id],
                    }, session);
                    await this.inject("AFTER_SOURCE_PROJECTION");
                    projectedTarget = await walletProjection_service_1.walletProjectionService
                        .applyProjectionMutation({ userId: request.userId,
                        currency: request.targetCurrency,
                        operationKey: identity.targetProjectionKey,
                        deltas: { availableBalance: request.targetAmount,
                            reservedBalance: 0, lockedBalance: 0 },
                        ledgerEntryIds: [targetLedger._id],
                    }, session);
                }
                catch (error) {
                    if (isTransient(error))
                        throw error;
                    if (error instanceof WalletError_1.WalletError &&
                        error.code === "WALLET_INSUFFICIENT_BALANCE") {
                        this.fail("Source Wallet available balance is insufficient.", "WALLET_CONVERSION_ACCOUNTING_INSUFFICIENT_BALANCE", error);
                    }
                    this.fail("Wallet conversion projection failed.", "WALLET_CONVERSION_ACCOUNTING_PROJECTION_CONFLICT", error);
                }
                await this.inject("AFTER_TARGET_PROJECTION");
                const [sourceProjection, targetProjection] = await Promise.all([
                    walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.sourceProjectionKey, session),
                    walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.targetProjectionKey, session),
                ]);
                if (!sourceProjection || !targetProjection)
                    this.fail("Wallet conversion projection authority is missing.", "WALLET_CONVERSION_ACCOUNTING_PROJECTION_CONFLICT");
                this.validateProjection(request, targetWallet, identity, sourceLedger, targetLedger, sourceProjection, targetProjection);
                await this.inject("BEFORE_COMPLETED");
                const completedAt = this.now();
                const completed = await walletConversionRequest_repository_1.walletConversionRequestRepository
                    .completeApprovedWithAccounting({
                    conversionReference: reference,
                    providerExecutionReference: provider.providerExecutionReference,
                    accountingReference: identity.accountingReference,
                    accountingKey: identity.accountingKey,
                    accountingFingerprint: identity.accountingFingerprint,
                    accountingTransactionReference: identity.accountingTransactionReference,
                    accountingTargetWalletId: targetWallet._id,
                    sourceProjectionReference: identity.sourceProjectionReference,
                    targetProjectionReference: identity.targetProjectionReference,
                    sourceWalletVersion: projectedSource.projectionVersion,
                    targetWalletVersion: projectedTarget.projectionVersion,
                    completedAt, session,
                });
                if (!completed)
                    this.fail("Conversion completion guard conflicted.", "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT");
                await this.inject("BEFORE_AUDIT");
                await walletConversionAudit_repository_1.walletConversionAuditRepository.createOnce({
                    ...this.auditBase(request, provider),
                    auditKey: (0, idempotency_util_1.createIdempotencyFingerprint)(walletConversionAuditAction_enum_1.WalletConversionAuditAction.COMPLETED, request.conversionKey),
                    action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.COMPLETED,
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
        }
        finally {
            await session.endSession();
        }
    }
    async validateCompletedReplay(reference) {
        await this.validateProviderReplay(reference, walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS, true);
        const request = await this.loadRequest(reference);
        if (request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED ||
            !request.completedAt || !request.accountingReference ||
            !request.accountingKey || !request.accountingFingerprint ||
            !request.accountingTransactionReference ||
            !request.accountingTargetWalletId ||
            !request.sourceProjectionReference || !request.targetProjectionReference ||
            !request.sourceWalletVersion || !request.targetWalletVersion ||
            request.failedAt) {
            this.fail("Completed conversion authority is incomplete.", "WALLET_CONVERSION_ACCOUNTING_REPLAY_CONFLICT");
        }
        const provider = await this.loadProvider(request);
        const [sourceWallet, targetWallet] = await Promise.all([
            wallet_repository_1.walletRepository.findById(request.sourceWalletId),
            wallet_repository_1.walletRepository.findById(request.accountingTargetWalletId),
        ]);
        if (!sourceWallet || !targetWallet)
            this.fail("Completed conversion Wallet is missing.", "WALLET_CONVERSION_ACCOUNTING_WALLET_CONFLICT");
        this.validateWallet(sourceWallet, request, request.sourceCurrency, request.sourceWalletId);
        this.validateWallet(targetWallet, request, request.targetCurrency, request.accountingTargetWalletId);
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
            this.fail("Completed conversion accounting identity conflicts.", "WALLET_CONVERSION_ACCOUNTING_IDENTITY_CONFLICT");
        }
        const entries = await ledgerEntry_repository_1.ledgerEntryRepository.findManyWithPostingKeys({
            transactionId: identity.accountingTransactionReference,
        });
        const ledger = this.validateLedger(request, targetWallet, identity, entries);
        const [sourceProjection, targetProjection] = await Promise.all([
            walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.sourceProjectionKey),
            walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.targetProjectionKey),
        ]);
        if (!sourceProjection || !targetProjection)
            this.fail("Completed conversion projection is missing.", "WALLET_CONVERSION_ACCOUNTING_PROJECTION_CONFLICT");
        this.validateProjection(request, targetWallet, identity, ledger.source, ledger.target, sourceProjection, targetProjection);
        if (sourceProjection.projectionVersion !== request.sourceWalletVersion ||
            targetProjection.projectionVersion !== request.targetWalletVersion) {
            this.fail("Completed conversion Wallet versions conflict.", "WALLET_CONVERSION_ACCOUNTING_REPLAY_CONFLICT");
        }
        const audits = await walletConversionAudit_model_1.WalletConversionAudit.find({
            conversionReference: reference,
            action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.COMPLETED,
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
            this.fail("Completed conversion audit conflicts.", "WALLET_CONVERSION_ACCOUNTING_AUDIT_CONFLICT");
        }
        return (0, walletConversionAccounting_response_dto_1.toWalletConversionAccountingResponseDto)(request);
    }
    async validateFailedReplay(reference) {
        await this.validateProviderReplay(reference, walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.FAILURE, true);
        const request = await this.loadRequest(reference);
        if (request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.FAILED ||
            !request.failedAt || request.completedAt || request.accountingReference ||
            request.accountingTransactionReference || request.sourceProjectionReference ||
            request.targetProjectionReference) {
            this.fail("Failed conversion authority conflicts.", "WALLET_CONVERSION_ACCOUNTING_REPLAY_CONFLICT");
        }
        const [entries, audits] = await Promise.all([
            ledgerEntry_repository_1.ledgerEntryRepository.findMany({
                "metadata.conversionReference": reference,
                type: ledgerEntryType_enum_1.LedgerEntryType.WALLET_CONVERSION_COMPLETED,
            }),
            walletConversionAudit_model_1.WalletConversionAudit.find({ conversionReference: reference,
                action: walletConversionAuditAction_enum_1.WalletConversionAuditAction.FAILED }),
        ]);
        if (entries.length || audits.length !== 1 ||
            audits[0].failedAt?.getTime() !== request.failedAt.getTime() ||
            audits[0].providerStatus !==
                internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.FAILED ||
            audits[0].providerOutcome !== walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.FAILURE) {
            this.fail("Failed conversion financial graph conflicts.", "WALLET_CONVERSION_ACCOUNTING_REPLAY_CONFLICT");
        }
        return (0, walletConversionAccounting_response_dto_1.toWalletConversionAccountingResponseDto)(request);
    }
    async validateReplay(reference) {
        const normalized = this.normalize(reference);
        const request = await this.loadRequest(normalized);
        if (request.status === walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED) {
            return this.validateCompletedReplay(normalized);
        }
        if (request.status === walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.FAILED) {
            return this.validateFailedReplay(normalized);
        }
        this.fail("Wallet conversion has no terminal accounting authority.", "WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS");
    }
    async account(reference) {
        const normalized = this.normalize(reference);
        let request = await this.loadRequest(normalized);
        if ([walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED,
            walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.FAILED].includes(request.status)) {
            return this.validateReplay(normalized);
        }
        if (request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED ||
            ![walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS,
                walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.FAILURE]
                .includes(request.providerOutcome)) {
            this.fail("Wallet conversion is not eligible for accounting.", "WALLET_CONVERSION_ACCOUNTING_INVALID_STATUS");
        }
        const providerOutcome = request.providerOutcome;
        await this.validateProviderReplay(normalized, providerOutcome);
        let lastError;
        for (let attempt = 0; attempt < 10; attempt += 1) {
            try {
                if (providerOutcome === walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.FAILURE) {
                    await this.finalizeFailed(normalized);
                }
                else {
                    await this.completeTransaction(normalized);
                }
                return this.validateReplay(normalized);
            }
            catch (error) {
                lastError = error;
                const winner = await this.loadRequest(normalized);
                if ([walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED,
                    walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.FAILED].includes(winner.status)) {
                    return this.validateReplay(normalized);
                }
                if (error instanceof WalletConversionAccountingError_1.WalletConversionAccountingError &&
                    error.code !== "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT") {
                    throw error;
                }
                if (!isTransient(error) && !(error instanceof
                    WalletConversionAccountingError_1.WalletConversionAccountingError && error.code ===
                    "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT"))
                    break;
                request = winner;
            }
        }
        if (lastError instanceof WalletConversionAccountingError_1.WalletConversionAccountingError)
            throw lastError;
        this.fail("Wallet conversion accounting transaction conflicted.", "WALLET_CONVERSION_ACCOUNTING_TRANSACTION_CONFLICT", lastError);
    }
}
exports.WalletConversionAccountingService = WalletConversionAccountingService;
exports.walletConversionAccountingService = new WalletConversionAccountingService();
