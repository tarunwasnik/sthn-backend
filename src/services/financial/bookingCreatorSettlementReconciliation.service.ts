import crypto from "node:crypto";
import mongoose, { Types } from "mongoose";

import { AuditAction } from "../../enums/financial/auditAction.enum";
import { BookingCreatorSettlementFailureClassification as Classification } from "../../enums/financial/bookingCreatorSettlementFailureClassification.enum";
import {
  BookingCreatorSettlementReconciliationResult as Result,
  BookingCreatorSettlementReconciliationStatus as Status,
} from "../../enums/financial/bookingCreatorSettlementReconciliation.enum";
import { BookingCreatorSettlementOperationalError } from "../../errors/financial/BookingCreatorSettlementOperationalError";
import { bookingCreatorSettlementReconciliationRepository } from "../../repositories/bookingCreatorSettlementReconciliation.repository";
import { createFinancialAudit } from "../auditLog.service";
import { bookingCreatorSettlementOperationalInspectionService } from "./bookingCreatorSettlementOperationalInspection.service";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export class BookingCreatorSettlementReconciliationService {
  async reconcile(
    settlementReference: string,
    actor: { type: "SYSTEM" | "ADMIN"; id?: string } = { type: "SYSTEM" },
  ) {
    const inspection =
      await bookingCreatorSettlementOperationalInspectionService.inspect(
        settlementReference,
      );
    const session = await mongoose.startSession();
    try {
      const resultBox: {
        value: {
          reconciliationReference: string;
          settlementReference: string;
          bookingReference: string;
          allocationReference: string;
          walletReference: string;
          creatorReference: string;
          status: Status;
          result: Result;
          classification: Classification;
          issuesFound: string[];
          checkedAt: Date;
          version: number;
        } | null;
      } = { value: null };
      await session.withTransaction(async () => {
        const checkedAt = new Date();
        const healthy = inspection.classification === Classification.HEALTHY;
        const reconciliationReference =
          `BCSR-${hash(settlementReference).slice(0, 20).toUpperCase()}`;
        const reconciliation =
          await bookingCreatorSettlementReconciliationRepository
            .upsertObservation({
              reconciliationReference,
              reconciliationKey:
                `booking-creator-settlement-reconciliation:${settlementReference}`,
              settlementId: inspection.settlement._id as Types.ObjectId,
              settlementReference,
              bookingReference: inspection.bookingReference,
              allocationReference: inspection.allocationReference,
              walletReference: inspection.walletReference,
              creatorReference: inspection.creatorReference,
              status: healthy ? Status.RESOLVED : Status.OPEN,
              result: healthy ? Result.VALID : Result.ISSUES_FOUND,
              classification: inspection.classification,
              issuesFound: inspection.issues,
              checkedAt,
              snapshot: inspection.snapshot,
              snapshotFingerprint: inspection.snapshotFingerprint,
            }, session);
        await createFinancialAudit({
          action: AuditAction.BOOKING_CREATOR_SETTLEMENT_RECONCILED,
          actor: actor.type === "ADMIN"
            ? { type: "ADMIN", id: new Types.ObjectId(actor.id) }
            : { type: "SYSTEM", reference: "booking-creator-settlement-reconciliation" },
          entityType: "BOOKING_CREATOR_SETTLEMENT_RECONCILIATION",
          entityId: reconciliation._id as Types.ObjectId,
          financialContext: {
            domain: "BOOKING_WALLET",
            primaryReference: reconciliation.reconciliationReference,
            settlementReference,
            bookingReference: inspection.bookingReference,
            amount: inspection.settlement.creatorAmount,
            currency: inspection.settlement.currency,
          },
          transition: {
            toStatus: reconciliation.status,
            outcome: healthy ? "SUCCEEDED" : "CONFLICT",
          },
          metadata: {
            classification: inspection.classification,
            reasonCode: healthy
              ? "SETTLEMENT_INTEGRITY_VALID"
              : inspection.classification,
          },
          session,
        });
        resultBox.value = {
          reconciliationReference: reconciliation.reconciliationReference,
          settlementReference,
          bookingReference: inspection.bookingReference,
          allocationReference: inspection.allocationReference,
          walletReference: inspection.walletReference,
          creatorReference: inspection.creatorReference,
          status: reconciliation.status,
          result: reconciliation.result,
          classification: reconciliation.classification,
          issuesFound: reconciliation.issuesFound,
          checkedAt: reconciliation.checkedAt,
          version: reconciliation.version,
        };
      });
      if (!resultBox.value) {
        throw new BookingCreatorSettlementOperationalError(
          "Settlement reconciliation did not commit.",
          "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT",
        );
      }
      return resultBox.value;
    } catch (error) {
      if (error instanceof BookingCreatorSettlementOperationalError) throw error;
      throw new BookingCreatorSettlementOperationalError(
        "Settlement reconciliation transaction failed.",
        "BOOKING_CREATOR_SETTLEMENT_OPERATIONAL_TRANSACTION_CONFLICT",
        error,
      );
    } finally {
      await session.endSession();
    }
  }
}

export const bookingCreatorSettlementReconciliationService =
  new BookingCreatorSettlementReconciliationService();
