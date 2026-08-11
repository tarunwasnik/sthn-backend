import crypto from "node:crypto";
import mongoose, { Types } from "mongoose";

import { AuditAction } from "../../enums/financial/auditAction.enum";
import { BookingCreatorSettlementFailureClassification as Classification } from "../../enums/financial/bookingCreatorSettlementFailureClassification.enum";
import {
  BookingCreatorSettlementRepairAction as RepairAction,
} from "../../enums/financial/bookingCreatorSettlementReconciliation.enum";
import { BookingCreatorSettlementStatus } from "../../enums/financial/bookingCreatorSettlementStatus.enum";
import { BookingCreatorSettlementOperationalError } from "../../errors/financial/BookingCreatorSettlementOperationalError";
import { bookingCreatorSettlementReconciliationRepository } from "../../repositories/bookingCreatorSettlementReconciliation.repository";
import { bookingCreatorSettlementRepairOperationRepository } from "../../repositories/bookingCreatorSettlementRepairOperation.repository";
import { bookingCreatorSettlementRepository } from "../../repositories/bookingCreatorSettlement.repository";
import { createFinancialAudit } from "../auditLog.service";
import { bookingCreatorSettlementOperationalInspectionService } from "./bookingCreatorSettlementOperationalInspection.service";
import { bookingCreatorSettlementService } from "./bookingCreatorSettlement.service";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export class BookingCreatorSettlementRepairService {
  async repair(
    reconciliationReference: string,
    action: RepairAction,
    adminUserId: string,
    reason = "Bounded deterministic settlement metadata repair",
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
    const operationKey =
      `booking-creator-settlement-repair:${reconciliationReference}:${action}`;
    const operationReference =
      `BCSRP-${hash(operationKey).slice(0, 20).toUpperCase()}`;
    const existing =
      await bookingCreatorSettlementRepairOperationRepository
        .findByOperationKey(operationKey);
    if (existing?.status === "APPLIED") {
      await bookingCreatorSettlementService.validateReplay(
        inspection.settlement.bookingId.toString(),
      );
      return {
        operationReference: existing.operationReference,
        settlementReference: inspection.settlement.settlementReference,
        action,
        status: existing.status,
        repairedFields: existing.repairedFields,
        replay: true,
      };
    }
    const allowed =
      inspection.settlement.status === BookingCreatorSettlementStatus.SETTLED &&
      inspection.financialEffectValid &&
      (
        action === RepairAction.RESTORE_MISSING_AUDIT &&
        inspection.classification === Classification.MISSING_AUDIT ||
        action === RepairAction.RESTORE_REPLAY_METADATA &&
        inspection.classification === Classification.REPLAY_REQUIRED &&
        !inspection.replayMetadataValid
      );
    if (!allowed) {
      throw new BookingCreatorSettlementOperationalError(
        "Requested repair is not allowed for this settlement classification.",
        "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_REPAIR_NOT_ALLOWED",
      );
    }
    const session = await mongoose.startSession();
    try {
      let result: Record<string, unknown> | null = null;
      await session.withTransaction(async () => {
        const existing =
          await bookingCreatorSettlementRepairOperationRepository
            .findByOperationKey(operationKey, session);
        if (existing?.status === "APPLIED") {
          result = {
            operationReference: existing.operationReference,
            settlementReference: inspection.settlement.settlementReference,
            action,
            status: existing.status,
            repairedFields: existing.repairedFields,
            replay: true,
          };
          return;
        }
        const operation =
          await bookingCreatorSettlementRepairOperationRepository.create({
            operationReference,
            operationKey,
            reconciliationId: reconciliation._id as Types.ObjectId,
            reconciliationReference,
            settlementId: inspection.settlement._id as Types.ObjectId,
            settlementReference: inspection.settlement.settlementReference,
            action,
            snapshotFingerprint: inspection.snapshotFingerprint,
            actorId: new Types.ObjectId(adminUserId),
            reason,
          }, session);
        const repairedFields: string[] = [];
        if (action === RepairAction.RESTORE_MISSING_AUDIT) {
          await createFinancialAudit({
            action: AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
            actor: {
              type: "SYSTEM",
              reference: "booking-creator-wallet-settlement-repair",
            },
            entityType: "BOOKING_CREATOR_SETTLEMENT",
            entityId: inspection.settlement._id as Types.ObjectId,
            financialContext: {
              domain: "BOOKING_WALLET",
              primaryReference: inspection.settlement.settlementReference,
              bookingReference: inspection.bookingReference,
              settlementReference: inspection.settlement.settlementReference,
              amount: inspection.settlement.creatorAmount,
              currency: inspection.settlement.currency,
              ledgerTransactionReference:
                inspection.settlement.settlementTransactionId,
              projectionOperationReference:
                inspection.settlement.settlementProjectionOperationReference,
            },
            transition: {
              fromStatus: "PENDING",
              toStatus: "SETTLED",
              outcome: "SUCCEEDED",
            },
            metadata: {
              classification: "CREATOR_PAYABLE_WALLET_SETTLEMENT",
              reasonCode: "MISSING_SETTLEMENT_AUDIT_RESTORED",
            },
            session,
          });
          repairedFields.push("settlementAudit");
        } else {
          const restored =
            await bookingCreatorSettlementRepository.guardRestoreLedgerEntryIds({
              settlementId: inspection.settlement._id as Types.ObjectId,
              settlementKey: inspection.settlement.settlementKey,
              settlementFingerprint:
                inspection.settlement.settlementFingerprint,
              settlementTransactionId:
                inspection.settlement.settlementTransactionId,
              ledgerEntryIds: inspection.ledgerEntryIds,
              expectedVersion: inspection.settlement.version,
            }, session);
          if (!restored) {
            throw new BookingCreatorSettlementOperationalError(
              "Settlement replay metadata repair lost authority.",
              "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT",
            );
          }
          repairedFields.push("settlementLedgerEntryIds");
        }
        const completed =
          await bookingCreatorSettlementRepairOperationRepository.complete(
            operationKey,
            repairedFields,
            new Date(),
            session,
          );
        if (!completed) {
          throw new BookingCreatorSettlementOperationalError(
            "Settlement repair operation did not complete.",
            "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT",
          );
        }
        await createFinancialAudit({
          action: AuditAction.BOOKING_CREATOR_SETTLEMENT_REPAIRED,
          actor: { type: "ADMIN", id: new Types.ObjectId(adminUserId) },
          entityType: "BOOKING_CREATOR_SETTLEMENT_REPAIR",
          entityId: operation._id as Types.ObjectId,
          financialContext: {
            domain: "BOOKING_WALLET",
            primaryReference: operationReference,
            settlementReference: inspection.settlement.settlementReference,
            amount: inspection.settlement.creatorAmount,
            currency: inspection.settlement.currency,
          },
          transition: { toStatus: "APPLIED", outcome: "SUCCEEDED" },
          metadata: {
            operationReference,
            classification: inspection.classification,
            reasonCode: action,
          },
          session,
        });
        result = {
          operationReference,
          settlementReference: inspection.settlement.settlementReference,
          action,
          status: completed.status,
          repairedFields,
          replay: false,
        };
      });
      if (!result) {
        throw new BookingCreatorSettlementOperationalError(
          "Settlement repair returned no result.",
          "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT",
        );
      }
      await bookingCreatorSettlementService.validateReplay(
        inspection.settlement.bookingId.toString(),
      );
      return result;
    } catch (error) {
      const winner =
        await bookingCreatorSettlementRepairOperationRepository
          .findByOperationKey(operationKey);
      if (winner?.status === "APPLIED") {
        await bookingCreatorSettlementService.validateReplay(
          inspection.settlement.bookingId.toString(),
        );
        return {
          operationReference: winner.operationReference,
          settlementReference: inspection.settlement.settlementReference,
          action,
          status: winner.status,
          repairedFields: winner.repairedFields,
          replay: true,
        };
      }
      if (error instanceof BookingCreatorSettlementOperationalError) throw error;
      throw new BookingCreatorSettlementOperationalError(
        "Settlement repair transaction failed.",
        "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT",
        error,
      );
    } finally {
      await session.endSession();
    }
  }
}

export const bookingCreatorSettlementRepairService =
  new BookingCreatorSettlementRepairService();
