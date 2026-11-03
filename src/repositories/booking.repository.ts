import { ClientSession, Types } from "mongoose";

import { Booking, IBooking, ICancellationEvidence, ITerminationClaim, ITerminationEvidence, ICancellationDisposition, IAuthoritativeCancellationDisposition } from "../models/booking.model";
import { TerminationProviderOperation } from "../models/terminationProviderOperation.model";
import { BookingTerminationActorType, BookingTerminationType } from "../enums/booking/bookingTerminationType.enum";
import {
  BookingCompletionActorType,
  BookingWalletCaptureCause,
} from "../enums/financial/bookingWalletCaptureCause.enum";

export interface BookingTerminationTransition {
  bookingId: Types.ObjectId;
  expectedStatuses: IBooking["status"][];
  targetStatus: Extract<IBooking["status"], "REJECTED" | "CANCELLED" | "EXPIRED">;
  terminationType: BookingTerminationType;
  terminationActorType: BookingTerminationActorType;
  terminationActorId?: Types.ObjectId;
  terminationReason?: string;
  terminationOperationKey: string;
  terminationClaimVersion?: number;
}

export class BookingRepository {
  /** Dormant R1A primitive. Callers must establish full financial eligibility. */
  async acquireTerminationClaim(input: {
    bookingId: Types.ObjectId; claim: ITerminationClaim; session?: ClientSession;
  }): Promise<IBooking | null> {
    const { bookingId, claim, session } = input;
    if (claim.status !== "ACTIVE" || claim.version !== 1 || claim.operationKey !== `booking-termination:${bookingId}`) return null;
    const permitted = (claim.actorType === BookingTerminationActorType.CUSTOMER && claim.intent === BookingTerminationType.CUSTOMER_CANCELLED) ||
      (claim.actorType === BookingTerminationActorType.CREATOR && [BookingTerminationType.CREATOR_CANCELLED, BookingTerminationType.CREATOR_REJECTED].includes(claim.intent)) ||
      (claim.actorType === BookingTerminationActorType.SYSTEM && claim.intent === BookingTerminationType.BOOKING_EXPIRED && !claim.actorId) ||
      (claim.actorType === BookingTerminationActorType.ADMIN && claim.intent === BookingTerminationType.ADMIN_CANCELLED && !!claim.actorId) ||
      (claim.actorType === BookingTerminationActorType.GOVERNANCE && claim.intent === BookingTerminationType.GOVERNANCE_TERMINATED && !!claim.actorId);
    if (!permitted) return null;
    const participant = claim.actorType === BookingTerminationActorType.CUSTOMER
      ? { userId: claim.actorId } : claim.actorType === BookingTerminationActorType.CREATOR
        ? { creatorId: claim.actorId } : {};
    if ([BookingTerminationActorType.CUSTOMER, BookingTerminationActorType.CREATOR].includes(claim.actorType) && !claim.actorId) return null;
    const expectedStatus = claim.intent === BookingTerminationType.CREATOR_REJECTED || claim.intent === BookingTerminationType.BOOKING_EXPIRED
      ? "REQUESTED" : { $in: ["REQUESTED", "CONFIRMED"] };
    if (claim.intent === BookingTerminationType.BOOKING_EXPIRED && claim.actorType !== BookingTerminationActorType.SYSTEM) return null;
    const eligibility = claim.intent === BookingTerminationType.BOOKING_EXPIRED ? { expiresAt: { $lte: new Date() } } : {};
    const acquired = await Booking.findOneAndUpdate({
      _id: bookingId, status: expectedStatus, ...participant, ...eligibility,
      terminationClaim: { $exists: false }, terminationOperationKey: { $exists: false },
      ...(claim.paymentId ? { paymentId: claim.paymentId } : { paymentId: { $exists: false } }),
    }, { $set: { terminationClaim: claim } }, { new: true, runValidators: true, session, ...(session ? {} : { writeConcern: { w: "majority" as const } }) }).select("+terminationClaim").exec();
    if (acquired) return acquired;
    return Booking.findOne({ _id: bookingId, status: expectedStatus, ...participant, "terminationClaim.status": "ACTIVE",
      "terminationClaim.operationKey": claim.operationKey, "terminationClaim.intent": claim.intent,
      "terminationClaim.actorType": claim.actorType,
      "terminationClaim.actorId": claim.actorId ?? { $exists: false },
      "terminationClaim.paymentId": claim.paymentId ?? { $exists: false },
    }).select("+terminationClaim").session(session ?? null).exec();
  }

