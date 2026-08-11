import { Types } from "mongoose";
import { generateFinancialReference } from "../../utils/financial/reference.util";
import { walletTopUpOperationalAuditRepository } from "../../repositories/walletTopUpOperationalAudit.repository";
import { WalletTopUpOperationalAction } from "../../enums/financial/walletTopUpOperationalAction.enum";
import { WalletTopUpReconciliationClassification } from "../../enums/financial/walletTopUpReconciliationClassification.enum";

export interface WalletTopUpOperationalAuditInput {
  topUpReference: string;
  reconciliationReference?: string;
  action: WalletTopUpOperationalAction;
  actorType: "ADMIN" | "SYSTEM";
  actorId?: Types.ObjectId;
  result: "SUCCEEDED" | "FAILED" | "REJECTED";
  classificationBefore?: WalletTopUpReconciliationClassification;
  classificationAfter?: WalletTopUpReconciliationClassification;
  reasonCode: string;
  metadata?: Record<string, string | number | boolean>;
}

export class WalletTopUpOperationalAuditService {
  async record(input: WalletTopUpOperationalAuditInput): Promise<void> {
    if (input.actorType === "ADMIN" && !input.actorId) {
      throw new Error("Operational audit requires authenticated Admin identity.");
    }
    await walletTopUpOperationalAuditRepository.create({
      ...input,
      auditReference: generateFinancialReference("AUDIT"),
      createdAt: new Date(),
    });
  }
}

export const walletTopUpOperationalAuditService = new WalletTopUpOperationalAuditService();
