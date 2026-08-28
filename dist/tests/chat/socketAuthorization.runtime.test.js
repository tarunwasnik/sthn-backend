"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = require("mongoose");
const User_1 = __importDefault(require("../../models/User"));
const booking_model_1 = require("../../models/booking.model");
const chat_model_1 = require("../../models/chat.model");
const chat_socket_1 = require("../../sockets/chat.socket");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "socket-authorization-test-secret";
class FakeIo {
    constructor() {
        this.roomEvents = [];
    }
    use(handler) { this.middleware = handler; return this; }
    on(event, handler) { if (event === "connection")
        this.connection = handler; return this; }
    to(room) { return { emit: (event, payload) => this.roomEvents.push({ room, event, payload }) }; }
}
class FakeSocket {
    constructor(token) {
        this.token = token;
        this.data = {};
        this.rooms = new Set();
        this.handlers = new Map();
        this.emitted = [];
        this.roomEvents = [];
        this.id = new mongoose_1.Types.ObjectId().toString();
        this.handshake = { auth: token ? { token } : {} };
    }
    on(event, handler) { this.handlers.set(event, handler); return this; }
    emit(event, payload) { this.emitted.push({ event, payload }); return true; }
    join(room) { this.rooms.add(room); return this; }
    leave(room) { this.rooms.delete(room); return this; }
    to(room) { return { emit: (event, payload) => this.roomEvents.push({ room, event, payload }) }; }
    async invoke(event, ...args) { return this.handlers.get(event)?.(...args); }
}
const authenticate = async (io, socket) => new Promise((resolve) => {
    void io.middleware(socket, (error) => resolve(error));
});
const tokenFor = (id, role = "user") => jsonwebtoken_1.default.sign({ id: String(id), role }, process.env.JWT_SECRET);
async function fixture(status = "CONFIRMED") {
    const suffix = new mongoose_1.Types.ObjectId().toString();
    const customer = await User_1.default.create({ email: `socket-customer-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    const creator = await User_1.default.create({ email: `socket-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE", role: "creator" });
    const stranger = await User_1.default.create({ email: `socket-stranger-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    const booking = await booking_model_1.Booking.create({ slotIds: [new mongoose_1.Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new mongoose_1.Types.ObjectId(), serviceTitle: "Socket service", durationMinutes: 30, price: 100, currency: "USD", status, paymentStatus: "PENDING", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86400000), serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 });
    const message = await chat_model_1.Chat.create({ bookingId: booking._id, senderId: customer._id, senderRole: "USER", type: "text", message: "Persisted", seenBy: [customer._id] });
    return { customer, creator, stranger, booking, message };
}
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, node_test_1.test)("socket authentication derives personal-room membership from the database-backed account", async () => {
    const io = new FakeIo();
    (0, chat_socket_1.chatSocket)(io);
    strict_1.default.ok(await authenticate(io, new FakeSocket()) instanceof Error);
    const { customer } = await fixture();
    const socket = new FakeSocket(tokenFor(customer._id));
    strict_1.default.equal(await authenticate(io, socket), undefined);
    io.connection(socket);
    strict_1.default.equal(socket.data.userId, String(customer._id));
    strict_1.default.equal(socket.rooms.has((0, chat_socket_1.personalRoom)(String(customer._id))), true);
    strict_1.default.equal(socket.handlers.has("join-user"), false);
});
(0, node_test_1.test)("only booking participants join, including a creator acting as the booking customer", async () => {
    const io = new FakeIo();
    (0, chat_socket_1.chatSocket)(io);
    const { customer, creator, stranger, booking } = await fixture();
    await User_1.default.updateOne({ _id: customer._id }, { $set: { role: "creator" } });
    const customerSocket = new FakeSocket(tokenFor(customer._id, "creator"));
    const strangerSocket = new FakeSocket(tokenFor(stranger._id));
    strict_1.default.equal(await authenticate(io, customerSocket), undefined);
    io.connection(customerSocket);
    strict_1.default.equal(await authenticate(io, strangerSocket), undefined);
    io.connection(strangerSocket);
    let participantResult;
    let strangerResult;
    await customerSocket.invoke("join-booking", String(booking._id), (result) => { participantResult = result; });
    await strangerSocket.invoke("join-booking", String(booking._id), (result) => { strangerResult = result; });
    strict_1.default.deepEqual(participantResult, { ok: true });
    strict_1.default.deepEqual(strangerResult, { ok: false, code: "ACCESS_DENIED" });
    strict_1.default.equal(customerSocket.rooms.has(`booking:${booking._id}`), true);
    strict_1.default.equal(strangerSocket.rooms.has(`booking:${booking._id}`), false);
    strict_1.default.equal(String(creator._id).length > 0, true);
});
(0, node_test_1.test)("typing and delivered events ignore spoofed identity and require room membership", async () => {
    const io = new FakeIo();
    (0, chat_socket_1.chatSocket)(io);
    const { customer, creator, stranger, booking, message } = await fixture();
    const customerSocket = new FakeSocket(tokenFor(customer._id));
    const strangerSocket = new FakeSocket(tokenFor(stranger._id));
    strict_1.default.equal(await authenticate(io, customerSocket), undefined);
    io.connection(customerSocket);
    strict_1.default.equal(await authenticate(io, strangerSocket), undefined);
    io.connection(strangerSocket);
    await customerSocket.invoke("join-booking", String(booking._id));
    await customerSocket.invoke("chat:typing", { bookingId: String(booking._id), userId: String(creator._id) });
    strict_1.default.deepEqual(customerSocket.roomEvents[0]?.payload, { bookingId: String(booking._id), userId: String(customer._id) });
    await strangerSocket.invoke("chat:delivered", { bookingId: String(booking._id), messageId: String(message._id), userId: String(creator._id) });
    strict_1.default.equal(strangerSocket.roomEvents.length, 0);
});
(0, node_test_1.test)("terminal bookings remain readable rooms but reject transient chat mutations", async () => {
    const io = new FakeIo();
    (0, chat_socket_1.chatSocket)(io);
    const { customer, booking, message } = await fixture("CANCELLED");
    const socket = new FakeSocket(tokenFor(customer._id));
    strict_1.default.equal(await authenticate(io, socket), undefined);
    io.connection(socket);
    await socket.invoke("join-booking", String(booking._id));
    await socket.invoke("chat:typing", { bookingId: String(booking._id) });
    await socket.invoke("chat:delivered", { bookingId: String(booking._id), messageId: String(message._id) });
    strict_1.default.equal(socket.roomEvents.length, 0);
    strict_1.default.equal(socket.rooms.has(`booking:${booking._id}`), true);
});
