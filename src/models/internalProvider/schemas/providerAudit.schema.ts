//backend/src/models/internalProvider/schemas/providerAudit.schema.ts

import { Schema } from "mongoose";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Audit Schema
 * ------------------------------------------------------------------
 *
 * Shared audit information used across every Internal Provider model.
 * ------------------------------------------------------------------
 */

export const ProviderAuditSchema = new Schema(
  {
    /**
     * User or system that created the record.
     */
    createdBy: {
      type: String,
      default: null,
      trim: true,
    },

    /**
     * User or system that last updated the record.
     */
    updatedBy: {
      type: String,
      default: null,
      trim: true,
    },

    /**
     * Optional administrative notes.
     */
    notes: {
      type: String,
      default: null,
      trim: true,
    },

    /**
     * Timestamp of the most recent lifecycle transition.
     */
    lastStatusChangedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

export default ProviderAuditSchema;
