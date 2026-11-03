// backend/src/models/booking.model.ts

import mongoose, { Schema, Document } from "mongoose";
import { BookingTerminationActorType, BookingTerminationType } from "../enums/booking/bookingTerminationType.enum";
import { PaymentMethod } from "../enums/financial/paymentMethod.enum";
import {
  BookingCompletionActorType,
  BookingWalletCaptureCause,
} from "../enums/financial/bookingWalletCaptureCause.enum";

export interface IBooking extends Document {
  slotIds: mongoose.Types.ObjectId[];
  /** Earliest purchased slot start captured within the booking transaction. */
  purchasedScheduledStart?: Date;
  userId: mongoose.Types.ObjectId;
  creatorId: mongoose.Types.ObjectId;

  serviceId: mongoose.Types.ObjectId;
  /**
   * Immutable public CreatorService evidence captured when this booking was
   * created. Absent only for bookings created before DI-2A.
   */
  serviceSnapshot?: IBookingServiceSnapshot;

  /**
   * Financial Domain payment created for this booking.
   *
   * The legacy paymentStatus field remains for backward compatibility while
   * the Financial Domain Payment becomes the authoritative transaction record.
   */
  paymentId?: mongoose.Types.ObjectId;
  bookingReference?: string;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  reservationReference?: string;
  fundsReservedAt?: Date;
  bookingRequestKey?: string;
  bookingRequestFingerprint?: string;
  checkoutQuoteId?: string;
  checkoutQuoteFingerprint?: string;
  checkoutQuoteIssuedAt?: Date;
  checkoutQuoteExpiresAt?: Date;
  financialPolicyVersion?: string;
  financialPolicyContentReference?: string;
  financialPolicyAcceptedAt?: Date;

  serviceTitle: string;
  durationMinutes: number;
  price: number;
  serviceAmount: number;
  platformFeeAmount: number;
  commissionAmount: number;
  creatorAmount: number;
  totalAmount: number;
  currency: string;

  status:
    | "REQUESTED"
    | "CONFIRMED"
    | "REJECTED"
    | "CANCELLED"
    | "EXPIRED"
    | "COMPLETED";

  paymentStatus: "PENDING" | "PAID" | "REFUNDED";

  isPayable: boolean;
  isPayoutEligible: boolean;
  isFinancialLocked: boolean;

  creatorEarningSnapshot?: number;
  platformCommissionSnapshot?: number;

  expiresAt: Date;

  /** Server time recorded by the successful Creator acceptance transaction. */
  creatorAcceptedAt?: Date;

  cancellationEvidence?: ICancellationEvidence;
  terminationEvidence?: ITerminationEvidence;
  cancellationDisposition?: ICancellationDisposition;
  /** Separately admitted decision; never indicates a financial execution. */
  authoritativeDisposition?: IAuthoritativeCancellationDisposition;

  hasInteracted: boolean;
  interactionStartedAt?: Date;

  lastSeen: {
    user?: Date;
    creator?: Date;
  };

  completedAt?: Date; // ✅ NEW FIELD
  completionCause?: BookingWalletCaptureCause;
  completedByType?: BookingCompletionActorType;
  completedById?: mongoose.Types.ObjectId;
  completionOperationKey?: string;
  settlementEligibleAt?: Date;
  settlementId?: mongoose.Types.ObjectId;
  settledAt?: Date;

  terminationType?: BookingTerminationType;
  terminatedByType?: BookingTerminationActorType;
  terminatedById?: mongoose.Types.ObjectId;
  terminationReason?: string;
  terminationOperationKey?: string;
  terminationClaim?: ITerminationClaim;
  terminatedAt?: Date;
  lifecycleVersion: number;

  createdAt: Date;
  updatedAt: Date;
}

