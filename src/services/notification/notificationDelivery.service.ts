import mongoose from "mongoose";

import { serializeNotification } from "../../dtos/notification/notification.response.dto";
import { INotification } from "../../models/notification.model";
import { getSocketServer, personalRoom } from "../../sockets/chat.socket";

type SocketServer = {
  to(room: string): { emit(event: string, payload: unknown): unknown };
  sockets?: { adapter?: { rooms?: Map<string, Set<string>> } };
};

export type NotificationDeliveryStatus =
  | "DELIVERED"
  | "RECIPIENT_OFFLINE"
  | "SOCKET_UNAVAILABLE"
  | "UNCOMMITTED_TRANSACTION"
  | "INELIGIBLE_NOTIFICATION"
  | "EMIT_FAILED";

export interface NotificationDeliveryAttempt {
  status: NotificationDeliveryStatus;
  delivered: boolean;
}

export interface NotificationDeliveryOptions {
  /** Must be explicitly true, and only supplied after the caller-owned transaction commits. */
  postCommit: boolean;
  /** A supplied session denotes an uncommitted transaction boundary and is never emitted from. */
  session?: unknown;
}

const unavailable = (status: Exclude<NotificationDeliveryStatus, "DELIVERED">): NotificationDeliveryAttempt => ({ status, delivered: false });

const validPersistedNotification = (notification: INotification): boolean =>
  Boolean(notification) &&
  mongoose.Types.ObjectId.isValid(notification._id) &&
  mongoose.Types.ObjectId.isValid(notification.recipientId) &&
  notification.expiresAt instanceof Date &&
  notification.expiresAt.getTime() > Date.now();

export class NotificationDeliveryService {
  constructor(private readonly socketServer: () => SocketServer | null = getSocketServer) {}

  deliverPersisted(notification: INotification, options: NotificationDeliveryOptions): NotificationDeliveryAttempt {
    if (!options.postCommit || options.session) return unavailable("UNCOMMITTED_TRANSACTION");
    if (!validPersistedNotification(notification)) return unavailable("INELIGIBLE_NOTIFICATION");
    const io = this.socketServer();
    if (!io) return unavailable("SOCKET_UNAVAILABLE");

    const room = personalRoom(String(notification.recipientId));
    if (!io.sockets?.adapter?.rooms?.get(room)?.size) return unavailable("RECIPIENT_OFFLINE");
    try {
      io.to(room).emit("notification:created", serializeNotification(notification));
      return { status: "DELIVERED", delivered: true };
    } catch (error) {
      console.warn("[notificationDelivery] Socket emission failed", error instanceof Error ? error.message : "unknown error");
      return unavailable("EMIT_FAILED");
    }
  }
}

export const notificationDeliveryService = new NotificationDeliveryService();
