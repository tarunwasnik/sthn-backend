import { ClientSession, Types } from "mongoose";
import { Chat } from "../models/chat.model";

export async function findInteractionMessageEvidence(input: {
  bookingId: Types.ObjectId; userId: Types.ObjectId; creatorId: Types.ObjectId;
  acceptedAt: Date; receiptAt: Date;
}, session?: ClientSession): Promise<{ userMessageId?: Types.ObjectId; creatorMessageId?: Types.ObjectId; unreliableTimestamp: boolean }> {
  const participants = [
    { senderId: input.userId, senderRole: "USER" },
    { senderId: input.creatorId, senderRole: "CREATOR" },
  ];
  const common = { bookingId: input.bookingId, type: { $in: ["text", "location", "document", "image", "voice", "video"] } };
  const findParticipant = (participant: typeof participants[number]) => Chat.findOne({
    ...common, ...participant, createdAt: { $gt: input.acceptedAt, $lte: input.receiptAt },
  }).select("_id").session(session ?? null).lean().exec();
  // Sequential reads also work when called from an existing MongoDB transaction.
  const userMessage = await findParticipant(participants[0]);
  const creatorMessage = await findParticipant(participants[1]);
  const unreliable = userMessage && creatorMessage ? null : await Chat.findOne({
    ...common, $or: participants, createdAt: { $not: { $type: "date" } },
  }).select("_id").session(session ?? null).lean().exec();
  return {
    ...(userMessage ? { userMessageId: userMessage._id as Types.ObjectId } : {}),
    ...(creatorMessage ? { creatorMessageId: creatorMessage._id as Types.ObjectId } : {}),
    unreliableTimestamp: !!unreliable,
  };
}
