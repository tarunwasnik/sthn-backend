import mongoose, { Document, Schema, Types } from "mongoose";
import { PaymentMethod } from "../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../enums/financial/paymentProvider.enum";

/** Admission only: this record neither creates a booking nor reserves slots or funds. */
export interface IBookingFundingIntent extends Document {
  customerId: Types.ObjectId;
  requestKey: string;
  fingerprint: string;
  creatorId: Types.ObjectId;
  serviceId: Types.ObjectId;
  slotIds: Types.ObjectId[];
  quoteId: string;
  quoteFingerprint: string;
  quoteTokenHash: string;
  quoteExpiresAt: Date;
  serviceAmount: number;
  customerFeeAmount: number;
  totalAmount: number;
  currency: string;
  method: PaymentMethod;
  provider: PaymentProvider;
  bookingId?: Types.ObjectId;
  paymentId?: Types.ObjectId;
  operationId?: Types.ObjectId;
}

const schema = new Schema<IBookingFundingIntent>({
  customerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  requestKey: { type: String, required: true, immutable: true, select: false },
  fingerprint: { type: String, required: true, immutable: true, select: false },
  creatorId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  serviceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  slotIds: [{ type: Schema.Types.ObjectId, required: true, immutable: true }],
  quoteId: { type: String, required: true, immutable: true },
  quoteFingerprint: { type: String, required: true, immutable: true },
  quoteTokenHash: { type: String, required: true, immutable: true, select: false },
  quoteExpiresAt: { type: Date, required: true, immutable: true },
  serviceAmount: { type: Number, required: true, immutable: true },
  customerFeeAmount: { type: Number, required: true, immutable: true },
  totalAmount: { type: Number, required: true, immutable: true },
  currency: { type: String, required: true, immutable: true },
  method: { type: String, enum: Object.values(PaymentMethod), required: true, immutable: true },
  provider: { type: String, enum: Object.values(PaymentProvider), required: true, immutable: true },
  bookingId: Schema.Types.ObjectId,
  paymentId: Schema.Types.ObjectId,
  operationId: Schema.Types.ObjectId,
}, { timestamps: true, versionKey: false });
schema.index({ customerId: 1, requestKey: 1 }, { unique: true });
for (const field of ["bookingId", "paymentId", "operationId"] as const) {
  schema.index({ [field]: 1 }, { unique: true, partialFilterExpression: { [field]: { $type: "objectId" } } });
}
export const BookingFundingIntent = mongoose.model<IBookingFundingIntent>("BookingFundingIntent", schema);
