import crypto from "node:crypto";
import mongoose, { Types } from "mongoose";

import { AuditAction } from "../../enums/financial/auditAction.enum";
import { BookingCreatorSettlementFailureClassification as Classification } from "../../enums/financial/bookingCreatorSettlementFailureClassification.enum";
import { BookingCreatorSettlementStatus } from "../../enums/financial/bookingCreatorSettlementStatus.enum";
import { BookingCreatorSettlementOperationalError } from "../../errors/financial/BookingCreatorSettlementOperationalError";
import { bookingCreatorSettlementReconciliationRepository } from "../../repositories/bookingCreatorSettlementReconciliation.repository";
import { bookingCreatorSettlementRepository } from "../../repositories/bookingCreatorSettlement.repository";
import { bookingCreatorSettlementRetryAttemptRepository } from "../../repositories/bookingCreatorSettlementRetryAttempt.repository";
import { createFinancialAudit } from "../auditLog.service";
import { bookingCreatorSettlementOperationalInspectionService } from "./bookingCreatorSettlementOperationalInspection.service";
import { bookingCreatorSettlementService } from "./bookingCreatorSettlement.service";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export class BookingCreatorSettlementRetryService {
  async retry(
    reconciliationReference: string,
    actor: { type: "SYSTEM" | "ADMIN"; id?: string } = { type: "SYSTEM" },
    reason = "Retry deterministic settlement completion guard",
  ) {
    const reconciliation =
      await bookingCreatorSettlementReconciliationRepository.findByReference(
        reconciliationReference,
      );
    if (!reconciliation) {
      throw new BookingCreatorSettlementOperationalError(
        "Settlement reconciliation was not found.",
        "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_RECONCILIATION_NOT_FOUND",
      );
    }
    const inspection =
      await bookingCreatorSettlementOperationalInspectionService.inspect(
        reconciliation.settlementReference,
      );
    if (
      inspection.classification !== Classification.REPLAY_REQUIRED ||
      inspection.settlement.status !== BookingCreatorSettlementStatus.PENDING ||
      !inspection.financialEffectValid ||
      !inspection.auditValid ||
      !inspection.replayMetadataValid
    ) {
      throw new BookingCreatorSettlementOperationalError(
        "Only a fully proven interrupted PENDING completion guard may be retried.",
        "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_RETRY_NOT_ALLOWED",
      );
    }
    const operationKey =
      `booking-creator-settlement-retry:${reconciliationReference}:` +
      inspection.snapshotFingerprint;
    const operationReference =
      `BCSRT-${hash(operationKey).slice(0, 20).toUpperCase()}`;
    const session = await mongoose.startSession();
    try {
      let result: Record<string, unknown> | null = null;
      await session.withTransaction(async () => {
        const existing =
          await bookingCreatorSettlementRetryAttemptRepository
            .findByOperationKey(operationKey, session);
        if (existing?.status === "APPLIED") {
          result = {
            operationReference: existing.operationReference,
            settlementReference: inspection.settlement.settlementReference,
            status: existing.status,
            resultCode: existing.resultCode,
            replay: true,
          };
          return;
        }
        await bookingCreatorSettlementRetryAttemptRepository.create({
          operationReference,
          operationKey,
          reconciliationId: reconciliation._id as Types.ObjectId,
          reconciliationReference,
          settlementId: inspection.settlement._id as Types.ObjectId,
          settlementReference: inspection.settlement.settlementReference,
          actorType: actor.type,
          actorId: actor.id ? new Types.ObjectId(actor.id) : undefined,
          reason,
          startedAt: new Date(),
        }, session);
        const completed =
          await bookingCreatorSettlementRepository
            .guardOperationalPendingToSettled({
              settlementId: inspection.settlement._id as Types.ObjectId,
              settlementKey: inspection.settlement.settlementKey,
              settlementFingerprint:
                inspection.settlement.settlementFingerprint,
              settlementTransactionId:
                inspection.settlement.settlementTransactionId,
              settlementProjectionOperationReference:
                inspection.settlement.settlementProjectionOperationReference,
              ledgerEntryIds: inspection.ledgerEntryIds,
              settledAt: new Date(),
              expectedVersion: inspection.settlement.version,
            }, session);
        if (!completed) {
          throw new BookingCreatorSettlementOperationalError(
            "Settlement completion guard retry lost authority.",
            "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT",
          );
        }
        const attempt =
          await bookingCreatorSettlementRetryAttemptRepository.complete(
            operationKey,
            "PENDING_TO_SETTLED_APPLIED",
            new Date(),
            session,
          );
        if (!attempt) {
          throw new BookingCreatorSettlementOperationalError(
            "Settlement retry attempt did not complete.",
            "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT",
          );
        }
        await createFinancialAudit({
          action: AuditAction.BOOKING_CREATOR_SETTLEMENT_RETRIED,
          actor: actor.type === "ADMIN"
            ? { type: "ADMIN", id: new Types.ObjectId(actor.id) }
            : { type: "SYSTEM", reference: "booking-creator-settlement-retry" },
          entityType: "BOOKING_CREATOR_SETTLEMENT_RETRY",
          entityId: attempt._id as Types.ObjectId,
          financialContext: {
            domain: "BOOKING_WALLET",
            primaryReference: operationReference,
            settlementReference: completed.settlementReference,
            amount: completed.creatorAmount,
            currency: completed.currency,
          },
          transition: {
            fromStatus: BookingCreatorSettlementStatus.PENDING,
            toStatus: BookingCreatorSettlementStatus.SETTLED,
            outcome: "SUCCEEDED",
          },
          metadata: {
            operationReference,
            classification: Classification.REPLAY_REQUIRED,
            reasonCode: "PENDING_COMPLETION_GUARD_RETRIED",
          },
          session,
        });
        result = {
          operationReference,
          settlementReference: completed.settlementReference,
          status: attempt.status,
          resultCode: attempt.resultCode,
          replay: false,
        };
      });
      if (!result) {
        throw new BookingCreatorSettlementOperationalError(
          "Settlement retry returned no result.",
          "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT",
        );
      }
      await bookingCreatorSettlementService.validateReplay(
        inspection.settlement.bookingId.toString(),
      );
      return result;
    } catch (error) {
      const winner =
        await bookingCreatorSettlementRetryAttemptRepository
          .findByOperationKey(operationKey);
      if (winner?.status === "APPLIED") {
        await bookingCreatorSettlementService.validateReplay(
          inspection.settlement.bookingId.toString(),
        );
        return {
          operationReference: winner.operationReference,
          settlementReference: inspection.settlement.settlementReference,
          status: winner.status,
          resultCode: winner.resultCode,
          replay: true,
        };
      }
      if (error instanceof BookingCreatorSettlementOperationalError) throw error;
      throw new BookingCreatorSettlementOperationalError(
        "Settlement retry transaction failed.",
        "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT",
        error,
      );
    } finally {
      await session.endSession();
    }
  }
}

export const bookingCreatorSettlementRetryService =
  new BookingCreatorSettlementRetryService();
