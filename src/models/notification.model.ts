import mongoose, { Document, Schema } from "mongoose";

export const NOTIFICATION_CATEGORIES = [
  "BOOKING",
  "FINANCIAL",
  "CREATOR_APPLICATION",
  "PROFILE_VERIFICATION",
  "DISPUTE",
  "GOVERNANCE",
  "ADMIN_COMMUNICATION",
  "SYSTEM",
] as const;

export const NOTIFICATION_TYPES = [
  "BOOKING_UPDATE",
  "FINANCIAL_UPDATE",
  "CREATOR_APPLICATION_UPDATE",
  "PROFILE_VERIFICATION_UPDATE",
  "DISPUTE_UPDATE",
  "GOVERNANCE_UPDATE",
  "ADMIN_MESSAGE",
  "SYSTEM_ANNOUNCEMENT",
] as const;

export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
export type NotificationType = typeof NOTIFICATION_TYPES[number];

export interface INotificationMetadata {
  entityType?: "BOOKING" | "PAYMENT" | "CREATOR_APPLICATION" | "PROFILE_VERIFICATION" | "DISPUTE" | "GOVERNANCE" | "SYSTEM";
  entityId?: mongoose.Types.ObjectId;
  reference?: string;
  amount?: number;
  currency?: string;
}

export interface INotification extends Document {
  recipientId: mongoose.Types.ObjectId;
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  body: string;
  navigationPath?: string;
  metadata?: INotificationMetadata;
  readAt?: Date | null;
  idempotencyKey: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const NOTIFICATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_TITLE_MAX_LENGTH = 160;
export const NOTIFICATION_BODY_MAX_LENGTH = 2_000;
export const NOTIFICATION_IDEMPOTENCY_KEY_MAX_LENGTH = 200;

const NotificationMetadataSchema = new Schema<INotificationMetadata>({
  entityType: {
    type: String,
    enum: ["BOOKING", "PAYMENT", "CREATOR_APPLICATION", "PROFILE_VERIFICATION", "DISPUTE", "GOVERNANCE", "SYSTEM"],
    uppercase: true,
  },
  entityId: { type: Schema.Types.ObjectId },
  reference: { type: String, trim: true, maxlength: 160 },
  amount: {
    type: Number,
    min: 0,
    validate: {
      validator: (value: number | undefined) => value === undefined || Number.isSafeInteger(value),
      message: "Notification metadata amount must be a safe integer minor-unit value.",
    },
  },
  currency: { type: String, trim: true, uppercase: true, match: /^[A-Z]{3,8}$/ },
}, { _id: false, strict: "throw" });

const NotificationSchema = new Schema<INotification>({
  recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
  category: { type: String, enum: NOTIFICATION_CATEGORIES, required: true, immutable: true, index: true },
  type: { type: String, enum: NOTIFICATION_TYPES, required: true, immutable: true },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: NOTIFICATION_TITLE_MAX_LENGTH, immutable: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: NOTIFICATION_BODY_MAX_LENGTH, immutable: true },
  navigationPath: { type: String, trim: true, maxlength: 500, immutable: true },
  metadata: { type: NotificationMetadataSchema, immutable: true },
  readAt: { type: Date, default: null },
  idempotencyKey: { type: String, required: true, trim: true, minlength: 1, maxlength: NOTIFICATION_IDEMPOTENCY_KEY_MAX_LENGTH, immutable: true },
  expiresAt: {
    type: Date,
    required: true,
    immutable: true,
    default: () => new Date(Date.now() + NOTIFICATION_RETENTION_MS),
  },
}, { timestamps: true });

NotificationSchema.index({ recipientId: 1, createdAt: -1, _id: -1 }, { name: "notification_recipient_history" });
NotificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1, _id: -1 }, { name: "notification_recipient_unread_history" });
NotificationSchema.index({ recipientId: 1, idempotencyKey: 1 }, { unique: true, name: "notification_recipient_idempotency" });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "notification_expires_at_ttl" });

export const Notification = mongoose.model<INotification>("Notification", NotificationSchema);
