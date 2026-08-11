//backend/src/models/auditLog.model.ts


import mongoose, { Schema, Document } from "mongoose";

export type AuditActorType = "USER" | "ADMIN" | "CREATOR" | "SYSTEM" | "PROVIDER";
export type AuditCategory = "AUTH" | "PROFILE" | "GOVERNANCE" | "BOOKING" | "FINANCIAL" | "ADMIN" | "SYSTEM";
export type FinancialAuditDomain = "PAYMENT" | "REFUND" | "ESCROW" | "SETTLEMENT" | "WITHDRAWAL" | "PAYOUT" | "BOOKING_WALLET";
export type AuditOutcome = "SUCCEEDED" | "FAILED" | "PROCESSING" | "UNKNOWN" | "BLOCKED" | "REPLAYED" | "CONFLICT";

export interface IAuditLog extends Document {
  actorId?: mongoose.Types.ObjectId; // null for system jobs
  actorType: AuditActorType;
  actorReference?: string;
  category?: AuditCategory;

  action: string; // e.g. USER_SUSPENDED, DISPUTE_RESOLVED
  entityType: string; // USER | BOOKING | DISPUTE | CREATOR_PROFILE
  entityId: mongoose.Types.ObjectId;

  before?: Record<string, any>;
  after?: Record<string, any>;
  financialContext?: {
    domain: FinancialAuditDomain; primaryReference: string; paymentReference?: string;
    bookingReference?: string; refundReference?: string; settlementReference?: string;
    withdrawalReference?: string; payoutReference?: string; provider?: string;
    providerReference?: string; amount?: number; currency?: string;
    ledgerTransactionReference?: string; projectionOperationReference?: string;
  };
  transition?: { fromStatus?: string; toStatus?: string; outcome?: AuditOutcome };
  metadata?: Record<string, string | number | boolean>;

  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    actorType: {
      type: String,
      enum: ["USER", "ADMIN", "CREATOR", "SYSTEM", "PROVIDER"],
      required: true,
      index: true,
    },
    actorReference: { type: String, trim: true, maxlength: 160 },
    category: { type: String, enum: ["AUTH", "PROFILE", "GOVERNANCE", "BOOKING", "FINANCIAL", "ADMIN", "SYSTEM"], index: true },
    action: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    before: {
      type: Schema.Types.Mixed,
    },
    after: {
      type: Schema.Types.Mixed,
    },
    financialContext: {
      domain: { type: String, enum: ["PAYMENT", "REFUND", "ESCROW", "SETTLEMENT", "WITHDRAWAL", "PAYOUT", "BOOKING_WALLET"], index: true },
      primaryReference: { type: String, trim: true, maxlength: 160, index: true },
      paymentReference: { type: String, trim: true, maxlength: 160, index: true },
      bookingReference: { type: String, trim: true, maxlength: 160, index: true },
      refundReference: { type: String, trim: true, maxlength: 160, index: true },
      settlementReference: { type: String, trim: true, maxlength: 160, index: true },
      withdrawalReference: { type: String, trim: true, maxlength: 160, index: true },
      payoutReference: { type: String, trim: true, maxlength: 160, index: true },
      provider: { type: String, trim: true, maxlength: 64 },
      providerReference: { type: String, trim: true, maxlength: 160 },
      amount: { type: Number, min: 0 },
      currency: { type: String, trim: true, uppercase: true, maxlength: 8 },
      ledgerTransactionReference: { type: String, trim: true, maxlength: 160 },
      projectionOperationReference: { type: String, trim: true, maxlength: 160 },
    },
    transition: {
      fromStatus: { type: String, trim: true, maxlength: 64 }, toStatus: { type: String, trim: true, maxlength: 64 },
      outcome: { type: String, enum: ["SUCCEEDED", "FAILED", "PROCESSING", "UNKNOWN", "BLOCKED", "REPLAYED", "CONFLICT"] },
    },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

AuditLogSchema.index({ category: 1, createdAt: -1 }, { name: "audit_category_created_at" });
AuditLogSchema.index({ action: 1, createdAt: -1 }, { name: "audit_action_created_at" });
AuditLogSchema.index({ actorType: 1, actorId: 1, createdAt: -1 }, { name: "audit_actor_created_at" });
AuditLogSchema.index({ "financialContext.domain": 1, createdAt: -1 }, { name: "audit_financial_domain_created_at" });

export const AuditLog = mongoose.model<IAuditLog>(
  "AuditLog",
  AuditLogSchema
);