  async findTerminationClaim(id: Types.ObjectId, session?: ClientSession): Promise<IBooking | null> {
    return Booking.findById(id).select("+terminationClaim").session(session ?? null).exec();
  }

  /** Release is forbidden while a provider outcome is unresolved or successful. */
  async transitionTerminationClaim(input: { bookingId: Types.ObjectId; operationKey: string; intent: BookingTerminationType; actorType: BookingTerminationActorType; actorId?: Types.ObjectId; version: number; target: "RELEASED" | "FINALIZED"; session: ClientSession }): Promise<IBooking | null> {
    if (input.target === "RELEASED") {
      if (!input.session.inTransaction()) throw new Error("Claim release requires an active transaction.");
      const booking = await this.findTerminationClaim(input.bookingId, input.session);
      if (!booking?.terminationClaim) return null;
      const operation = await TerminationProviderOperation.findOne({ claimKey: input.operationKey }).session(input.session);
      // FAILED currently has no provider-verified non-mutation provenance. It is
      // therefore not sufficient authority to release a financial claim.
      if (operation || booking.terminationClaim.paymentId) {
        // A provider operation could still be created after an absent-record read.
        return null;
      }
    }
    const terminal = input.target === "FINALIZED" ? { status: { $in: ["CANCELLED", "REJECTED", "EXPIRED"] }, terminationOperationKey: input.operationKey, terminationType: input.intent, terminatedByType: input.actorType, terminatedById: input.actorId ?? { $exists: false } } : { status: { $in: ["REQUESTED", "CONFIRMED"] }, terminationOperationKey: { $exists: false } };
    return Booking.findOneAndUpdate({ _id: input.bookingId, ...terminal,
      "terminationClaim.status": "ACTIVE", "terminationClaim.operationKey": input.operationKey,
      "terminationClaim.intent": input.intent, "terminationClaim.actorType": input.actorType,
      "terminationClaim.actorId": input.actorId ?? { $exists: false }, "terminationClaim.version": input.version,
    }, { $set: { "terminationClaim.status": input.target, "terminationClaim.updatedAt": new Date() }, $inc: { "terminationClaim.version": 1 } },
    { new: true, runValidators: true, session: input.session }).select("+terminationClaim").exec();
  }
  async findForCancellationEvidence(id: Types.ObjectId, session?: ClientSession): Promise<IBooking | null> {
    return Booking.findById(id).select("+cancellationEvidence").session(session ?? null).exec();
  }

  async findTerminationEvidence(id: Types.ObjectId, session?: ClientSession): Promise<IBooking | null> {
    return Booking.findById(id).select("+terminationEvidence").session(session ?? null).exec();
  }

  async findCancellationDisposition(id: Types.ObjectId, session?: ClientSession): Promise<IBooking | null> {
    return Booking.findById(id).select("+cancellationDisposition").session(session ?? null).exec();
  }

  async findForDispositionAdmission(id: Types.ObjectId, session?: ClientSession): Promise<IBooking | null> {
    return Booking.findById(id).select("+terminationClaim +terminationEvidence +cancellationDisposition +authoritativeDisposition +purchasedScheduledStart +checkoutQuoteFingerprint").session(session ?? null).exec();
  }

  async admitAuthoritativeDisposition(booking: IBooking, authority: IAuthoritativeCancellationDisposition, session?: ClientSession): Promise<IBooking | null> {
    const evidence = booking.terminationEvidence!;
    const claim = booking.terminationClaim!;
    return Booking.findOneAndUpdate({ _id: booking._id, authoritativeDisposition: { $exists: false },
      status: booking.status, userId: booking.userId, creatorId: booking.creatorId, paymentId: booking.paymentId ?? { $exists: false },
      serviceAmount: booking.serviceAmount, platformFeeAmount: booking.platformFeeAmount, totalAmount: booking.totalAmount, currency: booking.currency,
      purchasedScheduledStart: booking.purchasedScheduledStart, financialPolicyVersion: booking.financialPolicyVersion, serviceId: booking.serviceId, slotIds: booking.slotIds,
      checkoutQuoteId: booking.checkoutQuoteId, checkoutQuoteFingerprint: booking.checkoutQuoteFingerprint, checkoutQuoteIssuedAt: booking.checkoutQuoteIssuedAt, checkoutQuoteExpiresAt: booking.checkoutQuoteExpiresAt, financialPolicyContentReference: booking.financialPolicyContentReference ?? { $exists: false }, creatorAcceptedAt: booking.creatorAcceptedAt ?? { $exists: false },
      "terminationClaim.status": "ACTIVE", "terminationClaim.version": claim.version, "terminationClaim.operationKey": authority.operationKey,
      "terminationClaim.actorType": authority.actorType, "terminationClaim.actorId": authority.actorId ?? { $exists: false }, "terminationClaim.intent": authority.intent,
      "terminationClaim.paymentId": claim.paymentId ?? { $exists: false },
      "terminationClaim.evidenceReceiptAt": authority.receiptAt,
      "terminationEvidence.status": "PENDING", "terminationEvidence.version": evidence.version, "terminationEvidence.operationKey": authority.operationKey,
      "terminationEvidence.actorType": authority.actorType, "terminationEvidence.actorId": authority.actorId ?? { $exists: false }, "terminationEvidence.intent": authority.intent,
      "terminationEvidence.receiptAt": authority.receiptAt, "terminationEvidence.outcome": authority.interactionOutcome, "terminationEvidence.recordedAt": evidence.recordedAt, "terminationEvidence.reason": evidence.reason, "terminationEvidence.candidateMessageIds": evidence.candidateMessageIds,
    }, { $set: { authoritativeDisposition: authority } }, { new: true, session, runValidators: true, ...(session ? {} : { writeConcern: { w: "majority" as const } }) }).select("+authoritativeDisposition").exec();
  }

