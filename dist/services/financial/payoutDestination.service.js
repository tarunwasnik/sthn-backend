"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutDestinationService = exports.PayoutDestinationService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const payoutDestinationType_enum_1 = require("../../enums/financial/payoutDestinationType.enum");
const payoutDestinationVerificationStatus_enum_1 = require("../../enums/financial/payoutDestinationVerificationStatus.enum");
const PayoutDestinationError_1 = require("../../errors/financial/PayoutDestinationError");
const payoutDestination_repository_1 = require("../../repositories/payoutDestination.repository");
const payoutDestinationCrypto_service_1 = require("../security/payoutDestinationCrypto.service");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const reference_util_2 = require("../../utils/financial/reference.util");
class PayoutDestinationService {
    constructor(repository = payoutDestination_repository_1.payoutDestinationRepository) {
        this.repository = repository;
    }
    async create(input) {
        this.validateCreatorId(input.creatorId);
        const canonicalCreatorId = new mongoose_1.default.Types.ObjectId(input.creatorId).toHexString();
        const normalized = this.normalizeCreateInput(input);
        const sameKey = await this.repository.findByCreatorAndIdempotencyKey(canonicalCreatorId, normalized.idempotencyKey);
        if (sameKey) {
            if (sameKey.requestFingerprint !== normalized.requestFingerprint) {
                throw new PayoutDestinationError_1.PayoutDestinationError("Idempotency key conflicts with an existing payout destination request.", "PAYOUT_DESTINATION_IDEMPOTENCY_CONFLICT");
            }
            return { destination: sameKey, created: false };
        }
        const duplicate = await this.repository.findByCreatorTypeAndDestinationFingerprint(input.creatorId, normalized.type, normalized.destinationFingerprint);
        if (duplicate) {
            return { destination: duplicate, created: false };
        }
        try {
            const destination = await this.repository.create({
                destinationReference: (0, reference_util_1.generateFinancialReference)("PAYOUT_DESTINATION"),
                creatorId: new mongoose_1.default.Types.ObjectId(input.creatorId),
                type: normalized.type,
                verificationStatus: payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.UNVERIFIED,
                isActive: true,
                idempotencyKey: normalized.idempotencyKey,
                destinationFingerprint: normalized.destinationFingerprint,
                requestFingerprint: normalized.requestFingerprint,
                encryptedPayload: payoutDestinationCrypto_service_1.payoutDestinationCryptoService.encryptDestinationPayload(normalized.encryptedPayload),
                maskedIdentifier: normalized.maskedIdentifier,
                accountNumberLast4: normalized.accountNumberLast4,
                ifscDisplay: normalized.ifscDisplay,
            });
            return { destination, created: true };
        }
        catch (error) {
            if (this.isDuplicateKeyError(error)) {
                return this.resolveCreateRace(input.creatorId, normalized);
            }
            throw error;
        }
    }
    async list(creatorId) {
        this.validateCreatorId(creatorId);
        return this.repository.findManyByCreator(creatorId);
    }
    async createWithdrawalBindingSnapshot(input) {
        this.validateCreatorId(input.creatorId);
        const canonicalCreatorId = new mongoose_1.default.Types.ObjectId(input.creatorId).toHexString();
        if (!(0, reference_util_2.isValidFinancialReference)(input.destinationReference) || !(0, reference_util_2.hasReferenceType)(input.destinationReference, "PAYOUT_DESTINATION")) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid payout destination reference.", "INVALID_PAYOUT_DESTINATION_REFERENCE");
        }
        const destination = await this.repository.claimEligibleForWithdrawalBinding(canonicalCreatorId, input.destinationReference, input.session);
        if (!destination) {
            const existing = await this.repository.findByCreatorAndReference(canonicalCreatorId, input.destinationReference, input.session);
            if (!existing)
                throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination not found.", "PAYOUT_DESTINATION_NOT_FOUND");
            if (existing.verificationStatus === payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.REJECTED)
                throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination is rejected.", "PAYOUT_DESTINATION_REJECTED");
            if (existing.verificationStatus !== payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED)
                throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination is not verified.", "PAYOUT_DESTINATION_NOT_VERIFIED");
            if (!existing.isActive)
                throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination is inactive.", "PAYOUT_DESTINATION_INACTIVE");
            throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination state is inconsistent.", "PAYOUT_DESTINATION_INTEGRITY_ERROR");
        }
        if (!destination.verifiedAt || !destination.encryptedPayload || !destination.destinationFingerprint) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination state is inconsistent.", "PAYOUT_DESTINATION_INTEGRITY_ERROR");
        }
        const decrypted = payoutDestinationCrypto_service_1.payoutDestinationCryptoService.decryptDestinationPayload(destination.encryptedPayload);
        const normalized = this.validateBindingPayload(destination, decrypted);
        const snapshotCreatedAt = new Date();
        const snapshot = {
            version: 1,
            destinationReference: destination.destinationReference,
            type: destination.type,
            maskedIdentifier: destination.maskedIdentifier,
            accountNumberLast4: destination.accountNumberLast4,
            ifscDisplay: destination.ifscDisplay,
            verificationStatus: payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED,
            verifiedAt: destination.verifiedAt,
            snapshotCreatedAt,
            encryptedPayload: payoutDestinationCrypto_service_1.payoutDestinationCryptoService.encryptWithdrawalDestinationSnapshotPayload(normalized.type === payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT
                ? {
                    accountHolderName: normalized.accountHolderName,
                    accountNumber: normalized.accountNumber,
                    ifsc: normalized.ifsc,
                }
                : { upiId: normalized.upiId }, {
                withdrawalReference: input.withdrawalReference,
                creatorId: canonicalCreatorId,
                destinationReference: destination.destinationReference,
                destinationType: destination.type,
                snapshotVersion: 1,
            }),
        };
        return { payoutDestinationId: destination._id, snapshot };
    }
    async get(creatorId, destinationReference) {
        this.validateCreatorId(creatorId);
        const destination = await this.repository.findByCreatorAndReference(creatorId, destinationReference);
        if (!destination) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination not found.", "PAYOUT_DESTINATION_NOT_FOUND");
        }
        return destination;
    }
    async setActivation(creatorId, destinationReference, isActive) {
        const current = await this.get(creatorId, destinationReference);
        if (current.isActive === isActive) {
            return { destination: current, changed: false };
        }
        if (isActive && current.verificationStatus === payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.REJECTED) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Rejected payout destinations cannot be reactivated.", "PAYOUT_DESTINATION_REACTIVATION_REJECTED");
        }
        const now = new Date();
        const updated = await this.repository.setActiveIfCurrent(creatorId, destinationReference, isActive, isActive ? { isActive: true, reactivatedAt: now } : { isActive: false, deactivatedAt: now });
        if (updated) {
            return { destination: updated, changed: true };
        }
        const concurrent = await this.get(creatorId, destinationReference);
        if (isActive &&
            concurrent.verificationStatus ===
                payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.REJECTED) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Rejected payout destinations cannot be reactivated.", "PAYOUT_DESTINATION_REACTIVATION_REJECTED");
        }
        if (concurrent.isActive === isActive) {
            return { destination: concurrent, changed: false };
        }
        throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination activation changed concurrently. Retry the request.", "PAYOUT_DESTINATION_ACTIVATION_CONFLICT");
    }
    serialize(destination) {
        return {
            destinationReference: destination.destinationReference,
            type: destination.type,
            verificationStatus: destination.verificationStatus,
            isActive: destination.isActive,
            maskedIdentifier: destination.maskedIdentifier,
            accountNumberLast4: destination.accountNumberLast4,
            ifscDisplay: destination.ifscDisplay,
            verifiedAt: destination.verifiedAt,
            rejectedAt: destination.rejectedAt,
            rejectionReason: destination.rejectionReason,
            deactivatedAt: destination.deactivatedAt,
            reactivatedAt: destination.reactivatedAt,
            createdAt: destination.createdAt,
            updatedAt: destination.updatedAt,
        };
    }
    normalizeCreateInput(input) {
        if (!Object.values(payoutDestinationType_enum_1.PayoutDestinationType).includes(input.type)) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid payout destination type.", "INVALID_PAYOUT_DESTINATION_TYPE");
        }
        if (typeof input.idempotencyKey !== "string" || !(0, idempotency_util_1.isValidIdempotencyKey)(input.idempotencyKey)) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid idempotency key.", "INVALID_PAYOUT_DESTINATION_IDEMPOTENCY_KEY");
        }
        const type = input.type;
        const idempotencyKey = (0, idempotency_util_1.normalizeIdempotencyKey)(input.idempotencyKey);
        if (type === payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT) {
            if (input.upiId !== undefined) {
                throw new PayoutDestinationError_1.PayoutDestinationError("UPI details are not valid for a bank destination.", "INVALID_PAYOUT_DESTINATION_INPUT");
            }
            const accountHolderName = this.normalizeAccountHolderName(input.accountHolderName);
            const accountNumber = this.normalizeAccountNumber(input.accountNumber);
            const ifsc = this.normalizeIfsc(input.ifsc);
            const last4 = accountNumber.slice(-4);
            return {
                type,
                idempotencyKey,
                destinationFingerprint: payoutDestinationCrypto_service_1.payoutDestinationCryptoService.createDestinationFingerprint(`BANK_ACCOUNT:${accountNumber}:${ifsc}`),
                requestFingerprint: payoutDestinationCrypto_service_1.payoutDestinationCryptoService.createRequestFingerprint(`BANK_ACCOUNT:${accountHolderName}:${accountNumber}:${ifsc}`),
                encryptedPayload: { accountHolderName, accountNumber, ifsc },
                maskedIdentifier: `••••${last4}`,
                accountNumberLast4: last4,
                ifscDisplay: ifsc,
            };
        }
        if (input.accountHolderName !== undefined ||
            input.accountNumber !== undefined ||
            input.ifsc !== undefined) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Bank details are not valid for a UPI destination.", "INVALID_PAYOUT_DESTINATION_INPUT");
        }
        const upiId = this.normalizeUpiId(input.upiId);
        return {
            type,
            idempotencyKey,
            destinationFingerprint: payoutDestinationCrypto_service_1.payoutDestinationCryptoService.createDestinationFingerprint(`UPI:${upiId}`),
            requestFingerprint: payoutDestinationCrypto_service_1.payoutDestinationCryptoService.createRequestFingerprint(`UPI:${upiId}`),
            encryptedPayload: { upiId },
            maskedIdentifier: this.maskUpiId(upiId),
        };
    }
    validateBindingPayload(destination, payload) {
        const keys = Object.keys(payload).sort();
        try {
            switch (destination.type) {
                case payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT: {
                    if (keys.join(",") !== "accountHolderName,accountNumber,ifsc")
                        throw this.integrityError();
                    const accountHolderName = this.normalizeAccountHolderName(payload.accountHolderName);
                    const accountNumber = this.normalizeAccountNumber(payload.accountNumber);
                    const ifsc = this.normalizeIfsc(payload.ifsc);
                    if (payload.accountHolderName !== accountHolderName || payload.accountNumber !== accountNumber || payload.ifsc !== ifsc || destination.accountNumberLast4 !== accountNumber.slice(-4) || destination.ifscDisplay !== ifsc || destination.maskedIdentifier !== `••••${accountNumber.slice(-4)}`)
                        throw this.integrityError();
                    const expected = payoutDestinationCrypto_service_1.payoutDestinationCryptoService.createDestinationFingerprint(`BANK_ACCOUNT:${accountNumber}:${ifsc}`);
                    if (!this.fingerprintsEqual(expected, destination.destinationFingerprint))
                        throw this.integrityError();
                    return { type: payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT, accountHolderName, accountNumber, ifsc };
                }
                case payoutDestinationType_enum_1.PayoutDestinationType.UPI: {
                    if (keys.join(",") !== "upiId" || destination.accountNumberLast4 !== undefined || destination.ifscDisplay !== undefined)
                        throw this.integrityError();
                    const upiId = this.normalizeUpiId(payload.upiId);
                    if (payload.upiId !== upiId || destination.maskedIdentifier !== this.maskUpiId(upiId))
                        throw this.integrityError();
                    const expected = payoutDestinationCrypto_service_1.payoutDestinationCryptoService.createDestinationFingerprint(`UPI:${upiId}`);
                    if (!this.fingerprintsEqual(expected, destination.destinationFingerprint))
                        throw this.integrityError();
                    return { type: payoutDestinationType_enum_1.PayoutDestinationType.UPI, upiId };
                }
                default:
                    throw this.integrityError();
            }
        }
        catch (error) {
            if (error instanceof PayoutDestinationError_1.PayoutDestinationError && error.code === "PAYOUT_DESTINATION_INTEGRITY_ERROR")
                throw error;
            throw this.integrityError();
        }
    }
    fingerprintsEqual(first, second) {
        const left = Buffer.from(first, "utf8");
        const right = Buffer.from(second, "utf8");
        return left.length === right.length && crypto_1.default.timingSafeEqual(left, right);
    }
    integrityError() {
        return new PayoutDestinationError_1.PayoutDestinationError("Payout destination integrity validation failed.", "PAYOUT_DESTINATION_INTEGRITY_ERROR");
    }
    normalizeAccountHolderName(value) {
        if (typeof value !== "string")
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid account holder name.", "INVALID_ACCOUNT_HOLDER_NAME");
        const normalized = value.trim().replace(/\s+/g, " ");
        if (!/^[\p{L}][\p{L} .'-]{1,98}$/u.test(normalized)) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid account holder name.", "INVALID_ACCOUNT_HOLDER_NAME");
        }
        return normalized;
    }
    normalizeAccountNumber(value) {
        if (typeof value !== "string")
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid bank account number.", "INVALID_ACCOUNT_NUMBER");
        const normalized = value.replace(/[\s-]/g, "");
        if (!/^\d{9,18}$/.test(normalized)) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid bank account number.", "INVALID_ACCOUNT_NUMBER");
        }
        return normalized;
    }
    normalizeIfsc(value) {
        if (typeof value !== "string")
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid IFSC.", "INVALID_IFSC");
        const normalized = value.trim().toUpperCase();
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized)) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid IFSC.", "INVALID_IFSC");
        }
        return normalized;
    }
    normalizeUpiId(value) {
        if (typeof value !== "string")
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid UPI ID.", "INVALID_UPI_ID");
        const normalized = value.trim().toLowerCase();
        if (normalized.includes(" ") || !/^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$/.test(normalized)) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid UPI ID.", "INVALID_UPI_ID");
        }
        return normalized;
    }
    maskUpiId(upiId) {
        const [localPart, handle] = upiId.split("@");
        return `${localPart.charAt(0)}•••${localPart.slice(-1)}@${handle}`;
    }
    validateCreatorId(creatorId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(creatorId)) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid creator identity.", "INVALID_PAYOUT_DESTINATION_CREATOR");
        }
    }
    isDuplicateKeyError(error) {
        return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
    }
    async resolveCreateRace(creatorId, normalized) {
        const byKey = await this.repository.findByCreatorAndIdempotencyKey(creatorId, normalized.idempotencyKey);
        if (byKey) {
            if (byKey.requestFingerprint !== normalized.requestFingerprint) {
                throw new PayoutDestinationError_1.PayoutDestinationError("Idempotency key conflicts with an existing payout destination request.", "PAYOUT_DESTINATION_IDEMPOTENCY_CONFLICT");
            }
            return { destination: byKey, created: false };
        }
        const byDestination = await this.repository.findByCreatorTypeAndDestinationFingerprint(creatorId, normalized.type, normalized.destinationFingerprint);
        if (byDestination)
            return { destination: byDestination, created: false };
        throw new PayoutDestinationError_1.PayoutDestinationError("Unable to create payout destination. Retry the request.", "PAYOUT_DESTINATION_CREATE_CONFLICT");
    }
}
exports.PayoutDestinationService = PayoutDestinationService;
exports.payoutDestinationService = new PayoutDestinationService();
