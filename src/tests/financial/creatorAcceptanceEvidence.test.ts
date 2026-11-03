import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";
import { Booking } from "../../models/booking.model";
import { Chat } from "../../models/chat.model";
import { Slot } from "../../models/slot.model";
import { notificationService } from "../../services/notification/notification.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";
import { createActiveWalletBooking, postCreatorDecision, startReleaseHttpServer } from "./phase8b/fixtures/bookingWalletReleaseFixtures";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase2b-isolated-test-secret";
before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("acceptance persists a timestamp and a duplicate cannot overwrite it", { timeout: 120_000 }, async () => {
  const server = await startReleaseHttpServer();
  try {
    const { booking, creatorToken } = await createActiveWalletBooking(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
    assert.equal(booking.creatorAcceptedAt, undefined);
    const beforeAccept = Date.now();
    const result = await postCreatorDecision(server.baseUrl, String(booking._id), creatorToken, "ACCEPT");
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const confirmed = await Booking.findById(booking._id).orFail();
    assert.equal(confirmed.status, "CONFIRMED");
    assert.ok(confirmed.creatorAcceptedAt);
    const timestamp = confirmed.creatorAcceptedAt.getTime();
    assert.ok(timestamp >= beforeAccept && timestamp <= Date.now());
    const repeated = await postCreatorDecision(server.baseUrl, String(booking._id), creatorToken, "ACCEPT");
    assert.equal(repeated.status, 400);
    assert.equal((await Booking.findById(booking._id).orFail()).creatorAcceptedAt?.getTime(), timestamp);
  } finally { await server.close(); }
});

test("failed acceptance leaves the booking, slot and timestamp unchanged", { timeout: 120_000 }, async () => {
  const server = await startReleaseHttpServer();
  try {
    const { booking, creatorToken } = await createActiveWalletBooking(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
    await Slot.updateOne({ _id: booking.slotIds[0] }, { $set: { status: "AVAILABLE" } });
    const result = await postCreatorDecision(server.baseUrl, String(booking._id), creatorToken, "ACCEPT");
    assert.equal(result.status, 400);
    const unchanged = await Booking.findById(booking._id).orFail();
    assert.equal(unchanged.status, "REQUESTED");
    assert.equal(unchanged.creatorAcceptedAt, undefined);
    assert.equal((await Slot.findById(booking.slotIds[0]).orFail()).status, "AVAILABLE");
  } finally { await server.close(); }
});

test("expired booking acceptance and creator rejection do not set acceptance time", { timeout: 120_000 }, async () => {
  const server = await startReleaseHttpServer();
  try {
    const expired = await createActiveWalletBooking(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
    await Booking.updateOne({ _id: expired.booking._id }, { $set: { expiresAt: new Date(0) } });
    assert.equal((await postCreatorDecision(server.baseUrl, String(expired.booking._id), expired.creatorToken, "ACCEPT")).status, 400);
    assert.equal((await Booking.findById(expired.booking._id).orFail()).creatorAcceptedAt, undefined);
    const rejected = await createActiveWalletBooking(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
    const result = await postCreatorDecision(server.baseUrl, String(rejected.booking._id), rejected.creatorToken, "REJECT");
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const booking = await Booking.findById(rejected.booking._id).orFail();
    assert.equal(booking.status, "REJECTED");
    assert.equal(booking.creatorAcceptedAt, undefined);
  } finally { await server.close(); }
});

test("transaction abort rolls back acceptance timestamp and status", { timeout: 120_000 }, async () => {
  const server = await startReleaseHttpServer();
  try {
    const { booking } = await createActiveWalletBooking(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const pending = await Booking.findById(booking._id).session(session).orFail();
      pending.status = "CONFIRMED";
      pending.creatorAcceptedAt = new Date();
      await pending.save({ session });
      await session.abortTransaction();
    } finally { await session.endSession(); }
    const unchanged = await Booking.findById(booking._id).orFail();
    assert.equal(unchanged.status, "REQUESTED");
    assert.equal(unchanged.creatorAcceptedAt, undefined);
  } finally { await server.close(); }
});

test("acceptance rolls back the saved timestamp if a later transaction step fails", { timeout: 120_000 }, async (context) => {
  const server = await startReleaseHttpServer();
  try {
    const { booking, creatorToken } = await createActiveWalletBooking(server.baseUrl, { walletAmount: 1000, slotAmounts: [400] });
    context.mock.method(notificationService, "createWithOutcome", async () => { throw new Error("injected notification failure"); });
    const result = await postCreatorDecision(server.baseUrl, String(booking._id), creatorToken, "ACCEPT");
    assert.equal(result.status, 400);
    const unchanged = await Booking.findById(booking._id).orFail();
    assert.equal(unchanged.status, "REQUESTED");
    assert.equal(unchanged.creatorAcceptedAt, undefined);
    assert.equal((await Slot.findById(booking.slotIds[0]).orFail()).status, "LOCKED");
  } finally { await server.close(); }
});

test("message creation time does not prove visibility before a cancellation cutoff", { timeout: 120_000 }, async () => {
  const session = await mongoose.startSession();
  const bookingId = new Types.ObjectId();
  const senderId = new Types.ObjectId();
  try {
    session.startTransaction();
    const [message] = await Chat.create([{ bookingId, senderId, senderRole: "USER", type: "text", message: "Hi" }], { session });
    const cutoff = new Date(Math.max(Date.now(), message.createdAt.getTime()));
    assert.equal(await Chat.countDocuments({ bookingId, createdAt: { $lte: cutoff } }), 0);
    await session.commitTransaction();
    assert.equal(await Chat.countDocuments({ bookingId, createdAt: { $lte: cutoff } }), 1);
  } finally { await session.endSession(); }
});
