import { ClientSession } from "mongoose";

import { WalletConversionAudit, WalletConversionAuditDocument } from
  "../models/walletConversionAudit.model";

type Creation = Pick<WalletConversionAuditDocument,
  "auditKey" | "action" | "conversionReference" | "sourceCurrency" |
  "targetCurrency" | "sourceAmount" | "targetAmount" |
  "fxSnapshotReference" | "fxEffectiveDate" | "requestedAt" | "decision" |
  "rejectionCode" | "adminActorId" | "decidedAt" |
  "providerRequestReference" | "providerExecutionReference" |
  "providerStatus" | "providerOutcome" | "processingAt" | "completedAt" |
  "failureCode" | "accountingReference" | "transactionReference" |
  "sourceProjectionReference" | "targetProjectionReference" |
  "sourceWalletVersion" | "targetWalletVersion" | "failedAt" |
  "reconciliationReference" | "classification" | "severity" | "issues" |
  "retryPerformed" | "repairPerformed">;

export class WalletConversionAuditRepository {
  findByAuditKey(auditKey: string, session?: ClientSession) {
    return WalletConversionAudit.findOne({ auditKey })
      .select("+auditKey +adminActorId").session(session ?? null).exec();
  }

  async createOnce(data: Creation, session: ClientSession) {
    const existing = await WalletConversionAudit.findOne({ auditKey: data.auditKey })
      .session(session).exec();
    if (existing) return existing;
    try {
      const [created] = await WalletConversionAudit.create([data], { session });
      return created;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const raced = await WalletConversionAudit.findOne({ auditKey: data.auditKey })
        .session(session).exec();
      if (raced) return raced;
      throw error;
    }
  }
}

export const walletConversionAuditRepository =
  new WalletConversionAuditRepository();
