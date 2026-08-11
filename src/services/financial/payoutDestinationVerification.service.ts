import mongoose from "mongoose";

import { PayoutDestinationVerificationAction } from "../../enums/financial/payoutDestinationVerificationAction.enum";
import { PayoutDestinationVerificationStatus } from "../../enums/financial/payoutDestinationVerificationStatus.enum";
import { PayoutDestinationError } from "../../errors/financial/PayoutDestinationError";
import { IPayoutDestination } from "../../models/payoutDestination.model";
import { payoutDestinationRepository } from "../../repositories/payoutDestination.repository";
import { createAuditLog } from "../auditLog.service";
import { hasReferenceType, isValidFinancialReference } from "../../utils/financial/reference.util";

export interface ApplyPayoutDestinationVerificationDecisionInput {
  destinationReference: string;
  action: PayoutDestinationVerificationAction;
  adminActorId: string;
  rejectionCode?: string;
  rejectionReason?: string;
  note?: string;
}

export interface PayoutDestinationVerificationDecisionResult {
  destination: IPayoutDestination;
  previousStatus: PayoutDestinationVerificationStatus;
  changed: boolean;
  idempotent: boolean;
}

class RetryableVerificationTransitionMiss extends Error {}

export class PayoutDestinationVerificationService {
  constructor(private readonly repository = payoutDestinationRepository) {}

