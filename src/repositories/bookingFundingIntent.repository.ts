import { ClientSession, Types } from "mongoose";
import { BookingFundingIntent, IBookingFundingIntent } from "../models/bookingFundingIntent.model";
import User from "../models/User";
import { UserProfile } from "../models/userProfile.model";
import { CreatorService } from "../models/creatorService.model";
import { CreatorProfile } from "../models/creatorProfile.model";
import { Slot } from "../models/slot.model";
import { Booking } from "../models/booking.model";
import { Payment } from "../models/payment.model";
import { PaymentOperation } from "../models/paymentOperation.model";

export class BookingFundingIntentRepository {
  findByKey(customerId: Types.ObjectId, requestKey: string, session?: ClientSession) {
    return BookingFundingIntent.findOne({ customerId, requestKey }).select("+requestKey +fingerprint +quoteTokenHash").session(session ?? null).exec();
  }
  create(data: Partial<IBookingFundingIntent>) { return BookingFundingIntent.create(data); }
  findUser(id: Types.ObjectId) { return User.findById(id).exec(); }
  findProfile(id: Types.ObjectId) { return UserProfile.findOne({ userId: id }).exec(); }
  findService(id: Types.ObjectId) { return CreatorService.findById(id).exec(); }
  findCreator(id: Types.ObjectId) { return CreatorProfile.findOne({ userId: id }).exec(); }
  findSlots(ids: Types.ObjectId[], serviceId: Types.ObjectId) { return Slot.find({ _id: { $in: ids }, serviceId, status: "AVAILABLE" }).exec(); }
  findEvidence(bookingId: Types.ObjectId, paymentId: Types.ObjectId, operationId: Types.ObjectId, session?: ClientSession) {
    return Promise.all([
      Booking.findById(bookingId).select("+checkoutQuoteFingerprint").session(session ?? null).exec(),
      Payment.findById(paymentId).select("+checkoutQuoteFingerprint").session(session ?? null).exec(),
      PaymentOperation.findById(operationId).select("+userId +idempotencyKey").session(session ?? null).exec(),
    ]);
  }
  bind(id: Types.ObjectId, customerId: Types.ObjectId, bookingId: Types.ObjectId, paymentId: Types.ObjectId, operationId: Types.ObjectId, session: ClientSession) {
    return BookingFundingIntent.findOneAndUpdate({ _id: id, customerId, bookingId: { $exists: false }, paymentId: { $exists: false }, operationId: { $exists: false } },
      { $set: { bookingId, paymentId, operationId } }, { new: true, session, runValidators: true }).select("+requestKey +fingerprint +quoteTokenHash").exec();
  }
}
export const bookingFundingIntentRepository = new BookingFundingIntentRepository();