  async admitCancellationDisposition(id: Types.ObjectId, disposition: ICancellationDisposition, session?: ClientSession): Promise<IBooking | null> {
    const identity = { "terminationEvidence.operationKey": disposition.operationKey,
      "terminationEvidence.actorType": disposition.actorType, "terminationEvidence.intent": disposition.intent,
      "terminationEvidence.actorId": disposition.actorId ?? { $exists: false } };
    const boundary = session
      ? { terminationOperationKey: disposition.operationKey, terminatedByType: disposition.actorType,
          terminatedById: disposition.actorId ?? { $exists: false }, terminationType: disposition.intent, "terminationEvidence.status": "FINALIZED" }
      : { "terminationClaim.status": "ACTIVE", "terminationClaim.operationKey": disposition.operationKey,
          "terminationClaim.actorType": disposition.actorType, "terminationClaim.intent": disposition.intent,
          "terminationClaim.actorId": disposition.actorId ?? { $exists: false }, "terminationEvidence.status": "PENDING" };
    return Booking.findOneAndUpdate({ _id: id, cancellationDisposition: { $exists: false }, ...identity, ...boundary },
      { $set: { cancellationDisposition: disposition } }, { new: true, runValidators: true, session,
        ...(session ? {} : { writeConcern: { w: "majority" as const } }) }).select("+cancellationDisposition").exec();
  }

  async admitTerminationEvidence(id: Types.ObjectId, evidence: ITerminationEvidence, session?: ClientSession): Promise<IBooking | null> {
    return Booking.findOneAndUpdate({ _id: id, terminationEvidence: { $exists: false },
      "terminationClaim.status": "ACTIVE", "terminationClaim.operationKey": evidence.operationKey,
      "terminationClaim.actorType": evidence.actorType, "terminationClaim.intent": evidence.intent,
      "terminationClaim.actorId": evidence.actorId ?? { $exists: false },
    }, { $set: { terminationEvidence: evidence } }, { new: true, runValidators: true, session,
      ...(session ? {} : { writeConcern: { w: "majority" as const } }) }).select("+terminationEvidence").exec();
  }

  async finalizeTerminationEvidence(id: Types.ObjectId, evidence: ITerminationEvidence, session: ClientSession): Promise<IBooking | null> {
    if (!session.inTransaction()) throw new Error("Evidence finalization requires a transaction.");
    const identity = { _id: id, terminationOperationKey: evidence.operationKey, terminationType: evidence.intent,
      terminatedByType: evidence.actorType, terminatedById: evidence.actorId ?? { $exists: false },
      status: { $in: ["CANCELLED", "REJECTED", "EXPIRED"] } };
    return Booking.findOneAndUpdate({ ...identity, "terminationEvidence.status": "PENDING",
      "terminationEvidence.operationKey": evidence.operationKey, "terminationEvidence.actorType": evidence.actorType,
      "terminationEvidence.actorId": evidence.actorId ?? { $exists: false }, "terminationEvidence.intent": evidence.intent,
    }, { $set: { "terminationEvidence.status": "FINALIZED", "terminationEvidence.finalizedAt": new Date() } },
    { new: true, session, runValidators: true }).select("+terminationEvidence").exec();
  }

