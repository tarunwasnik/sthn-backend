import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";
import type { Request, Response } from "express";
import User from "../../models/User";
import { Booking } from "../../models/booking.model";
import { Chat } from "../../models/chat.model";
import { bookingRepository } from "../../repositories/booking.repository";
import { captureCancellationReceipt } from "../../middlewares/cancellationReceipt.middleware";
import { admitCancellationEvidence, evaluateCancellationInteraction } from "../../services/financial/cancellationEvidence.service";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";

process.env.NODE_ENV = "test";
before(connectPhase7HDatabase, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase, { timeout: 30_000 });

async function fixture(accepted = true) {
  const suffix = String(new Types.ObjectId());
  const [customer, creator, stranger] = await User.create([
    { email: `evidence-c-${suffix}@test.local`, role: "user", status: "active" },
    { email: `evidence-p-${suffix}@test.local`, role: "creator", status: "active" },
    { email: `evidence-x-${suffix}@test.local`, role: "user", status: "active" },
  ]);
  const booking = await Booking.create({ slotIds: [new Types.ObjectId()], userId: customer._id, creatorId: creator._id,
    serviceId: new Types.ObjectId(), serviceTitle: "Test", durationMinutes: 30, price: 100, currency: "INR",
    status: "CONFIRMED", paymentStatus: "PENDING", expiresAt: new Date(Date.now() + 86400000),
    serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100,
    ...(accepted ? { creatorAcceptedAt: new Date(Date.now() - 60000) } : {}) });
  return { booking, customer, creator, stranger };
}

function request(bookingId: unknown, actorId: unknown): Request {
  const req = { params: { bookingId: String(bookingId) }, body: {}, user: { id: String(actorId) } } as unknown as Request;
  captureCancellationReceipt(req, {} as Response, () => undefined);
  return req;
}

test("authorized evidence is durable, private, replay-stable and cannot be claimed by another actor", async () => {
  const f = await fixture();
  const admitted = await admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER");
  assert.equal(admitted.outcome, "NOT_QUALIFIED");
  assert.equal(admitted.receiptOrder, "UNVERIFIED");
  assert.equal(admitted.eligibility, "PARTICIPANT_STATE_ONLY");
  assert.equal(admitted.operationKey, `booking-termination:${f.booking._id}`);
  assert.equal((await Booking.findById(f.booking._id).orFail()).cancellationEvidence, undefined);
  const replay = await admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER");
  assert.equal(replay.receiptAt.getTime(), admitted.receiptAt.getTime());
  await assert.rejects(() => admitCancellationEvidence(request(f.booking._id, f.stranger._id), "CUSTOMER"), /not authorized/);
  await assert.rejects(() => admitCancellationEvidence(request(f.booking._id, f.creator._id), "CREATOR"), /conflicts/);
  assert.equal((await Booking.findById(f.booking._id).orFail()).status, "CONFIRMED");
});

