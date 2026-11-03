import mongoose, { Document, Schema } from "mongoose";
import { ProviderAssetEntityType } from "../enums/providerAsset.enums";

/**
 * Durable, non-executing handoff for a future creator-media cleanup worker.
 * No current scheduler consumes this collection.
 */
export interface CreatorMediaCleanupIntentDocument extends Document {
  eventKey: string; actorId: mongoose.Types.ObjectId; entityType: ProviderAssetEntityType; entityId: mongoose.Types.ObjectId; slot: string; formerReference: string; providerAssetId: string; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<CreatorMediaCleanupIntentDocument>({
  eventKey: { type: String, required: true, unique: true, maxlength: 240 },
  actorId: { type: Schema.Types.ObjectId, required: true, index: true },
  entityType: { type: String, required: true, enum: ["CREATOR_APPLICATION", "CREATOR_PROFILE", "CREATOR_SERVICE"], index: true },
  entityId: { type: Schema.Types.ObjectId, required: true, index: true },
  slot: { type: String, required: true, maxlength: 100 },
  formerReference: { type: String, required: true, maxlength: 2048 },
  providerAssetId: { type: String, required: true, maxlength: 512 },
}, { timestamps: true });
schema.index({ entityType: 1, entityId: 1, slot: 1 });
export const CreatorMediaCleanupIntent = mongoose.model<CreatorMediaCleanupIntentDocument>("CreatorMediaCleanupIntent", schema);
