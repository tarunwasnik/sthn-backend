//backend/src/models/adminThrottle.model.ts


/**
 * Phase 27 — Admin Throttle Model
 *
 * Represents temporary, auto-expiring restrictions applied to admins
 * as a result of detected abuse signals.
 *
 * Throttles are:
 * - actor-scoped
 * - time-bounded
 * - explainable
 * - reversible
 * - audit-friendly
 */

import mongoose, { Schema, Document } from "mongoose";
import { AdminAbuseSignalType } from "../services/adminActions/adminActionAbuseSignals";

export interface IAdminThrottle extends Document {
  adminId: string;

  signalType: AdminAbuseSignalType;
  derivedFromAlertType: string;

  reason: string;

  throttleUntil: Date;
  expiresAt: Date;

  createdAt: Date;
}

const AdminThrottleSchema = new Schema<IAdminThrottle>(
  {
    adminId: {
      type: String,
      required: true,
      index: true,
    },

    signalType: {
      type: String,
      required: true,
      index: true,
    },

    derivedFromAlertType: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      required: true,
    },

    throttleUntil: {
      type: Date,
      required: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // 🔥 TTL auto-expiry
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

export const AdminThrottle = mongoose.model<IAdminThrottle>(
  "AdminThrottle",
  AdminThrottleSchema
);