  async applyDecision(
    input: ApplyPayoutDestinationVerificationDecisionInput,
  ): Promise<PayoutDestinationVerificationDecisionResult> {
    const normalized = this.validateAndNormalize(input);
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const session = await mongoose.startSession();
      let result: PayoutDestinationVerificationDecisionResult | null = null;

      try {
        await session.withTransaction(async () => {
          const current = await this.repository.findByReferenceForVerification(
            normalized.destinationReference,
            session,
          );

          if (!current) {
            throw new PayoutDestinationError(
              "Payout destination not found.",
              "PAYOUT_DESTINATION_NOT_FOUND",
            );
          }

          const terminalResult = this.resolveTerminalState(current, normalized.action);
          if (terminalResult) {
            result = terminalResult;
            return;
          }

          const decisionAt = new Date();
          const update = this.buildTransitionUpdate(current, normalized, decisionAt);
          const transitioned = await this.repository.transitionVerificationIfUnverified(
            normalized.destinationReference,
            current.isActive,
            update,
            session,
          );

          if (!transitioned) {
            throw new RetryableVerificationTransitionMiss();
          }

          await createAuditLog({
            actorType: "ADMIN",
            actorId: new mongoose.Types.ObjectId(normalized.adminActorId),
            action:
              normalized.action === PayoutDestinationVerificationAction.VERIFY
                ? "PAYOUT_DESTINATION_VERIFIED"
                : "PAYOUT_DESTINATION_REJECTED",
            entityType: "PAYOUT_DESTINATION",
            entityId: transitioned._id as mongoose.Types.ObjectId,
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
      } catch (error) {
        if (!(error instanceof RetryableVerificationTransitionMiss)) {
          throw error;
        }
      } finally {
        await session.endSession();
      }
    }

    const finalState = await this.repository.findByReferenceForVerification(
      normalized.destinationReference,
    );
    if (!finalState) {
      throw new PayoutDestinationError(
        "Payout destination not found.",
        "PAYOUT_DESTINATION_NOT_FOUND",
      );
    }

    const terminalResult = this.resolveTerminalState(finalState, normalized.action);
    if (terminalResult) {
      return terminalResult;
    }

    throw new PayoutDestinationError(
      "Payout destination verification changed concurrently. Retry the request.",
      "PAYOUT_DESTINATION_VERIFICATION_TRANSITION_CONFLICT",
    );
  }

  serializeForAdmin(destination: IPayoutDestination) {
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

  private validateAndNormalize(
    input: ApplyPayoutDestinationVerificationDecisionInput,
  ): ApplyPayoutDestinationVerificationDecisionInput {
    if (!mongoose.Types.ObjectId.isValid(input.adminActorId)) {
      throw new PayoutDestinationError(
        "Invalid admin identity.",
        "INVALID_PAYOUT_DESTINATION_VERIFICATION_ACTOR",
      );
    }
    if (
      !isValidFinancialReference(input.destinationReference) ||
      !hasReferenceType(input.destinationReference, "PAYOUT_DESTINATION")
    ) {
      throw new PayoutDestinationError(
        "Invalid payout destination reference.",
        "INVALID_PAYOUT_DESTINATION_REFERENCE",
      );
    }
    if (!Object.values(PayoutDestinationVerificationAction).includes(input.action)) {
      throw new PayoutDestinationError(
        "Invalid payout destination verification action.",
        "INVALID_PAYOUT_DESTINATION_VERIFICATION_ACTION",
      );
    }

    const note = this.normalizeOptionalText(input.note, "note");
    if (input.action === PayoutDestinationVerificationAction.VERIFY) {
      if (input.rejectionCode !== undefined || input.rejectionReason !== undefined) {
        throw new PayoutDestinationError(
          "Verification decisions cannot include rejection details.",
          "INVALID_PAYOUT_DESTINATION_VERIFICATION_INPUT",
        );
      }
      return { ...input, note };
    }

    const rejectionCode = this.normalizeRejectionCode(input.rejectionCode);
    const rejectionReason = this.normalizeRequiredText(
      input.rejectionReason,
      "rejection reason",
    );
    return { ...input, rejectionCode, rejectionReason, note };
  }

  private resolveTerminalState(
    destination: IPayoutDestination,
    action: PayoutDestinationVerificationAction,
  ): PayoutDestinationVerificationDecisionResult | null {
    const expectedStatus =
      action === PayoutDestinationVerificationAction.VERIFY
        ? PayoutDestinationVerificationStatus.VERIFIED
        : PayoutDestinationVerificationStatus.REJECTED;

    if (destination.verificationStatus === expectedStatus) {
      return {
        destination,
        previousStatus: destination.verificationStatus,
        changed: false,
        idempotent: true,
      };
    }
    if (destination.verificationStatus !== PayoutDestinationVerificationStatus.UNVERIFIED) {
      throw new PayoutDestinationError(
        "Payout destination verification conflicts with its terminal status.",
        "PAYOUT_DESTINATION_VERIFICATION_CONFLICT",
      );
    }
    return null;
  }

  private buildTransitionUpdate(
    current: IPayoutDestination,
    input: ApplyPayoutDestinationVerificationDecisionInput,
    decisionAt: Date,
  ): Record<string, unknown> {
    if (input.action === PayoutDestinationVerificationAction.VERIFY) {
      return {
        $set: {
          verificationStatus: PayoutDestinationVerificationStatus.VERIFIED,
          verifiedAt: decisionAt,
          verifiedBy: new mongoose.Types.ObjectId(input.adminActorId),
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
        verificationStatus: PayoutDestinationVerificationStatus.REJECTED,
        rejectedAt: decisionAt,
        rejectedBy: new mongoose.Types.ObjectId(input.adminActorId),
        rejectionCode: input.rejectionCode!,
        rejectionReason: input.rejectionReason!,
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

  private auditBefore(destination: IPayoutDestination) {
    return {
      destinationReference: destination.destinationReference,
      type: destination.type,
      maskedIdentifier: destination.maskedIdentifier,
      verificationStatus: destination.verificationStatus,
      isActive: destination.isActive,
    };
  }

  private auditAfter(
    destination: IPayoutDestination,
    action: PayoutDestinationVerificationAction,
  ) {
    if (action === PayoutDestinationVerificationAction.VERIFY) {
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

  private normalizeOptionalText(value: unknown, field: string): string | undefined {
    if (value === undefined) return undefined;
    return this.normalizeRequiredText(value, field);
  }

  private normalizeRequiredText(value: unknown, field: string): string {
    if (typeof value !== "string") {
      throw new PayoutDestinationError(`Invalid ${field}.`, "INVALID_PAYOUT_DESTINATION_VERIFICATION_INPUT");
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > 500) {
      throw new PayoutDestinationError(`Invalid ${field}.`, "INVALID_PAYOUT_DESTINATION_VERIFICATION_INPUT");
    }
    return normalized;
  }

  private normalizeRejectionCode(value: unknown): string {
    if (typeof value !== "string") {
      throw new PayoutDestinationError("Invalid rejection code.", "INVALID_PAYOUT_DESTINATION_REJECTION_CODE");
    }
    const normalized = value.trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(normalized) || normalized.length > 64) {
      throw new PayoutDestinationError("Invalid rejection code.", "INVALID_PAYOUT_DESTINATION_REJECTION_CODE");
    }
    return normalized;
  }
}

export const payoutDestinationVerificationService =
  new PayoutDestinationVerificationService();
