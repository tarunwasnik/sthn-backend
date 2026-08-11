"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalPayoutProvider = exports.InternalPayoutProvider = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = require("mongoose");
const paymentProvider_enum_1 = require("../../../enums/financial/paymentProvider.enum");
const payoutDestinationType_enum_1 = require("../../../enums/financial/payoutDestinationType.enum");
const supportedCurrencies_1 = require("../../../constants/financial/supportedCurrencies");
const PayoutError_1 = require("../../../errors/financial/PayoutError");
const internalProvider_1 = require("../../../constants/internalProvider");
const reference_util_1 = require("../../../utils/financial/reference.util");
const providerPayout_service_1 = __importDefault(require("../../internalProvider/payouts/providerPayout.service"));
const payoutDestinationCrypto_service_1 = require("../../security/payoutDestinationCrypto.service");
class InternalPayoutProvider {
    constructor() {
        this.provider = paymentProvider_enum_1.PaymentProvider.INTERNAL;
    }
    async initializePayout(request) {
        this.validateRequest(request);
        const fingerprint = this.createDestinationFingerprint(request);
        const existing = await providerPayout_service_1.default.findByIdempotencyKeyForDestinationConsistency(request.idempotencyKey);
        if (existing) {
            this.assertExistingDestinationConsistency(existing, request, fingerprint);
            return {
                providerPayoutId: existing.providerPayoutId,
                providerReference: existing.providerReference ?? undefined,
                initializationIdentity: this.initializationIdentity(existing),
                payload: {
                    provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
                    duplicateRequest: true,
                },
            };
        }
        const providerPayoutId = `INT_PAYOUT_${crypto_1.default
            .randomBytes(8)
            .toString("hex")
            .toUpperCase()}`;
        const providerReference = `INT_PAYOUT_REF_${crypto_1.default
            .randomBytes(8)
            .toString("hex")
            .toUpperCase()}`;
        try {
            await providerPayout_service_1.default.createWithdrawalPayout({
                payoutId: new mongoose_1.Types.ObjectId(request.payoutId),
                providerPayoutId,
                providerReference,
                idempotencyKey: request.idempotencyKey,
                providerDestination: this.createProviderDestination(request, providerPayoutId, fingerprint),
                providerMetadata: {
                    provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
                    environment: process.env.NODE_ENV ?? "development",
                    simulationMode: internalProvider_1.ProviderSimulationMode.NORMAL,
                },
                execution: {
                    attemptNumber: 1,
                    retryCount: 0,
                    processingLatencyMs: 0,
                    isTestMode: process.env.NODE_ENV !== "production",
                },
                audit: {
                    createdBy: "InternalPayoutProvider",
                    updatedBy: "InternalPayoutProvider",
                    lastStatusChangedAt: new Date(),
                },
                payloads: {
                    request: this.createSafeRequestPayload(request, providerPayoutId),
                    response: {},
                },
            });
        }
        catch (error) {
            if (!this.isDuplicateKeyError(error))
                throw error;
            const winner = await providerPayout_service_1.default.findByIdempotencyKeyForDestinationConsistency(request.idempotencyKey);
            if (!winner)
                throw error;
            this.assertExistingDestinationConsistency(winner, request, fingerprint);
            return {
                providerPayoutId: winner.providerPayoutId,
                providerReference: winner.providerReference ?? undefined,
                initializationIdentity: this.initializationIdentity(winner),
                payload: { provider: paymentProvider_enum_1.PaymentProvider.INTERNAL, duplicateRequest: true },
            };
        }
        const persisted = await providerPayout_service_1.default.findByIdempotencyKeyForDestinationConsistency(request.idempotencyKey);
        if (!persisted) {
            throw new PayoutError_1.PayoutError("Provider payout initialization could not be verified.", "PROVIDER_PAYOUT_INITIALIZATION_IDENTITY_MISSING");
        }
        this.assertExistingDestinationConsistency(persisted, request, fingerprint);
        return {
            providerPayoutId: persisted.providerPayoutId,
            providerReference: persisted.providerReference ?? undefined,
            initializationIdentity: this.initializationIdentity(persisted),
            payload: {
                provider: paymentProvider_enum_1.PaymentProvider.INTERNAL,
                status: "CREATED",
            },
        };
    }
    initializationIdentity(payout) {
        const destination = payout.providerDestination;
        const request = payout.payloads.request;
        if (!destination ||
            !this.isSafeInitializationRequest(request) ||
            request.payoutId !== payout.payoutId.toString()) {
            throw new PayoutError_1.PayoutError("Provider payout initialization identity is invalid.", "PROVIDER_PAYOUT_INITIALIZATION_IDENTITY_INVALID");
        }
        return {
            providerPayoutId: payout.providerPayoutId,
            providerReference: payout.providerReference ?? undefined,
            payoutId: payout.payoutId.toString(),
            withdrawalReference: request.withdrawalReference,
            amount: request.amount,
            destinationSnapshotVersion: destination.sourceSnapshotVersion,
            destinationReference: destination.destinationReference,
            destinationFingerprint: destination.fingerprint,
        };
    }
    isSafeInitializationRequest(value) {
        if (!value || typeof value !== "object" || Array.isArray(value))
            return false;
        const record = value;
        const amount = record.amount;
        return typeof record.payoutId === "string" &&
            typeof record.withdrawalReference === "string" &&
            !!amount && typeof amount === "object" && !Array.isArray(amount) &&
            typeof amount.amount === "number" &&
            typeof amount.currency === "string" &&
            supportedCurrencies_1.SUPPORTED_CURRENCIES.some((currency) => currency === amount.currency);
    }
    async getPayoutResult(request) {
        const payout = await providerPayout_service_1.default.findByProviderPayoutId(request.providerPayoutId);
        if (!payout || payout.payoutId.toString() !== request.payoutId) {
            throw new Error("Provider payout not found.");
        }
        const providerRequest = payout.payloads.request;
        const amount = providerRequest.amount;
        switch (payout.status) {
            case "PAID":
                return {
                    outcome: "COMPLETED",
                    terminal: true,
                    providerPayoutId: payout.providerPayoutId,
                    providerTransactionId: payout.providerTransactionId ?? undefined,
                    amount,
                    completedAt: payout.paidAt ?? undefined,
                    payload: { provider: paymentProvider_enum_1.PaymentProvider.INTERNAL, status: payout.status },
                };
            case "FAILED":
            case "CANCELLED":
            case "EXPIRED":
                return {
                    outcome: "FAILED",
                    terminal: true,
                    providerPayoutId: payout.providerPayoutId,
                    providerTransactionId: payout.providerTransactionId ?? undefined,
                    amount,
                    failedAt: payout.failedAt ?? payout.cancelledAt ?? payout.expiredAt ?? undefined,
                    failureCode: payout.failureCode ?? payout.failureReason,
                    failureReason: payout.failureMessage ?? payout.failureReason,
                    payload: { provider: paymentProvider_enum_1.PaymentProvider.INTERNAL, status: payout.status },
                };
            default:
                return {
                    outcome: "PROCESSING",
                    terminal: false,
                    providerPayoutId: payout.providerPayoutId,
                    amount,
                    payload: { provider: paymentProvider_enum_1.PaymentProvider.INTERNAL, status: payout.status },
                };
        }
    }
    validateRequest(request) {
        if (!mongoose_1.Types.ObjectId.isValid(request.payoutId) || !request.destination) {
            throw this.invalidDestination();
        }
        const destination = request.destination;
        if (destination.snapshotVersion !== 1 ||
            typeof destination.destinationReference !== "string" ||
            !(0, reference_util_1.isValidFinancialReference)(destination.destinationReference) ||
            !(0, reference_util_1.hasReferenceType)(destination.destinationReference, "PAYOUT_DESTINATION") ||
            typeof destination.maskedIdentifier !== "string" ||
            destination.maskedIdentifier.length === 0 ||
            !destination.executionDestination ||
            destination.executionDestination.type !== destination.type) {
            throw this.invalidDestination();
        }
        switch (destination.type) {
            case payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT: {
                const execution = destination.executionDestination;
                if (execution.type !== payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT)
                    throw this.invalidDestination();
                const accountHolderName = this.normalizeAccountHolderName(execution.accountHolderName);
                const accountNumber = this.normalizeAccountNumber(execution.accountNumber);
                const ifsc = this.normalizeIfsc(execution.ifsc);
                if (execution.accountHolderName !== accountHolderName ||
                    execution.accountNumber !== accountNumber ||
                    execution.ifsc !== ifsc ||
                    !/^\d{4}$/.test(destination.accountNumberLast4) ||
                    destination.accountNumberLast4 !== accountNumber.slice(-4) ||
                    destination.ifscDisplay !== ifsc ||
                    !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(destination.ifscDisplay) ||
                    destination.maskedIdentifier !== `••••${destination.accountNumberLast4}`) {
                    throw this.invalidDestination();
                }
                return;
            }
            case payoutDestinationType_enum_1.PayoutDestinationType.UPI: {
                const execution = destination.executionDestination;
                if (execution.type !== payoutDestinationType_enum_1.PayoutDestinationType.UPI)
                    throw this.invalidDestination();
                const upiId = this.normalizeUpiId(execution.upiId);
                if (execution.upiId !== upiId ||
                    destination.accountNumberLast4 !== undefined ||
                    destination.ifscDisplay !== undefined ||
                    destination.maskedIdentifier !== this.maskUpiId(upiId)) {
                    throw this.invalidDestination();
                }
                return;
            }
            default:
                throw this.invalidDestination();
        }
    }
    createDestinationFingerprint(request) {
        switch (request.destination.type) {
            case payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT: {
                const destination = request.destination.executionDestination;
                if (destination.type !== payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT)
                    throw this.invalidDestination();
                return payoutDestinationCrypto_service_1.payoutDestinationCryptoService.createInternalPayoutDestinationFingerprint(JSON.stringify({
                    type: destination.type,
                    accountHolderName: destination.accountHolderName,
                    accountNumber: destination.accountNumber,
                    ifsc: destination.ifsc,
                }));
            }
            case payoutDestinationType_enum_1.PayoutDestinationType.UPI: {
                const destination = request.destination.executionDestination;
                if (destination.type !== payoutDestinationType_enum_1.PayoutDestinationType.UPI)
                    throw this.invalidDestination();
                return payoutDestinationCrypto_service_1.payoutDestinationCryptoService.createInternalPayoutDestinationFingerprint(JSON.stringify({ type: destination.type, upiId: destination.upiId }));
            }
            default:
                throw this.invalidDestination();
        }
    }
    createProviderDestination(request, providerPayoutId, fingerprint) {
        const destination = request.destination;
        switch (destination.type) {
            case payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT: {
                const execution = destination.executionDestination;
                if (execution.type !== payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT)
                    throw this.invalidDestination();
                return {
                    version: 1,
                    sourceSnapshotVersion: destination.snapshotVersion,
                    destinationReference: destination.destinationReference,
                    type: destination.type,
                    maskedIdentifier: destination.maskedIdentifier,
                    accountNumberLast4: destination.accountNumberLast4,
                    ifscDisplay: destination.ifscDisplay,
                    fingerprint,
                    encryptedPayload: payoutDestinationCrypto_service_1.payoutDestinationCryptoService.encryptInternalPayoutDestinationPayload({ accountHolderName: execution.accountHolderName, accountNumber: execution.accountNumber, ifsc: execution.ifsc }, { financialPayoutId: request.payoutId, providerPayoutId, withdrawalReference: request.withdrawalReference, destinationReference: destination.destinationReference, destinationType: destination.type }),
                };
            }
            case payoutDestinationType_enum_1.PayoutDestinationType.UPI: {
                const execution = destination.executionDestination;
                if (execution.type !== payoutDestinationType_enum_1.PayoutDestinationType.UPI)
                    throw this.invalidDestination();
                return {
                    version: 1,
                    sourceSnapshotVersion: destination.snapshotVersion,
                    destinationReference: destination.destinationReference,
                    type: destination.type,
                    maskedIdentifier: destination.maskedIdentifier,
                    fingerprint,
                    encryptedPayload: payoutDestinationCrypto_service_1.payoutDestinationCryptoService.encryptInternalPayoutDestinationPayload({ upiId: execution.upiId }, { financialPayoutId: request.payoutId, providerPayoutId, withdrawalReference: request.withdrawalReference, destinationReference: destination.destinationReference, destinationType: destination.type }),
                };
            }
            default:
                throw this.invalidDestination();
        }
    }
    createSafeRequestPayload(request, providerPayoutId) {
        const destination = request.destination;
        return {
            payoutId: request.payoutId,
            providerPayoutId,
            payoutReference: request.payoutReference,
            withdrawalReference: request.withdrawalReference,
            creatorId: request.creatorId,
            amount: request.amount,
            provider: request.provider,
            idempotencyKey: request.idempotencyKey,
            destination: {
                snapshotVersion: destination.snapshotVersion,
                destinationReference: destination.destinationReference,
                type: destination.type,
                maskedIdentifier: destination.maskedIdentifier,
                ...(destination.type === payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT
                    ? { accountNumberLast4: destination.accountNumberLast4, ifscDisplay: destination.ifscDisplay }
                    : {}),
            },
        };
    }
    assertExistingDestinationConsistency(existing, request, fingerprint) {
        const destination = existing.providerDestination;
        if (!destination ||
            destination.version !== 1 ||
            destination.sourceSnapshotVersion !== request.destination.snapshotVersion ||
            existing.payoutId.toString() !== request.payoutId ||
            !this.fingerprintsEqual(destination.fingerprint, fingerprint) ||
            destination.destinationReference !== request.destination.destinationReference ||
            destination.type !== request.destination.type ||
            destination.maskedIdentifier !== request.destination.maskedIdentifier ||
            (request.destination.type === payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT &&
                (destination.accountNumberLast4 !== request.destination.accountNumberLast4 ||
                    destination.ifscDisplay !== request.destination.ifscDisplay)) ||
            (request.destination.type === payoutDestinationType_enum_1.PayoutDestinationType.UPI &&
                (destination.accountNumberLast4 !== undefined || destination.ifscDisplay !== undefined))) {
            throw new PayoutError_1.PayoutError("Provider payout destination conflicts with an existing payout.", "PROVIDER_PAYOUT_DESTINATION_CONFLICT");
        }
    }
    fingerprintsEqual(first, second) {
        const left = Buffer.from(first, "utf8");
        const right = Buffer.from(second, "utf8");
        return left.length === right.length && crypto_1.default.timingSafeEqual(left, right);
    }
    isDuplicateKeyError(error) {
        return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
    }
    normalizeAccountHolderName(value) {
        if (typeof value !== "string")
            throw this.invalidDestination();
        const normalized = value.trim().replace(/\s+/g, " ");
        if (!/^[\p{L}][\p{L} .'-]{1,98}$/u.test(normalized))
            throw this.invalidDestination();
        return normalized;
    }
    normalizeAccountNumber(value) {
        if (typeof value !== "string")
            throw this.invalidDestination();
        const normalized = value.replace(/[\s-]/g, "");
        if (!/^\d{9,18}$/.test(normalized))
            throw this.invalidDestination();
        return normalized;
    }
    normalizeIfsc(value) {
        if (typeof value !== "string")
            throw this.invalidDestination();
        const normalized = value.trim().toUpperCase();
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized))
            throw this.invalidDestination();
        return normalized;
    }
    normalizeUpiId(value) {
        if (typeof value !== "string")
            throw this.invalidDestination();
        const normalized = value.trim().toLowerCase();
        if (normalized.includes(" ") || !/^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$/.test(normalized)) {
            throw this.invalidDestination();
        }
        return normalized;
    }
    maskUpiId(upiId) {
        const [localPart, handle] = upiId.split("@");
        return `${localPart.charAt(0)}•••${localPart.slice(-1)}@${handle}`;
    }
    invalidDestination() {
        return new PayoutError_1.PayoutError("Provider payout destination is invalid.", "PROVIDER_PAYOUT_DESTINATION_INVALID");
    }
}
exports.InternalPayoutProvider = InternalPayoutProvider;
exports.internalPayoutProvider = new InternalPayoutProvider();