test("missing receipt, nonparticipant and terminal booking cannot establish evidence", async () => {
  const f = await fixture();
  const noReceipt = { params: { bookingId: String(f.booking._id) }, body: {}, user: { id: String(f.customer._id) } } as unknown as Request;
  await assert.rejects(() => admitCancellationEvidence(noReceipt, "CUSTOMER"), /server receipt/);
  await assert.rejects(() => admitCancellationEvidence(request(f.booking._id, f.stranger._id), "CUSTOMER"), /not authorized/);
  await Booking.updateOne({ _id: f.booking._id }, { $set: { status: "COMPLETED" } });
  await assert.rejects(() => admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER"), /not eligible/);
  assert.equal((await bookingRepository.findForCancellationEvidence(f.booking._id as Types.ObjectId))?.cancellationEvidence, undefined);
});

test("existing conflicting termination identity cannot be claimed by evidence admission", async () => {
  const f = await fixture();
  await Booking.updateOne({ _id: f.booking._id }, { $set: { terminationOperationKey: `booking-termination:${f.booking._id}`, terminationType: "CREATOR_CANCELLED", terminatedById: f.creator._id } });
  await assert.rejects(() => admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER"), /conflicts/);
  assert.equal((await bookingRepository.findForCancellationEvidence(f.booking._id as Types.ObjectId))?.cancellationEvidence, undefined);
});

test("ordinary messages qualify only when both participants have messaged; historical acceptance remains unknown", async () => {
  for (const count of [0, 1, 2]) {
    const f = await fixture();
    if (count >= 1) await Chat.create({ bookingId: f.booking._id, senderId: f.customer._id, senderRole: "USER", message: "Hi" });
    if (count >= 2) await Chat.create({ bookingId: f.booking._id, senderId: f.creator._id, senderRole: "CREATOR", message: "Hello" });
    assert.equal((await admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER")).outcome, count === 2 ? "QUALIFIED" : "NOT_QUALIFIED");
  }
  const historic = await fixture(false);
  assert.equal((await admitCancellationEvidence(request(historic.booking._id, historic.customer._id), "CUSTOMER")).reason, "MISSING_ACCEPTANCE");
});

test("candidate references isolate booking, participants and time and retain soft-deleted attachments", async () => {
  const f = await fixture();
  const before = new Date(Date.now() - 120000);
  const future = new Date(Date.now() + 60000);
  const good = await Chat.create({ bookingId: f.booking._id, senderId: f.creator._id, senderRole: "CREATOR", type: "image", message: "image", isDeleted: true,
    attachment: { url: "https://test.local/image", publicId: "test-image", fileName: "image.png", originalFileName: "image.png", mimeType: "image/png", fileSize: 1, resourceType: "image" } });
  await Chat.create({ bookingId: new Types.ObjectId(), senderId: f.customer._id, senderRole: "USER", message: "other" });
  await Chat.create({ bookingId: f.booking._id, senderId: f.stranger._id, senderRole: "USER", message: "other" });
  await Chat.create({ bookingId: f.booking._id, senderId: f.customer._id, senderRole: "CREATOR", message: "wrong role" });
  await Chat.create({ bookingId: f.booking._id, senderId: f.customer._id, senderRole: "USER", message: "early", createdAt: before });
  await Chat.create({ bookingId: f.booking._id, senderId: f.customer._id, senderRole: "USER", message: "late", createdAt: future });
  const admitted = await admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER");
  assert.deepEqual(admitted.candidateMessageIds.map(String), [String(good._id)]);
  await Chat.create({ bookingId: f.booking._id, senderId: f.customer._id, senderRole: "USER", message: "later" });
  const replay = await admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER");
  assert.deepEqual(replay.candidateMessageIds.map(String), [String(good._id)]);
  assert.equal(replay.outcome, "NOT_QUALIFIED");
});

test("concurrent same-actor admissions retain a single snapshot; conflicting actors cannot reuse it", async () => {
  const f = await fixture();
  const same = await Promise.all([
    admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER"),
    admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER"),
  ]);
  assert.equal(same[0].receiptAt.getTime(), same[1].receiptAt.getTime());
  assert.equal(same[0].recordedAt.getTime(), same[1].recordedAt.getTime());
  await assert.rejects(() => admitCancellationEvidence(request(f.booking._id, f.creator._id), "CREATOR"), /conflicts/);
});

test("previous V1 snapshots are replayed without being silently rewritten", async () => {
  const f = await fixture();
  await Booking.updateOne({ _id: f.booking._id }, { $set: { cancellationEvidence: {
    operationKey: `booking-termination:${f.booking._id}`, actorId: f.customer._id, actorType: "CUSTOMER", intent: "CUSTOMER_CANCELLED",
    receiptAt: new Date(), receiptOrder: "UNVERIFIED", eligibility: "PARTICIPANT_STATE_ONLY", version: "CANCELLATION_EVIDENCE_V1",
    outcome: "INSUFFICIENT_EVIDENCE", reason: "UNVERIFIED_RECEIPT_AND_MESSAGE_ORDER", candidateMessageIds: [], recordedAt: new Date(),
  } } });
  const replay = await admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER");
  assert.equal(replay.version, "CANCELLATION_EVIDENCE_V1");
  assert.equal(replay.outcome, "INSUFFICIENT_EVIDENCE");
});

test("simultaneous different actors produce one admission and one conflict", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER"),
    admitCancellationEvidence(request(f.booking._id, f.creator._id), "CREATOR"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const stored = await bookingRepository.findForCancellationEvidence(f.booking._id as Types.ObjectId);
  assert.ok(stored?.cancellationEvidence);
  assert.equal(stored.cancellationEvidence.receiptOrder, "UNVERIFIED");
});

test("message timestamp preceding receipt does not prove it committed before receipt", async () => {
  const f = await fixture();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const [message] = await Chat.create([{ bookingId: f.booking._id, senderId: f.customer._id, senderRole: "USER", message: "delayed" }], { session });
    const admitted = await admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER");
    assert.ok(message.createdAt.getTime() <= admitted.receiptAt.getTime());
    assert.equal(admitted.outcome, "NOT_QUALIFIED");
    assert.equal(admitted.candidateMessageIds.length, 0);
    await session.commitTransaction();
    const replay = await admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER");
    assert.equal(replay.outcome, "NOT_QUALIFIED");
    assert.equal(replay.candidateMessageIds.length, 0);
  } finally { await session.endSession(); }
});

test("failed transaction rolls back the admitted evidence", async (context) => {
  const f = await fixture();
  const original = bookingRepository.admitCancellationEvidence.bind(bookingRepository);
  context.mock.method(bookingRepository, "admitCancellationEvidence", async (...args: Parameters<typeof bookingRepository.admitCancellationEvidence>) => {
    await original(...args);
    throw new Error("injected failure");
  });
  await assert.rejects(() => admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER"), /injected failure/);
  assert.equal((await bookingRepository.findForCancellationEvidence(f.booking._id as Types.ObjectId))?.cancellationEvidence, undefined);
  context.mock.restoreAll();
  assert.equal((await admitCancellationEvidence(request(f.booking._id, f.customer._id), "CUSTOMER")).outcome, "NOT_QUALIFIED");
});

test("read-only evaluator handles both one-sided histories, multiple messages and two-way messages", async () => {
  const f = await fixture();
  const id = f.booking._id as Types.ObjectId;
  const cutoff = () => new Date(Date.now() + 1000);
  assert.equal((await evaluateCancellationInteraction(id, cutoff())).outcome, "NOT_QUALIFIED");
  for (let i = 0; i < 25; i++) await Chat.create({ bookingId: id, senderId: f.customer._id, senderRole: "USER", message: "Hi" });
  assert.equal((await evaluateCancellationInteraction(id, cutoff())).outcome, "NOT_QUALIFIED");
  await Chat.create({ bookingId: id, senderId: f.creator._id, senderRole: "CREATOR", message: "Hello" });
  assert.equal((await evaluateCancellationInteraction(id, cutoff())).outcome, "QUALIFIED");
  const creatorOnly = await fixture();
  await Chat.create({ bookingId: creatorOnly.booking._id, senderId: creatorOnly.creator._id, senderRole: "CREATOR", message: "Hi" });
  assert.equal((await evaluateCancellationInteraction(creatorOnly.booking._id as Types.ObjectId, cutoff())).outcome, "NOT_QUALIFIED");
  assert.equal((await Booking.findById(id).orFail()).hasInteracted, false);
});

test("evaluator excludes unrelated, system, pre-acceptance and post-cutoff messages; deleted attachments count", async () => {
  const f = await fixture();
  const id = f.booking._id as Types.ObjectId;
  const accepted = f.booking.creatorAcceptedAt!.getTime();
  const cutoff = new Date(accepted + 20000);
  await Chat.create({ bookingId: id, senderId: f.customer._id, senderRole: "USER", message: "early", createdAt: new Date(accepted) });
  await Chat.create({ bookingId: id, senderId: f.creator._id, senderRole: "CREATOR", message: "late", createdAt: new Date(cutoff.getTime() + 1) });
  await Chat.create({ bookingId: new Types.ObjectId(), senderId: f.customer._id, senderRole: "USER", message: "other", createdAt: new Date(accepted + 1) });
  await Chat.collection.insertOne({ bookingId: id, senderId: f.customer._id, senderRole: "SYSTEM", type: "text", message: "system", createdAt: new Date(accepted + 1) });
  assert.equal((await evaluateCancellationInteraction(id, cutoff)).outcome, "NOT_QUALIFIED");
  await Chat.create({ bookingId: id, senderId: f.customer._id, senderRole: "USER", message: "image.png", type: "image", isDeleted: true, createdAt: new Date(accepted + 1), attachment: { url: "https://test.local/x", publicId: "x", fileName: "image.png", originalFileName: "image.png", mimeType: "image/png", fileSize: 1, resourceType: "image" } });
  await Chat.create({ bookingId: id, senderId: f.creator._id, senderRole: "CREATOR", message: "Hi", createdAt: cutoff });
  assert.equal((await evaluateCancellationInteraction(id, cutoff)).outcome, "QUALIFIED");
});

test("evaluator fails closed for missing booking, acceptance, receipt and unreliable message timestamp", async () => {
  const f = await fixture(false);
  const id = f.booking._id as Types.ObjectId;
  assert.equal((await evaluateCancellationInteraction(new Types.ObjectId(), new Date())).reason, "MISSING_BOOKING");
  assert.equal((await evaluateCancellationInteraction(id, new Date(NaN))).reason, "INVALID_RECEIPT");
  assert.equal((await evaluateCancellationInteraction(id, new Date())).reason, "MISSING_ACCEPTANCE");
  await Booking.updateOne({ _id: id }, { $set: { creatorAcceptedAt: new Date(Date.now() - 60000) } });
  await Chat.collection.insertOne({ bookingId: id, senderId: f.customer._id, senderRole: "USER", type: "text", message: "missing timestamp" });
  const result = await evaluateCancellationInteraction(id, new Date());
  assert.equal(result.outcome, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.reason, "UNRELIABLE_MESSAGE_TIMESTAMP");
});

test("unavailable evidence returns an explicit insufficient outcome", async (context) => {
  context.mock.method(bookingRepository, "findById", async () => { throw new Error("database unavailable"); });
  const result = await evaluateCancellationInteraction(new Types.ObjectId(), new Date());
  assert.equal(result.outcome, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.reason, "EVIDENCE_UNAVAILABLE");
});
