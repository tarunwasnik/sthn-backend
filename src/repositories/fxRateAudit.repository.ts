import { ClientSession } from "mongoose";

import { FxRateAudit, FxRateAuditDocument } from
  "../models/fxRateAudit.model";

export class FxRateAuditRepository {
  async createOnce(
    data: Omit<FxRateAuditDocument, keyof Document | "_id" | "createdAt">,
    session?: ClientSession,
  ) {
    const existing = await FxRateAudit.findOne({ auditKey: data.auditKey })
      .session(session ?? null).exec();
    if (existing) return existing;
    try {
      const [created] = await FxRateAudit.create([data], { session });
      return created;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const raced = await FxRateAudit.findOne({ auditKey: data.auditKey })
        .session(session ?? null).exec();
      if (raced) return raced;
      throw error;
    }
  }
}

export const fxRateAuditRepository = new FxRateAuditRepository();
