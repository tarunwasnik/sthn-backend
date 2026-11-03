import { INotification } from "../../models/notification.model";

export interface NotificationResponseDto {
  id: string;
  category: INotification["category"];
  type: INotification["type"];
  title: string;
  body: string;
  navigationPath?: string;
  metadata?: {
    entityType?: string;
    entityId?: string;
    reference?: string;
    amount?: number;
    currency?: string;
  };
  readAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
}

/** The sole public representation for REST responses and Socket.IO events. */
export const serializeNotification = (notification: INotification): NotificationResponseDto => ({
  id: String(notification._id),
  category: notification.category,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  ...(notification.navigationPath ? { navigationPath: notification.navigationPath } : {}),
  ...(notification.metadata ? {
    metadata: {
      ...(notification.metadata.entityType ? { entityType: notification.metadata.entityType } : {}),
      ...(notification.metadata.entityId ? { entityId: String(notification.metadata.entityId) } : {}),
      ...(notification.metadata.reference ? { reference: notification.metadata.reference } : {}),
      ...(notification.metadata.amount !== undefined ? { amount: notification.metadata.amount } : {}),
      ...(notification.metadata.currency ? { currency: notification.metadata.currency } : {}),
    },
  } : {}),
  readAt: notification.readAt ?? null,
  createdAt: notification.createdAt,
  expiresAt: notification.expiresAt,
});