/** Private coordination only; not a booking lifecycle status. */
export interface ITerminationClaim {
  operationKey: string;
  status: "ACTIVE" | "RELEASED" | "FINALIZED";
  intent: BookingTerminationType;
  actorType: BookingTerminationActorType;
  actorId?: mongoose.Types.ObjectId;
  paymentId?: mongoose.Types.ObjectId;
  /** Provisional ingress time bound atomically to the first claim. */
  evidenceReceiptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface ICancellationEvidence {
  operationKey: string;
  actorId: mongoose.Types.ObjectId;
  actorType: "CUSTOMER" | "CREATOR";
  intent: "CUSTOMER_CANCELLED" | "CREATOR_CANCELLED";
  receiptAt: Date;
  receiptOrder: "UNVERIFIED";
  eligibility: "PARTICIPANT_STATE_ONLY";
  version: "CANCELLATION_EVIDENCE_V1" | "CANCELLATION_EVIDENCE_V2";
  outcome: "QUALIFIED" | "NOT_QUALIFIED" | "INSUFFICIENT_EVIDENCE";
  reason: "MISSING_ACCEPTANCE" | "UNVERIFIED_RECEIPT_AND_MESSAGE_ORDER" | "TWO_WAY_MESSAGES" | "NO_TWO_WAY_MESSAGES" | "UNRELIABLE_MESSAGE_TIMESTAMP";
  candidateMessageIds: mongoose.Types.ObjectId[];
  recordedAt: Date;
}

/** Separate from legacy participant-only snapshots, which are never promoted. */
export interface ITerminationEvidence {
  version: "TERMINATION_EVIDENCE_V1";
  status: "PENDING" | "FINALIZED";
  operationKey: string;
  actorType: BookingTerminationActorType;
  actorId?: mongoose.Types.ObjectId;
  intent: BookingTerminationType;
  receiptAt?: Date;
  receiptOrder: "UNVERIFIED";
  outcome: "QUALIFIED" | "NOT_QUALIFIED" | "INSUFFICIENT_EVIDENCE";
  reason: string;
  candidateMessageIds: mongoose.Types.ObjectId[];
  recordedAt: Date;
  finalizedAt?: Date;
}

/** Non-executing financial decision, not a refund or ledger authority. */
export interface ICancellationDisposition {
  version: "CANCELLATION_DISPOSITION_V1";
  status: "CALCULATED" | "PENDING";
  executionStatus: "NOT_EXECUTED";
  operationKey: string;
  actorType: BookingTerminationActorType;
  actorId?: mongoose.Types.ObjectId;
  intent: BookingTerminationType;
  scenario?: string;
  reason?: string;
  policyVersion?: string;
  calculationVersion: string;
  interactionOutcome: ITerminationEvidence["outcome"];
  receiptAt?: Date;
  scheduledStart?: Date;
  currency: string;
  currencyMinorUnits?: number;
  serviceAmount: number;
  customerPlatformFee: number;
  originalChargeTotal: number;
  breakdown?: import("../services/financial/cancellationPolicyCalculation.service").CancellationPolicyResult;
  recordedAt: Date;
}

export interface IAuthoritativeCancellationDisposition extends ICancellationDisposition {
  authorityId: string;
  guardVersion: number;
}

export interface IBookingServiceSnapshot {
  serviceId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  durationMinutes: number;
  /** CreatorService's advertised major-unit price, not booking financial pricing. */
  price: number;
  currency: string;
  media: string[];
}

const BookingServiceSnapshotSchema = new Schema<IBookingServiceSnapshot>(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: "CreatorService", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, required: true, min: 15, max: 480 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, trim: true },
    media: { type: [String], default: [] },
  },
  { _id: false, id: false },
);