  async writeFinalTerminationEvidence(id: Types.ObjectId, evidence: ITerminationEvidence, session: ClientSession): Promise<IBooking | null> {
    if (!session.inTransaction()) throw new Error("Evidence finalization requires a transaction.");
    return Booking.findOneAndUpdate({ _id: id, terminationEvidence: { $exists: false },
      terminationOperationKey: evidence.operationKey, terminationType: evidence.intent,
      terminatedByType: evidence.actorType, terminatedById: evidence.actorId ?? { $exists: false },
      status: { $in: ["CANCELLED", "REJECTED", "EXPIRED"] },
    }, { $set: { terminationEvidence: { ...evidence, status: "FINALIZED", finalizedAt: new Date() } } },
    { new: true, session, runValidators: true }).select("+terminationEvidence").exec();
  }

  async admitCancellationEvidence(id: Types.ObjectId, evidence: ICancellationEvidence, session: ClientSession): Promise<IBooking | null> {
    return Booking.findOneAndUpdate(
      { _id: id, status: { $in: ["REQUESTED", "CONFIRMED"] }, cancellationEvidence: { $exists: false } },
      { $set: { cancellationEvidence: evidence } },
      { new: true, session, runValidators: true },
    ).select("+cancellationEvidence").exec();
  }
  async findById(id: Types.ObjectId, session?: ClientSession): Promise<IBooking | null> {
    return Booking.findById(id).session(session ?? null).exec();
  }

  async findByBookingReference(
    bookingReference: string,
    session?: ClientSession,
  ): Promise<IBooking | null> {
    return Booking.findOne({ bookingReference }).session(session ?? null).exec();
  }

  async transitionToTerminated(
    input: BookingTerminationTransition,
    session: ClientSession,
  ): Promise<IBooking | null> {
    return Booking.findOneAndUpdate(
      {
        _id: input.bookingId,
        status: { $in: input.expectedStatuses },
        ...(input.terminationClaimVersion === undefined
          ? { "terminationClaim.status": { $ne: "ACTIVE" } }
          : { "terminationClaim.status": "ACTIVE", "terminationClaim.operationKey": input.terminationOperationKey,
              "terminationClaim.intent": input.terminationType, "terminationClaim.actorType": input.terminationActorType,
              "terminationClaim.actorId": input.terminationActorId ?? { $exists: false }, "terminationClaim.version": input.terminationClaimVersion }),
        $or: [
          { terminationOperationKey: { $exists: false } },
          { terminationOperationKey: input.terminationOperationKey },
        ],
      },
      {
        $set: {
          status: input.targetStatus,
          terminationType: input.terminationType,
          terminatedByType: input.terminationActorType,
          ...(input.terminationActorId ? { terminatedById: input.terminationActorId } : {}),
          ...(input.terminationReason ? { terminationReason: input.terminationReason } : {}),
          terminationOperationKey: input.terminationOperationKey,
          terminatedAt: new Date(),
        },
        $inc: { lifecycleVersion: 1 },
      },
      { new: true, runValidators: true, session },
    ).exec();
  }

  async guardConfirmedToCompleted(
    input: {
      bookingId: Types.ObjectId;
      cause: BookingWalletCaptureCause;
      actorType: BookingCompletionActorType;
      actorId?: Types.ObjectId;
      operationKey: string;
      completedAt: Date;
      settlementEligibleAt: Date;
    },
    session: ClientSession,
  ): Promise<IBooking | null> {
    return Booking.findOneAndUpdate(
      {
        _id: input.bookingId,
        status: "CONFIRMED",
        "terminationClaim.status": { $ne: "ACTIVE" },
        isFinancialLocked: { $ne: true },
        completionOperationKey: { $exists: false },
      },
      {
        $set: {
          status: "COMPLETED",
          paymentStatus: "PAID",
          isPayable: false,
          isPayoutEligible: false,
          isFinancialLocked: false,
          completedAt: input.completedAt,
          settlementEligibleAt: input.settlementEligibleAt,
          completionCause: input.cause,
          completedByType: input.actorType,
          ...(input.actorId ? { completedById: input.actorId } : {}),
          completionOperationKey: input.operationKey,
        },
        $inc: { lifecycleVersion: 1 },
      },
      { new: true, runValidators: true, session },
    ).exec();
  }

  async findCompletedReplay(
    bookingId: Types.ObjectId,
    operationKey: string,
    session?: ClientSession,
  ): Promise<IBooking | null> {
    return Booking.findOne({
      _id: bookingId,
      status: "COMPLETED",
      completionOperationKey: operationKey,
    }).session(session ?? null).exec();
  }
}

export const bookingRepository = new BookingRepository();
