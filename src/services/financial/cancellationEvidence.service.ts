import mongoose, { ClientSession, Types } from "mongoose";
import type { Request } from "express";
import User from "../../models/User";
import { IBooking, ICancellationEvidence } from "../../models/booking.model";
import { bookingRepository } from "../../repositories/booking.repository";
import { findInteractionMessageEvidence } from "../../repositories/chatEvidence.repository";
import { getProvisionalCancellationReceipt } from "../../middlewares/cancellationReceipt.middleware";

export type FinancialInteractionOutcome = "QUALIFIED" | "NOT_QUALIFIED" | "INSUFFICIENT_EVIDENCE";

export interface FinancialInteractionResult {
  outcome: FinancialInteractionOutcome;
  reason: "MISSING_BOOKING" | "INVALID_RECEIPT" | "INVALID_PARTICIPANTS" | "MISSING_ACCEPTANCE" | "TWO_WAY_MESSAGES" | "NO_TWO_WAY_MESSAGES" | "UNRELIABLE_MESSAGE_TIMESTAMP" | "EVIDENCE_UNAVAILABLE";
  messageIds: Types.ObjectId[];
}

/** Read-only evaluation; receiptAt must come from a valid server-side cancellation boundary. */
export async function evaluateCancellationInteraction(bookingId: Types.ObjectId, receiptAt: Date, session?: ClientSession): Promise<FinancialInteractionResult> {
  if (!(receiptAt instanceof Date) || !Number.isFinite(receiptAt.getTime())) return { outcome: "INSUFFICIENT_EVIDENCE", reason: "INVALID_RECEIPT", messageIds: [] };
  try {
    const booking = await bookingRepository.findById(bookingId, session);
    if (!booking) return { outcome: "INSUFFICIENT_EVIDENCE", reason: "MISSING_BOOKING", messageIds: [] };
    return await evaluateBookingInteraction(booking, receiptAt, session);
  } catch {
    return { outcome: "INSUFFICIENT_EVIDENCE", reason: "EVIDENCE_UNAVAILABLE", messageIds: [] };
  }
}

async function evaluateBookingInteraction(booking: IBooking, receiptAt: Date, session?: ClientSession): Promise<FinancialInteractionResult> {
  if (!booking.userId || !booking.creatorId || booking.userId.equals(booking.creatorId)) return { outcome: "INSUFFICIENT_EVIDENCE", reason: "INVALID_PARTICIPANTS", messageIds: [] };
  if (!(booking.creatorAcceptedAt instanceof Date) || !Number.isFinite(booking.creatorAcceptedAt.getTime())) return { outcome: "INSUFFICIENT_EVIDENCE", reason: "MISSING_ACCEPTANCE", messageIds: [] };
  const found = await findInteractionMessageEvidence({ bookingId: booking._id as Types.ObjectId, userId: booking.userId, creatorId: booking.creatorId, acceptedAt: booking.creatorAcceptedAt, receiptAt }, session);
  const messageIds = [found.userMessageId, found.creatorMessageId].filter((id): id is Types.ObjectId => !!id);
  if (messageIds.length === 2) return { outcome: "QUALIFIED", reason: "TWO_WAY_MESSAGES", messageIds };
  if (found.unreliableTimestamp) return { outcome: "INSUFFICIENT_EVIDENCE", reason: "UNRELIABLE_MESSAGE_TIMESTAMP", messageIds };
  return { outcome: "NOT_QUALIFIED", reason: "NO_TWO_WAY_MESSAGES", messageIds };
}

/**
 * Non-enforcing evidence admission for a request already authenticated by protect.
 * Not wired to live cancellation: full termination eligibility and globally first
 * HTTP arrival are not established by this foundation.
 */
