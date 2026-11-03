import { ClientSession } from "mongoose";
import { IBooking } from "../../models/booking.model";
import { notificationService } from "./notification.service";
import { notificationDeliveryService } from "./notificationDelivery.service";
import { INotification } from "../../models/notification.model";

export type BookingNotificationEvent = "REQUESTED" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "EXPIRED" | "COMPLETED";
type Created = { notification: INotification; created: boolean };

const copy = (event: BookingNotificationEvent) => ({
  REQUESTED: ["New booking request", "You have a new booking request to review."],
  CONFIRMED: ["Booking confirmed", "Your booking request has been confirmed."],
  REJECTED: ["Booking request declined", "Your booking request was declined."],
  CANCELLED: ["Booking cancelled", "A booking was cancelled."],
  EXPIRED: ["Booking request expired", "A booking request expired before it was accepted."],
  COMPLETED: ["Booking completed", "A booking has been marked as completed."],
}[event]);

export async function createBookingNotifications(booking: IBooking, event: BookingNotificationEvent, recipients: Array<{ id: string; actor: "user" | "creator" }>, session: ClientSession): Promise<Created[]> {
  const [title, body] = copy(event);
  return Promise.all(recipients.map(({ id, actor }) => notificationService.createWithOutcome({
    recipientId: id, category: "BOOKING", type: "BOOKING_UPDATE", title, body,
    navigationPath: actor === "creator" ? `/dashboard/creator/bookings/${booking._id}` : `/dashboard/user/bookings/${booking._id}`,
    metadata: { entityType: "BOOKING", entityId: String(booking._id), ...(booking.bookingReference ? { reference: booking.bookingReference } : {}) },
    idempotencyKey: `booking:${booking._id}:${event}:${id}`, session,
  })));
}

export function deliverCreatedBookingNotifications(created: Created[]): void {
  for (const entry of created) if (entry.created) notificationDeliveryService.deliverPersisted(entry.notification, { postCommit: true });
}
