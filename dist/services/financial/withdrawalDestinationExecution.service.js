"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalDestinationExecutionService = exports.WithdrawalDestinationExecutionService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const payoutDestinationType_enum_1 = require("../../enums/financial/payoutDestinationType.enum");
const payoutDestinationVerificationStatus_enum_1 = require("../../enums/financial/payoutDestinationVerificationStatus.enum");
const WithdrawalError_1 = require("../../errors/financial/WithdrawalError");
const withdrawal_repository_1 = require("../../repositories/withdrawal.repository");
const payoutDestinationCrypto_service_1 = require("../security/payoutDestinationCrypto.service");
/** Narrow boundary which turns an immutable withdrawal snapshot into a transient provider command. */
class WithdrawalDestinationExecutionService {
    constructor(withdrawals = withdrawal_repository_1.withdrawalRepository) {
        this.withdrawals = withdrawals;
    }
    async getExecutionDestination(withdrawalId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(withdrawalId)) {
            throw new WithdrawalError_1.WithdrawalError("Withdrawal destination snapshot is unavailable.", "WITHDRAWAL_DESTINATION_SNAPSHOT_REQUIRED");
        }
        const withdrawal = await this.withdrawals.findByIdForPayoutExecution(withdrawalId);
        const snapshot = withdrawal?.destinationSnapshot;
        if (!withdrawal || !withdrawal.payoutDestinationId || !snapshot) {
            throw new WithdrawalError_1.WithdrawalError("Withdrawal destination snapshot is required for payout execution.", "WITHDRAWAL_DESTINATION_SNAPSHOT_REQUIRED");
        }
        if (snapshot.version !== 1 ||
            snapshot.verificationStatus !== payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED ||
            !snapshot.verifiedAt ||
            !snapshot.encryptedPayload) {
            throw this.integrityError();
        }
        let payload;
        try {
            payload = payoutDestinationCrypto_service_1.payoutDestinationCryptoService.decryptWithdrawalDestinationSnapshotPayload(snapshot.encryptedPayload, {
                withdrawalReference: withdrawal.withdrawalReference,
                creatorId: withdrawal.creatorId.toHexString(),
                destinationReference: snapshot.destinationReference,
                destinationType: snapshot.type,
                snapshotVersion: snapshot.version,
            });
        }
        catch (error) {
            if (error instanceof Error &&
                "code" in error &&
                error.code === "WITHDRAWAL_DESTINATION_SNAPSHOT_ENCRYPTION_VERSION_UNSUPPORTED") {
                throw error;
            }
            throw this.integrityError();
        }
        return this.validateSnapshot(snapshot, payload);
    }
    validateSnapshot(snapshot, payload) {
        try {
            if (snapshot.type === payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT) {
                if (Object.keys(payload).sort().join(",") !== "accountHolderName,accountNumber,ifsc") {
                    throw this.integrityError();
                }
                const accountHolderName = this.normalizeAccountHolderName(payload.accountHolderName);
                const accountNumber = this.normalizeAccountNumber(payload.accountNumber);
                const ifsc = this.normalizeIfsc(payload.ifsc);
                const last4 = accountNumber.slice(-4);
                if (payload.accountHolderName !== accountHolderName ||
                    payload.accountNumber !== accountNumber ||
                    payload.ifsc !== ifsc ||
                    snapshot.accountNumberLast4 !== last4 ||
                    snapshot.ifscDisplay !== ifsc ||
                    snapshot.maskedIdentifier !== `••••${last4}`) {
                    throw this.integrityError();
                }
                return {
                    snapshotVersion: 1,
                    destinationReference: snapshot.destinationReference,
                    type: payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT,
                    maskedIdentifier: snapshot.maskedIdentifier,
                    accountNumberLast4: last4,
                    ifscDisplay: ifsc,
                    executionDestination: {
                        type: payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT,
                        accountHolderName,
                        accountNumber,
                        ifsc,
                    },
                };
            }
            if (snapshot.type === payoutDestinationType_enum_1.PayoutDestinationType.UPI) {
                if (Object.keys(payload).join(",") !== "upiId" ||
                    snapshot.accountNumberLast4 !== undefined ||
                    snapshot.ifscDisplay !== undefined) {
                    throw this.integrityError();
                }
                const upiId = this.normalizeUpiId(payload.upiId);
                if (payload.upiId !== upiId || snapshot.maskedIdentifier !== this.maskUpiId(upiId)) {
                    throw this.integrityError();
                }
                return {
                    snapshotVersion: 1,
                    destinationReference: snapshot.destinationReference,
                    type: payoutDestinationType_enum_1.PayoutDestinationType.UPI,
                    maskedIdentifier: snapshot.maskedIdentifier,
                    executionDestination: { type: payoutDestinationType_enum_1.PayoutDestinationType.UPI, upiId },
                };
            }
        }
        catch (error) {
            if (error instanceof WithdrawalError_1.WithdrawalError)
                throw error;
        }
        throw this.integrityError();
    }
    normalizeAccountHolderName(value) {
        if (typeof value !== "string")
            throw this.integrityError();
        const normalized = value.trim().replace(/\s+/g, " ");
        if (!/^[\p{L}][\p{L} .'-]{1,98}$/u.test(normalized))
            throw this.integrityError();
        return normalized;
    }
    normalizeAccountNumber(value) {
        if (typeof value !== "string")
            throw this.integrityError();
        const normalized = value.replace(/[\s-]/g, "");
        if (!/^\d{9,18}$/.test(normalized))
            throw this.integrityError();
        return normalized;
    }
    normalizeIfsc(value) {
        if (typeof value !== "string")
            throw this.integrityError();
        const normalized = value.trim().toUpperCase();
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized))
            throw this.integrityError();
        return normalized;
    }
    normalizeUpiId(value) {
        if (typeof value !== "string")
            throw this.integrityError();
        const normalized = value.trim().toLowerCase();
        if (normalized.includes(" ") || !/^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$/.test(normalized)) {
            throw this.integrityError();
        }
        return normalized;
    }
    maskUpiId(upiId) {
        const [localPart, handle] = upiId.split("@");
        return `${localPart.charAt(0)}•••${localPart.slice(-1)}@${handle}`;
    }
    integrityError() {
        return new WithdrawalError_1.WithdrawalError("Withdrawal destination snapshot integrity validation failed.", "WITHDRAWAL_DESTINATION_SNAPSHOT_INTEGRITY_ERROR");
    }
}
exports.WithdrawalDestinationExecutionService = WithdrawalDestinationExecutionService;
exports.withdrawalDestinationExecutionService = new WithdrawalDestinationExecutionService();
