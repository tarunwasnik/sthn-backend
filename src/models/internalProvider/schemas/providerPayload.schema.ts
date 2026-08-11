// backend/src/models/internalProvider/schemas/providerPayload.schema.ts

import { Schema } from "mongoose";

/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Payload Schema
 * ------------------------------------------------------------------
 *
 * Stores the raw request and response payloads exchanged with a
 * payment provider.
 *
 * Payloads are intentionally stored as Mixed because payment
 * providers return different JSON structures for different
 * operations and API versions.
 *
 * This schema is reused across all Internal Provider models.
 *
 * NOTE:
 * These payloads are for auditing, debugging, replay and
 * reconciliation. They are NOT part of the Financial Domain's
 * source of truth.
 * ------------------------------------------------------------------
 */

export const ProviderPayloadSchema = new Schema(
  {
    /**
     * Raw request payload sent to the provider.
     */
    request: {
      type: Schema.Types.Mixed,
      default: {},
    },

    /**
     * Raw response payload returned by the provider.
     */
    response: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    _id: false,
  },
);

export default ProviderPayloadSchema;
