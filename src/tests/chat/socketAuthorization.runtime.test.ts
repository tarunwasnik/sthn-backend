import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import type { Server } from "socket.io";

import User from "../../models/User";
import { Booking } from "../../models/booking.model";
import { Chat } from "../../models/chat.model";
import { chatSocket, personalRoom } from "../../sockets/chat.socket";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "socket-authorization-test-secret";

type Handler = (...args: any[]) => unknown;

class FakeIo {
  middleware!: (socket: FakeSocket, next: (error?: Error) => void) => void;
  connection!: (socket: FakeSocket) => void;
  roomEvents: Array<{ room: string; event: string; payload: unknown }> = [];

  use(handler: FakeIo["middleware"]) { this.middleware = handler; return this; }
  on(event: string, handler: FakeIo["connection"]) { if (event === "connection") this.connection = handler; return this; }
  to(room: string) { return { emit: (event: string, payload: unknown) => this.roomEvents.push({ room, event, payload }) }; }
}

class FakeSocket {
  data: Record<string, unknown> = {};
  rooms = new Set<string>();
  handlers = new Map<string, Handler>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  roomEvents: Array<{ room: string; event: string; payload: unknown }> = [];
  id = new Types.ObjectId().toString();

  constructor(readonly token?: string) {
    this.handshake = { auth: token ? { token } : {} };
  }

  handshake: { auth: Record<string, unknown> };
  on(event: string, handler: Handler) { this.handlers.set(event, handler); return this; }
  emit(event: string, payload: unknown) { this.emitted.push({ event, payload }); return true; }
  join(room: string) { this.rooms.add(room); return this; }
  leave(room: string) { this.rooms.delete(room); return this; }
  to(room: string) { return { emit: (event: string, payload: unknown) => this.roomEvents.push({ room, event, payload }) }; }
  async invoke(event: string, ...args: any[]) { return this.handlers.get(event)?.(...args); }
}

const authenticate = async (io: FakeIo, socket: FakeSocket) => new Promise<Error | undefined>((resolve) => {
  void io.middleware(socket, (error?: Error) => resolve(error));
});

const tokenFor = (id: Types.ObjectId, role = "user") => jwt.sign({ id: String(id), role }, process.env.JWT_SECRET!);

async function fixture(status: "CONFIRMED" | "CANCELLED" = "CONFIRMED") {
  const suffix = new Types.ObjectId().toString();
  const customer = await User.create({ email: `socket-customer-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const creator = await User.create({ email: `socket-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE", role: "creator" });
  const stranger = await User.create({ email: `socket-stranger-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
  const booking = await Booking.create({ slotIds: [new Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new Types.ObjectId(), serviceTitle: "Socket service", durationMinutes: 30, price: 100, currency: "USD", status, paymentStatus: "PENDING", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86_400_000), serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 });
  const message = await Chat.create({ bookingId: booking._id, senderId: customer._id, senderRole: "USER", type: "text", message: "Persisted", seenBy: [customer._id] });
  return { customer, creator, stranger, booking, message };
}

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

test("socket authentication derives personal-room membership from the database-backed account", async () => {
  const io = new FakeIo(); chatSocket(io as unknown as Server);
  assert.ok(await authenticate(io, new FakeSocket()) instanceof Error);
  const { customer } = await fixture();
  const socket = new FakeSocket(tokenFor(customer._id));
  assert.equal(await authenticate(io, socket), undefined);
  io.connection(socket);
  assert.equal(socket.data.userId, String(customer._id));
  assert.equal(socket.rooms.has(personalRoom(String(customer._id))), true);
  assert.equal(socket.handlers.has("join-user"), false);
});

test("only booking participants join, including a creator acting as the booking customer", async () => {
  const io = new FakeIo(); chatSocket(io as unknown as Server);
  const { customer, creator, stranger, booking } = await fixture();
  await User.updateOne({ _id: customer._id }, { $set: { role: "creator" } });
  const customerSocket = new FakeSocket(tokenFor(customer._id, "creator"));
  const strangerSocket = new FakeSocket(tokenFor(stranger._id));
  assert.equal(await authenticate(io, customerSocket), undefined); io.connection(customerSocket);
  assert.equal(await authenticate(io, strangerSocket), undefined); io.connection(strangerSocket);
  let participantResult: { ok: boolean } | undefined;
  let strangerResult: { ok: boolean; code?: string } | undefined;
  await customerSocket.invoke("join-booking", String(booking._id), (result: typeof participantResult) => { participantResult = result; });
  await strangerSocket.invoke("join-booking", String(booking._id), (result: typeof strangerResult) => { strangerResult = result; });
  assert.deepEqual(participantResult, { ok: true });
  assert.deepEqual(strangerResult, { ok: false, code: "ACCESS_DENIED" });
  assert.equal(customerSocket.rooms.has(`booking:${booking._id}`), true);
  assert.equal(strangerSocket.rooms.has(`booking:${booking._id}`), false);
  assert.equal(String(creator._id).length > 0, true);
});

test("typing and delivered events ignore spoofed identity and require room membership", async () => {
  const io = new FakeIo(); chatSocket(io as unknown as Server);
  const { customer, creator, stranger, booking, message } = await fixture();
  const customerSocket = new FakeSocket(tokenFor(customer._id));
  const strangerSocket = new FakeSocket(tokenFor(stranger._id));
  assert.equal(await authenticate(io, customerSocket), undefined); io.connection(customerSocket);
  assert.equal(await authenticate(io, strangerSocket), undefined); io.connection(strangerSocket);
  await customerSocket.invoke("join-booking", String(booking._id));
  await customerSocket.invoke("chat:typing", { bookingId: String(booking._id), userId: String(creator._id) });
  assert.deepEqual(customerSocket.roomEvents[0]?.payload, { bookingId: String(booking._id), userId: String(customer._id) });
  await strangerSocket.invoke("chat:delivered", { bookingId: String(booking._id), messageId: String(message._id), userId: String(creator._id) });
  assert.equal(strangerSocket.roomEvents.length, 0);
});

test("terminal bookings remain readable rooms but reject transient chat mutations", async () => {
  const io = new FakeIo(); chatSocket(io as unknown as Server);
  const { customer, booking, message } = await fixture("CANCELLED");
  const socket = new FakeSocket(tokenFor(customer._id));
  assert.equal(await authenticate(io, socket), undefined); io.connection(socket);
  await socket.invoke("join-booking", String(booking._id));
  await socket.invoke("chat:typing", { bookingId: String(booking._id) });
  await socket.invoke("chat:delivered", { bookingId: String(booking._id), messageId: String(message._id) });
  assert.equal(socket.roomEvents.length, 0);
  assert.equal(socket.rooms.has(`booking:${booking._id}`), true);
});
