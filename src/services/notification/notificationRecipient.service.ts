import { INotification } from "../../models/notification.model";
import {
  NotificationHistoryCursor,
  NotificationHistoryResult,
  NotificationRepository,
  notificationRepository,
} from "../../repositories/notification.repository";

export class NotificationRecipientService {
  constructor(private readonly repository: NotificationRepository = notificationRepository) {}

  getHistory(recipientId: string, options: { limit: number; before?: NotificationHistoryCursor }): Promise<NotificationHistoryResult> {
    return this.repository.findHistory(recipientId, options);
  }

  getUnreadCount(recipientId: string): Promise<number> {
    return this.repository.countUnread(recipientId);
  }

  markOneRead(recipientId: string, notificationId: string): Promise<INotification | null> {
    return this.repository.markOneRead(recipientId, notificationId);
  }

  async markAllRead(recipientId: string): Promise<{ modifiedCount: number; unreadCount: number }> {
    const result = await this.repository.markAllRead(recipientId);
    return { modifiedCount: result.modifiedCount, unreadCount: await this.repository.countUnread(recipientId) };
  }
}

export const notificationRecipientService = new NotificationRecipientService();
