"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutDestinationVerificationService = exports.PayoutDestinationVerificationService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const payoutDestinationVerificationAction_enum_1 = require("../../enums/financial/payoutDestinationVerificationAction.enum");
const payoutDestinationVerificationStatus_enum_1 = require("../../enums/financial/payoutDestinationVerificationStatus.enum");
const PayoutDestinationError_1 = require("../../errors/financial/PayoutDestinationError");
const payoutDestination_repository_1 = require("../../repositories/payoutDestination.repository");
const auditLog_service_1 = require("../auditLog.service");
const reference_util_1 = require("../../utils/financial/reference.util");
class RetryableVerificationTransitionMiss extends Error {
}
class PayoutDestinationVerificationService {
    constructor(repository = payoutDestination_repository_1.payoutDestinationRepository) {
        this.repository = repository;
    }
    async applyDecision(input) {
        const normalized = this.validateAndNormalize(input);
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const session = await mongoose_1.default.startSession();
            let result = null;
            try {
                await session.withTransaction(async () => {
                    const current = await this.repository.findByReferenceForVerification(normalized.destinationReference, session);
                    if (!current) {
                        throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination not found.", "PAYOUT_DESTINATION_NOT_FOUND");
                    }
                    const terminalResult = this.resolveTerminalState(current, normalized.action);
                    if (terminalResult) {
                        result = terminalResult;
                        return;
                    }
                    const decisionAt = new Date();
                    const update = this.buildTransitionUpdate(current, normalized, decisionAt);
                    const transitioned = await this.repository.transitionVerificationIfUnverified(normalized.destinationReference, current.isActive, update, session);
                    if (!transitioned) {
                        throw new RetryableVerificationTransitionMiss();
                    }
                    await (0, auditLog_service_1.createAuditLog)({
                        actorType: "ADMIN",
                        actorId: new mongoose_1.default.Types.ObjectId(normalized.adminActorId),
                        action: normalized.action === payoutDestinationVerificationAction_enum_1.PayoutDestinationVerificationAction.VERIFY
                            ? "PAYOUT_DESTINATION_VERIFIED"
                            : "PAYOUT_DESTINATION_REJECTED",
                        entityType: "PAYOUT_DESTINATION",
                        entityId: transitioned._id,
                        before: this.auditBefore(current),
                        after: this.auditAfter(transitioned, normalized.action),
                        session,
                    });
                    result = {
                        destination: transitioned,
                        previousStatus: current.verificationStatus,
                        changed: true,
                        idempotent: false,
                    };
                });
                if (result) {
                    return result;
                }
            }
            catch (error) {
                if (!(error instanceof RetryableVerificationTransitionMiss)) {
                    throw error;
                }
            }
            finally {
                await session.endSession();
            }
        }
        const finalState = await this.repository.findByReferenceForVerification(normalized.destinationReference);
        if (!finalState) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination not found.", "PAYOUT_DESTINATION_NOT_FOUND");
        }
        const terminalResult = this.resolveTerminalState(finalState, normalized.action);
        if (terminalResult) {
            return terminalResult;
        }
        throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination verification changed concurrently. Retry the request.", "PAYOUT_DESTINATION_VERIFICATION_TRANSITION_CONFLICT");
    }
    serializeForAdmin(destination) {
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
            rejectionCode: destination.rejectionCode,
            rejectionReason: destination.rejectionReason,
            deactivatedAt: destination.deactivatedAt,
            reactivatedAt: destination.reactivatedAt,
            createdAt: destination.createdAt,
            updatedAt: destination.updatedAt,
        };
    }
    validateAndNormalize(input) {
        if (!mongoose_1.default.Types.ObjectId.isValid(input.adminActorId)) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid admin identity.", "INVALID_PAYOUT_DESTINATION_VERIFICATION_ACTOR");
        }
        if (!(0, reference_util_1.isValidFinancialReference)(input.destinationReference) ||
            !(0, reference_util_1.hasReferenceType)(input.destinationReference, "PAYOUT_DESTINATION")) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid payout destination reference.", "INVALID_PAYOUT_DESTINATION_REFERENCE");
        }
        if (!Object.values(payoutDestinationVerificationAction_enum_1.PayoutDestinationVerificationAction).includes(input.action)) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid payout destination verification action.", "INVALID_PAYOUT_DESTINATION_VERIFICATION_ACTION");
        }
        const note = this.normalizeOptionalText(input.note, "note");
        if (input.action === payoutDestinationVerificationAction_enum_1.PayoutDestinationVerificationAction.VERIFY) {
            if (input.rejectionCode !== undefined || input.rejectionReason !== undefined) {
                throw new PayoutDestinationError_1.PayoutDestinationError("Verification decisions cannot include rejection details.", "INVALID_PAYOUT_DESTINATION_VERIFICATION_INPUT");
            }
            return { ...input, note };
        }
        const rejectionCode = this.normalizeRejectionCode(input.rejectionCode);
        const rejectionReason = this.normalizeRequiredText(input.rejectionReason, "rejection reason");
        return { ...input, rejectionCode, rejectionReason, note };
    }
    resolveTerminalState(destination, action) {
        const expectedStatus = action === payoutDestinationVerificationAction_enum_1.PayoutDestinationVerificationAction.VERIFY
            ? payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED
            : payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.REJECTED;
        if (destination.verificationStatus === expectedStatus) {
            return {
                destination,
                previousStatus: destination.verificationStatus,
                changed: false,
                idempotent: true,
            };
        }
        if (destination.verificationStatus !== payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.UNVERIFIED) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination verification conflicts with its terminal status.", "PAYOUT_DESTINATION_VERIFICATION_CONFLICT");
        }
        return null;
    }
    buildTransitionUpdate(current, input, decisionAt) {
        if (input.action === payoutDestinationVerificationAction_enum_1.PayoutDestinationVerificationAction.VERIFY) {
            return {
                $set: {
                    verificationStatus: payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED,
                    verifiedAt: decisionAt,
                    verifiedBy: new mongoose_1.default.Types.ObjectId(input.adminActorId),
                    ...(input.note ? { verificationNote: input.note } : {}),
                },
                $unset: {
                    rejectedAt: 1,
                    rejectedBy: 1,
                    rejectionCode: 1,
                    rejectionReason: 1,
                    ...(input.note ? {} : { verificationNote: 1 }),
                },
            };
        }
        return {
            $set: {
                verificationStatus: payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.REJECTED,
                rejectedAt: decisionAt,
                rejectedBy: new mongoose_1.default.Types.ObjectId(input.adminActorId),
                rejectionCode: input.rejectionCode,
                rejectionReason: input.rejectionReason,
                isActive: false,
                ...(input.note ? { verificationNote: input.note } : {}),
                ...(current.isActive ? { deactivatedAt: decisionAt } : {}),
            },
            $unset: {
                verifiedAt: 1,
                verifiedBy: 1,
                ...(input.note ? {} : { verificationNote: 1 }),
            },
        };
    }
    auditBefore(destination) {
        return {
            destinationReference: destination.destinationReference,
            type: destination.type,
            maskedIdentifier: destination.maskedIdentifier,
            verificationStatus: destination.verificationStatus,
            isActive: destination.isActive,
        };
    }
    auditAfter(destination, action) {
        if (action === payoutDestinationVerificationAction_enum_1.PayoutDestinationVerificationAction.VERIFY) {
            return {
                destinationReference: destination.destinationReference,
                type: destination.type,
                maskedIdentifier: destination.maskedIdentifier,
                verificationStatus: destination.verificationStatus,
                isActive: destination.isActive,
                verifiedAt: destination.verifiedAt,
            };
        }
        return {
            destinationReference: destination.destinationReference,
            type: destination.type,
            maskedIdentifier: destination.maskedIdentifier,
            verificationStatus: destination.verificationStatus,
            isActive: destination.isActive,
            rejectedAt: destination.rejectedAt,
            rejectionCode: destination.rejectionCode,
            rejectionReason: destination.rejectionReason,
        };
    }
    normalizeOptionalText(value, field) {
        if (value === undefined)
            return undefined;
        return this.normalizeRequiredText(value, field);
    }
    normalizeRequiredText(value, field) {
        if (typeof value !== "string") {
            throw new PayoutDestinationError_1.PayoutDestinationError(`Invalid ${field}.`, "INVALID_PAYOUT_DESTINATION_VERIFICATION_INPUT");
        }
        const normalized = value.trim();
        if (!normalized || normalized.length > 500) {
            throw new PayoutDestinationError_1.PayoutDestinationError(`Invalid ${field}.`, "INVALID_PAYOUT_DESTINATION_VERIFICATION_INPUT");
        }
        return normalized;
    }
    normalizeRejectionCode(value) {
        if (typeof value !== "string") {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid rejection code.", "INVALID_PAYOUT_DESTINATION_REJECTION_CODE");
        }
        const normalized = value.trim();
        if (!/^[A-Z][A-Z0-9_]*$/.test(normalized) || normalized.length > 64) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Invalid rejection code.", "INVALID_PAYOUT_DESTINATION_REJECTION_CODE");
        }
        return normalized;
    }
}
exports.PayoutDestinationVerificationService = PayoutDestinationVerificationService;
exports.payoutDestinationVerificationService = new PayoutDestinationVerificationService();
