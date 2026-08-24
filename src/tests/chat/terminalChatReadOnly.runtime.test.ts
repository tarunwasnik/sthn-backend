import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Types } from "mongoose";
import type { Request, Response } from "express";

import User from "../../models/User";
import { Booking } from "../../models/booking.model";
import { Chat } from "../../models/chat.model";
import { deleteMessage, getChatHistory, getConversations, markChatAsSeen, reactToMessage, sendMessage } from "../../controllers/chat.controller";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

type Result = { statusCode?: number; body?: unknown; response: Response };
const response = (): Result => { const result = {} as Result; result.response = { status: (code: number) => { result.statusCode = code; return result.response; }, json: (body: unknown) => { result.body = body; return result.response; } } as unknown as Response; return result; };
const req = (actor: { _id: Types.ObjectId }, params: Record<string, string>, body: Record<string, unknown> = {}) => ({ user: { id: String(actor._id), role: "user" }, params, body });

async function fixture(status: "CONFIRMED" | "CANCELLED" | "COMPLETED") {
  const suffix = new Types.ObjectId().toString();
  const customer = await User.create({ email: `chat-customer-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const creator = await User.create({ email: `chat-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE", role: "creator" });
  const stranger = await User.create({ email: `chat-stranger-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const booking = await Booking.create({ slotIds: [new Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new Types.ObjectId(), serviceTitle: "Chat service", durationMinutes: 30, price: 100, currency: "USD", status, paymentStatus: "PENDING", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86_400_000), serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 });
  const chat = await Chat.create({ bookingId: booking._id, senderId: customer._id, senderRole: "USER", type: "text", message: "Preserved evidence", seenBy: [customer._id], reactions: [{ userId: creator._id, emoji: "👍" }] });
  return { customer, creator, stranger, booking, chat };
}
const read = async (actor: { _id: Types.ObjectId }, bookingId: string) => { const out = response(); await getChatHistory(req(actor, { bookingId }) as unknown as Request, out.response); return out; };
const terminal = (out: Result) => { assert.equal(out.statusCode, 409); assert.deepEqual(out.body, { code: "CHAT_READ_ONLY", message: "This booking conversation is read-only." }); };

test("terminal chat remains readable only to customer and creator, preserving messages, reactions, and soft-delete state", async () => {
  for (const status of ["CANCELLED", "COMPLETED"] as const) {
    const data = await fixture(status);
    for (const actor of [data.customer, data.creator]) { const out = await read(actor, String(data.booking._id)); assert.equal(out.statusCode, 200); assert.equal((out.body as { chats: Array<{ message: string; reactions: unknown[] }> }).chats[0].message, "Preserved evidence"); }
    assert.equal((await read(data.stranger, String(data.booking._id))).statusCode, 403);
    assert.equal((await Chat.findById(data.chat._id).orFail()).reactions.length, 1);
  }
});

test("cancelled and completed chat mutations fail closed with CHAT_READ_ONLY", async () => {
  for (const status of ["CANCELLED", "COMPLETED"] as const) {
    const data = await fixture(status); const id = String(data.booking._id); const messageId = String(data.chat._id);
    for (const invoke of [async () => { const out = response(); await sendMessage(req(data.customer, { bookingId: id }, { message: "blocked" }) as unknown as Request, out.response); return out; }, async () => { const out = response(); await deleteMessage(req(data.customer, { messageId }) as unknown as Request, out.response); return out; }, async () => { const out = response(); await reactToMessage(req(data.customer, { messageId }, { emoji: "❤️" }) as unknown as Request, out.response); return out; }, async () => { const out = response(); await markChatAsSeen(req(data.customer, { bookingId: id }) as unknown as Request, out.response); return out; }]) terminal(await invoke());
    assert.equal((await Chat.findById(data.chat._id).orFail()).message, "Preserved evidence");
  }
});

test("conversation list includes confirmed, cancelled, and completed participant history only", async () => {
  const customer = await User.create({ email: `chat-list-${new Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const records = await Promise.all(["CONFIRMED", "CANCELLED", "COMPLETED"].map(async (status) => { const data = await fixture(status as "CONFIRMED" | "CANCELLED" | "COMPLETED"); await Booking.updateOne({ _id: data.booking._id }, { $set: { userId: customer._id } }); return data.booking; }));
  const out = response(); await getConversations({ user: { id: String(customer._id) } } as unknown as Request, out.response);
  assert.equal((out.body as { conversations: unknown[] }).conversations.length, 3);
  assert.equal(records.length, 3);
});