const BookingSchema = new Schema<IBooking>(
  {
    slotIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Slot",
        required: true,
      },
    ],

    purchasedScheduledStart: { type: Date, immutable: true, select: false },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "CreatorService",
      required: true,
      index: true,
    },

    serviceSnapshot: {
      type: BookingServiceSnapshotSchema,
      immutable: true,
    },

    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      index: true,
    },
    bookingReference: { type: String, trim: true, immutable: true },
    paymentMethod: { type: String, enum: Object.values(PaymentMethod), immutable: true },
    paymentReference: { type: String, trim: true },
    reservationReference: { type: String, trim: true },
    fundsReservedAt: { type: Date },
    bookingRequestKey: { type: String, trim: true, immutable: true, select: false },
    bookingRequestFingerprint: { type: String, trim: true, immutable: true, select: false },
    checkoutQuoteId: { type: String, trim: true, immutable: true, index: true },
    checkoutQuoteFingerprint: { type: String, trim: true, immutable: true, select: false },
    checkoutQuoteIssuedAt: { type: Date, immutable: true },
    checkoutQuoteExpiresAt: { type: Date, immutable: true },
    financialPolicyVersion: { type: String, trim: true, immutable: true },
    financialPolicyContentReference: { type: String, trim: true, immutable: true },
    financialPolicyAcceptedAt: { type: Date, immutable: true },

    serviceTitle: {
      type: String,
      required: true,
      immutable: true,
    },

    durationMinutes: {
      type: Number,
      required: true,
      immutable: true,
    },

    price: {
      type: Number,
      required: true,
      immutable: true,
    },

    currency: {
      type: String,
      required: true,
      immutable: true,
    },

    status: {
      type: String,
      enum: [
        "REQUESTED",
        "CONFIRMED",
        "REJECTED",
        "CANCELLED",
        "EXPIRED",
        "COMPLETED",
      ],
      default: "REQUESTED",
      index: true,
    },

    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "REFUNDED"],
      default: "PAID",
      index: true,
    },

    isPayable: {
      type: Boolean,
      default: false,
      index: true,
    },

    isPayoutEligible: {
      type: Boolean,
      default: false,
      index: true,
    },

    isFinancialLocked: {
      type: Boolean,
      default: false,
      index: true,
    },

    creatorEarningSnapshot: Number,
    platformCommissionSnapshot: Number,

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    creatorAcceptedAt: Date,
    terminationClaim: {
      type: new Schema<ITerminationClaim>({
        operationKey: { type: String, required: true },
        status: { type: String, enum: ["ACTIVE", "RELEASED", "FINALIZED"], required: true },
        intent: { type: String, enum: Object.values(BookingTerminationType), required: true },
        actorType: { type: String, enum: Object.values(BookingTerminationActorType), required: true },
        actorId: Schema.Types.ObjectId,
        paymentId: Schema.Types.ObjectId,
        evidenceReceiptAt: Date,
        createdAt: { type: Date, required: true },
        updatedAt: { type: Date, required: true },
        version: { type: Number, required: true, min: 1 },
      }, { _id: false }),
      select: false,
    },
    cancellationEvidence: {
      type: new Schema<ICancellationEvidence>({
        operationKey: { type: String, required: true },
        actorId: { type: Schema.Types.ObjectId, required: true },
        actorType: { type: String, enum: ["CUSTOMER", "CREATOR"], required: true },
        intent: { type: String, enum: ["CUSTOMER_CANCELLED", "CREATOR_CANCELLED"], required: true },
        receiptAt: { type: Date, required: true },
        receiptOrder: { type: String, enum: ["UNVERIFIED"], required: true },
        eligibility: { type: String, enum: ["PARTICIPANT_STATE_ONLY"], required: true },
        version: { type: String, enum: ["CANCELLATION_EVIDENCE_V1", "CANCELLATION_EVIDENCE_V2"], required: true },
        outcome: { type: String, enum: ["QUALIFIED", "NOT_QUALIFIED", "INSUFFICIENT_EVIDENCE"], required: true },
        reason: { type: String, enum: ["MISSING_ACCEPTANCE", "UNVERIFIED_RECEIPT_AND_MESSAGE_ORDER", "TWO_WAY_MESSAGES", "NO_TWO_WAY_MESSAGES", "UNRELIABLE_MESSAGE_TIMESTAMP"], required: true },
        candidateMessageIds: [{ type: Schema.Types.ObjectId, ref: "Chat" }],
        recordedAt: { type: Date, required: true },
      }, { _id: false }),
      select: false,
    },
    terminationEvidence: {
      type: new Schema<ITerminationEvidence>({
        version: { type: String, enum: ["TERMINATION_EVIDENCE_V1"], required: true },
        status: { type: String, enum: ["PENDING", "FINALIZED"], required: true },
        operationKey: { type: String, required: true },
        actorType: { type: String, enum: Object.values(BookingTerminationActorType), required: true },
        actorId: Schema.Types.ObjectId,
        intent: { type: String, enum: Object.values(BookingTerminationType), required: true },
        receiptAt: Date,
        receiptOrder: { type: String, enum: ["UNVERIFIED"], required: true },
        outcome: { type: String, enum: ["QUALIFIED", "NOT_QUALIFIED", "INSUFFICIENT_EVIDENCE"], required: true },
        reason: { type: String, required: true },
        candidateMessageIds: [{ type: Schema.Types.ObjectId, ref: "Chat" }],
        recordedAt: { type: Date, required: true },
        finalizedAt: Date,
      }, { _id: false }),
      select: false,
    },
    cancellationDisposition: {
      type: new Schema<ICancellationDisposition>({
        version: { type: String, enum: ["CANCELLATION_DISPOSITION_V1"], required: true },
        status: { type: String, enum: ["CALCULATED", "PENDING"], required: true },
        executionStatus: { type: String, enum: ["NOT_EXECUTED"], required: true },
        operationKey: { type: String, required: true },
        actorType: { type: String, enum: Object.values(BookingTerminationActorType), required: true },
        actorId: Schema.Types.ObjectId,
        intent: { type: String, enum: Object.values(BookingTerminationType), required: true },
        scenario: String, reason: String, policyVersion: String,
        calculationVersion: { type: String, required: true },
        interactionOutcome: { type: String, enum: ["QUALIFIED", "NOT_QUALIFIED", "INSUFFICIENT_EVIDENCE"], required: true },
        receiptAt: Date, scheduledStart: Date,
        currency: { type: String, required: true }, currencyMinorUnits: Number,
        serviceAmount: { type: Number, required: true },
        customerPlatformFee: { type: Number, required: true },
        originalChargeTotal: { type: Number, required: true },
        breakdown: Schema.Types.Mixed,
        recordedAt: { type: Date, required: true },
      }, { _id: false }),
      select: false,
    },
    authoritativeDisposition: {
      type: new Schema<IAuthoritativeCancellationDisposition>({
        version: { type: String, enum: ["CANCELLATION_DISPOSITION_V1"], required: true },
        status: { type: String, enum: ["CALCULATED"], required: true },
        executionStatus: { type: String, enum: ["NOT_EXECUTED"], required: true },
        operationKey: { type: String, required: true },
        actorType: { type: String, enum: Object.values(BookingTerminationActorType), required: true },
        actorId: Schema.Types.ObjectId,
        intent: { type: String, enum: Object.values(BookingTerminationType), required: true },
        scenario: { type: String, required: true }, policyVersion: { type: String, required: true },
        calculationVersion: { type: String, required: true },
        interactionOutcome: { type: String, enum: ["QUALIFIED", "NOT_QUALIFIED", "INSUFFICIENT_EVIDENCE"], required: true },
        receiptAt: { type: Date, required: true }, scheduledStart: { type: Date, required: true },
        currency: { type: String, required: true }, currencyMinorUnits: { type: Number, required: true },
        serviceAmount: { type: Number, required: true }, customerPlatformFee: { type: Number, required: true },
        originalChargeTotal: { type: Number, required: true }, breakdown: { type: Schema.Types.Mixed, required: true },
        authorityId: { type: String, required: true }, guardVersion: { type: Number, required: true, min: 0 },
        recordedAt: { type: Date, required: true },
      }, { _id: false }),
      select: false,
    },

    hasInteracted: {
      type: Boolean,
      default: false,
      index: true,
    },

    interactionStartedAt: Date,

    lastSeen: {
      user: Date,
      creator: Date,
    },

    // ✅ ADD THIS BLOCK
    completedAt: {
      type: Date,
      index: true,
    },

    serviceAmount: {
      type: Number, required: true, immutable: true, min: 1,
      validate: { validator: Number.isSafeInteger,
        message: "Service amount must be a safe integer." },
    },
    platformFeeAmount: {
      type: Number, required: true, immutable: true, min: 0,
      validate: { validator: Number.isSafeInteger,
        message: "Platform fee amount must be a safe integer." },
    },
    commissionAmount: {
      type: Number, required: true, immutable: true, min: 0,
      validate: { validator: Number.isSafeInteger,
        message: "Commission amount must be a safe integer." },
    },
    creatorAmount: {
      type: Number, required: true, immutable: true, min: 1,
      validate: { validator: Number.isSafeInteger,
        message: "Creator amount must be a safe integer." },
    },
    totalAmount: {
      type: Number, required: true, immutable: true, min: 1,
      validate: { validator: Number.isSafeInteger,
        message: "Total amount must be a safe integer." },
    },
    completionCause: { type: String, enum: Object.values(BookingWalletCaptureCause), index: true },
    completedByType: { type: String, enum: Object.values(BookingCompletionActorType) },
    completedById: { type: Schema.Types.ObjectId, ref: "User" },
    completionOperationKey: { type: String, trim: true },
    settlementEligibleAt: { type: Date, index: true },
    settlementId: { type: Schema.Types.ObjectId, ref: "Settlement", index: true },
    settledAt: { type: Date, index: true },

    terminationType: { type: String, enum: Object.values(BookingTerminationType), index: true },
    terminatedByType: { type: String, enum: Object.values(BookingTerminationActorType) },
    terminatedById: { type: Schema.Types.ObjectId, ref: "User" },
    terminationReason: { type: String, trim: true, maxlength: 500 },
    terminationOperationKey: { type: String, trim: true },
    terminatedAt: { type: Date, index: true },
    lifecycleVersion: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

/* Indexes */

BookingSchema.index({ creatorId: 1, status: 1 });
BookingSchema.index({ userId: 1, status: 1 });
BookingSchema.index({ slotIds: 1 });
BookingSchema.index(
  { userId: 1, bookingRequestKey: 1 },
  {
    unique: true,
    partialFilterExpression: { bookingRequestKey: { $type: "string" } },
  },
);
BookingSchema.index(
  { bookingReference: 1 },
  {
    unique: true,
    partialFilterExpression: { bookingReference: { $type: "string" } },
  },
);
BookingSchema.index(
  { reservationReference: 1 },
  {
    unique: true,
    partialFilterExpression: { reservationReference: { $type: "string" } },
  },
);
BookingSchema.index(
  { terminationOperationKey: 1 },
  { unique: true, partialFilterExpression: { terminationOperationKey: { $type: "string" } } },
);
BookingSchema.index(
  { completionOperationKey: 1 },
  { unique: true, partialFilterExpression: { completionOperationKey: { $type: "string" } } },
);

export const Booking = mongoose.model<IBooking>(
  "Booking",
  BookingSchema
);
