import mongoose, { ClientSession } from "mongoose";

import { AppError } from "../../utils/AppError";
import {
  INotification,
  INotificationMetadata,
  NOTIFICATION_BODY_MAX_LENGTH,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_IDEMPOTENCY_KEY_MAX_LENGTH,
  NOTIFICATION_RETENTION_MS,
  NOTIFICATION_TITLE_MAX_LENGTH,
  NOTIFICATION_TYPES,
  NotificationCategory,
  NotificationType,
} from "../../models/notification.model";
import { NotificationRepository, notificationRepository } from "../../repositories/notification.repository";

export interface CreateNotificationInput {
  recipientId: string;
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  body: string;
  navigationPath?: string;
  metadata?: {
    entityType?: INotificationMetadata["entityType"];
    entityId?: string;
    reference?: string;
    amount?: number;
    currency?: string;
  };
  idempotencyKey: string;
  session?: ClientSession;
}

export interface CreateNotificationResult {
  notification: INotification;
  created: boolean;
}

const TYPE_FOR_CATEGORY: Record<NotificationCategory, NotificationType> = {
  BOOKING: "BOOKING_UPDATE",
  FINANCIAL: "FINANCIAL_UPDATE",
  CREATOR_APPLICATION: "CREATOR_APPLICATION_UPDATE",
  PROFILE_VERIFICATION: "PROFILE_VERIFICATION_UPDATE",
  DISPUTE: "DISPUTE_UPDATE",
  GOVERNANCE: "GOVERNANCE_UPDATE",
  ADMIN_COMMUNICATION: "ADMIN_MESSAGE",
  SYSTEM: "SYSTEM_ANNOUNCEMENT",
};

const invalid = (message: string, code: string) => Object.assign(new AppError(message, 400), { code });
const duplicateKey = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000;

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw invalid(`Invalid notification ${field}.`, "NOTIFICATION_INVALID_INPUT");
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /<\s*\/?\s*[a-zA-Z][^>]*>/.test(normalized)) {
    throw invalid(`Invalid notification ${field}.`, "NOTIFICATION_INVALID_INPUT");
  }
  return normalized;
}

function navigationPath(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw invalid("Unsafe notification navigation.", "NOTIFICATION_UNSAFE_NAVIGATION");
  const path = value.trim();
  if (!path || path.length > 500 || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000-\u001F\u007F]/.test(path)) {
    throw invalid("Unsafe notification navigation.", "NOTIFICATION_UNSAFE_NAVIGATION");
  }
  return path;
}

function metadata(value: CreateNotificationInput["metadata"]): INotificationMetadata | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Invalid notification metadata.", "NOTIFICATION_INVALID_METADATA");
  const allowed = new Set(["entityType", "entityId", "reference", "amount", "currency"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw invalid("Invalid notification metadata.", "NOTIFICATION_INVALID_METADATA");
  const result: INotificationMetadata = {};
  if (value.entityType !== undefined) {
    const allowedEntityTypes = ["BOOKING", "PAYMENT", "CREATOR_APPLICATION", "PROFILE_VERIFICATION", "DISPUTE", "GOVERNANCE", "SYSTEM"] as const;
    if (!allowedEntityTypes.includes(value.entityType)) throw invalid("Invalid notification metadata.", "NOTIFICATION_INVALID_METADATA");
    result.entityType = value.entityType;
  }
  if (value.entityId !== undefined) {
    if (typeof value.entityId !== "string" || !mongoose.Types.ObjectId.isValid(value.entityId)) throw invalid("Invalid notification metadata.", "NOTIFICATION_INVALID_METADATA");
    result.entityId = new mongoose.Types.ObjectId(value.entityId);
  }
  if (value.reference !== undefined) result.reference = boundedText(value.reference, "metadata reference", 160);
  if (value.amount !== undefined) {
    if (typeof value.amount !== "number" || !Number.isSafeInteger(value.amount) || value.amount < 0) throw invalid("Invalid notification metadata.", "NOTIFICATION_INVALID_METADATA");
    result.amount = value.amount;
  }
  if (value.currency !== undefined) {
    if (typeof value.currency !== "string" || !/^[A-Za-z]{3,8}$/.test(value.currency.trim())) throw invalid("Invalid notification metadata.", "NOTIFICATION_INVALID_METADATA");
    result.currency = value.currency.trim().toUpperCase();
  }
  return result;
}

export class NotificationService {
  constructor(private readonly repository: NotificationRepository = notificationRepository) {}

  async create(input: CreateNotificationInput): Promise<INotification> {
    return (await this.createWithOutcome(input)).notification;
  }

  /**
   * Future producers may use `created` to restrict best-effort live delivery
   * to a newly persisted record; `create()` remains backward compatible.
   */
  async createWithOutcome(input: CreateNotificationInput): Promise<CreateNotificationResult> {
    if (typeof input.recipientId !== "string" || !mongoose.Types.ObjectId.isValid(input.recipientId)) throw invalid("Invalid notification recipient.", "NOTIFICATION_INVALID_RECIPIENT");
    if (!NOTIFICATION_CATEGORIES.includes(input.category) || !NOTIFICATION_TYPES.includes(input.type) || TYPE_FOR_CATEGORY[input.category] !== input.type) throw invalid("Unsupported notification category or type.", "NOTIFICATION_UNSUPPORTED_TYPE");
    const idempotencyKey = boundedText(input.idempotencyKey, "idempotency key", NOTIFICATION_IDEMPOTENCY_KEY_MAX_LENGTH);
    const existing = await this.repository.findByRecipientAndIdempotencyKey(input.recipientId, idempotencyKey, input.session);
    if (existing) return { notification: existing, created: false };
    const createdAt = new Date();
    const candidate: Partial<INotification> = {
      recipientId: new mongoose.Types.ObjectId(input.recipientId), category: input.category, type: input.type,
      title: boundedText(input.title, "title", NOTIFICATION_TITLE_MAX_LENGTH), body: boundedText(input.body, "body", NOTIFICATION_BODY_MAX_LENGTH),
      navigationPath: navigationPath(input.navigationPath), metadata: metadata(input.metadata), idempotencyKey,
      expiresAt: new Date(createdAt.getTime() + NOTIFICATION_RETENTION_MS),
    };
    try {
      return { notification: await this.repository.create(candidate, input.session), created: true };
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      const winner = await this.repository.findByRecipientAndIdempotencyKey(input.recipientId, idempotencyKey, input.session);
      if (winner) return { notification: winner, created: false };
      throw error;
    }
  }
}

export const notificationService = new NotificationService();