export async function admitCancellationEvidence(req: Request, actorType: "CUSTOMER" | "CREATOR"): Promise<ICancellationEvidence> {
  const actorId = req.user?.id;
  const rawBookingId = req.params?.bookingId ?? req.body?.bookingId;
  const receiptAt = getProvisionalCancellationReceipt(req);
  if (!actorId || !Types.ObjectId.isValid(actorId) || !Types.ObjectId.isValid(rawBookingId) || !receiptAt || !Number.isFinite(receiptAt.getTime())) throw new Error("Authenticated request, booking and server receipt are required.");
  if (actorType !== "CUSTOMER" && actorType !== "CREATOR") throw new Error("Invalid cancellation actor.");
  const bookingId = new Types.ObjectId(rawBookingId);
  const participantId = new Types.ObjectId(actorId);
  const intent = actorType === "CUSTOMER" ? "CUSTOMER_CANCELLED" : "CREATOR_CANCELLED";
  const operationKey = `booking-termination:${bookingId}`;
  const checkReplay = (evidence: ICancellationEvidence): ICancellationEvidence => {
    if (!evidence.actorId.equals(participantId) || evidence.actorType !== actorType || evidence.intent !== intent || evidence.operationKey !== operationKey) throw new Error("Cancellation evidence conflicts with existing operation.");
    return evidence;
  };
  const session = await mongoose.startSession();
  try {
    let result: ICancellationEvidence | undefined;
    await session.withTransaction(async () => {
      const account = await User.findById(participantId).session(session);
      if (!account || account.status === "suspended" || account.status === "banned") throw new Error("Cancellation actor is not authorized.");
      const booking = await bookingRepository.findForCancellationEvidence(bookingId, session);
      if (!booking || !(actorType === "CUSTOMER" ? booking.userId : booking.creatorId).equals(participantId)) throw new Error("Cancellation actor is not authorized.");
      if (booking.terminationOperationKey && (booking.terminationOperationKey !== operationKey || booking.terminationType !== intent || !booking.terminatedById?.equals(participantId))) throw new Error("Cancellation evidence conflicts with existing termination.");
      if (booking.cancellationEvidence) { result = checkReplay(booking.cancellationEvidence); return; }
      if (!["REQUESTED", "CONFIRMED"].includes(booking.status)) throw new Error("Booking is not eligible for cancellation evidence.");
      const interaction = await evaluateBookingInteraction(booking, receiptAt, session);
      if (interaction.reason === "INVALID_PARTICIPANTS" || interaction.reason === "INVALID_RECEIPT" || interaction.reason === "MISSING_BOOKING" || interaction.reason === "EVIDENCE_UNAVAILABLE") throw new Error("Cancellation evidence is invalid.");
      const evidence: ICancellationEvidence = {
        operationKey, actorId: participantId, actorType, intent, receiptAt, receiptOrder: "UNVERIFIED", eligibility: "PARTICIPANT_STATE_ONLY",
        version: "CANCELLATION_EVIDENCE_V2", outcome: interaction.outcome, reason: interaction.reason,
        candidateMessageIds: interaction.messageIds, recordedAt: new Date(),
      };
      const updated = await bookingRepository.admitCancellationEvidence(bookingId, evidence, session);
      if (!updated?.cancellationEvidence) throw new Error("Cancellation evidence admission conflicted.");
      result = updated.cancellationEvidence;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, timeoutMS: 15_000 });
    if (!result) throw new Error("Cancellation evidence transaction returned no result.");
    return result;
  } catch (error) {
    // Resolve an uncertain commit only from the durable record for this identity.
    if (error && typeof error === "object" && "hasErrorLabel" in error && typeof error.hasErrorLabel === "function" && error.hasErrorLabel("UnknownTransactionCommitResult")) {
      const account = await User.findById(participantId);
      const winner = await bookingRepository.findForCancellationEvidence(bookingId);
      if (account && account.status !== "suspended" && account.status !== "banned" && winner && (actorType === "CUSTOMER" ? winner.userId : winner.creatorId).equals(participantId) && winner.cancellationEvidence && (!winner.terminationOperationKey || (winner.terminationOperationKey === operationKey && winner.terminationType === intent && winner.terminatedById?.equals(participantId)))) return checkReplay(winner.cancellationEvidence);
    }
    throw error;
  } finally { await session.endSession(); }
}
