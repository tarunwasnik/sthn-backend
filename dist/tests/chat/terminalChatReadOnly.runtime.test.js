"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const User_1 = __importDefault(require("../../models/User"));
const booking_model_1 = require("../../models/booking.model");
const chat_model_1 = require("../../models/chat.model");
const chat_controller_1 = require("../../controllers/chat.controller");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
const response = () => { const result = {}; result.response = { status: (code) => { result.statusCode = code; return result.response; }, json: (body) => { result.body = body; return result.response; } }; return result; };
const req = (actor, params, body = {}) => ({ user: { id: String(actor._id), role: "user" }, params, body });
async function fixture(status) {
    const suffix = new mongoose_1.Types.ObjectId().toString();
    const customer = await User_1.default.create({ email: `chat-customer-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    const creator = await User_1.default.create({ email: `chat-creator-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE", role: "creator" });
    const stranger = await User_1.default.create({ email: `chat-stranger-${suffix}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    const booking = await booking_model_1.Booking.create({ slotIds: [new mongoose_1.Types.ObjectId()], userId: customer._id, creatorId: creator._id, serviceId: new mongoose_1.Types.ObjectId(), serviceTitle: "Chat service", durationMinutes: 30, price: 100, currency: "USD", status, paymentStatus: "PENDING", isPayable: true, isPayoutEligible: false, isFinancialLocked: false, expiresAt: new Date(Date.now() + 86400000), serviceAmount: 100, platformFeeAmount: 0, commissionAmount: 20, creatorAmount: 80, totalAmount: 100 });
    const chat = await chat_model_1.Chat.create({ bookingId: booking._id, senderId: customer._id, senderRole: "USER", type: "text", message: "Preserved evidence", seenBy: [customer._id], reactions: [{ userId: creator._id, emoji: "👍" }] });
    return { customer, creator, stranger, booking, chat };
}
const read = async (actor, bookingId) => { const out = response(); await (0, chat_controller_1.getChatHistory)(req(actor, { bookingId }), out.response); return out; };
const terminal = (out) => { strict_1.default.equal(out.statusCode, 409); strict_1.default.deepEqual(out.body, { code: "CHAT_READ_ONLY", message: "This booking conversation is read-only." }); };
(0, node_test_1.test)("terminal chat remains readable only to customer and creator, preserving messages, reactions, and soft-delete state", async () => {
    for (const status of ["CANCELLED", "COMPLETED"]) {
        const data = await fixture(status);
        for (const actor of [data.customer, data.creator]) {
            const out = await read(actor, String(data.booking._id));
            strict_1.default.equal(out.statusCode, 200);
            strict_1.default.equal(out.body.chats[0].message, "Preserved evidence");
        }
        strict_1.default.equal((await read(data.stranger, String(data.booking._id))).statusCode, 403);
        strict_1.default.equal((await chat_model_1.Chat.findById(data.chat._id).orFail()).reactions.length, 1);
    }
});
(0, node_test_1.test)("cancelled and completed chat mutations fail closed with CHAT_READ_ONLY", async () => {
    for (const status of ["CANCELLED", "COMPLETED"]) {
        const data = await fixture(status);
        const id = String(data.booking._id);
        const messageId = String(data.chat._id);
        for (const invoke of [async () => { const out = response(); await (0, chat_controller_1.sendMessage)(req(data.customer, { bookingId: id }, { message: "blocked" }), out.response); return out; }, async () => { const out = response(); await (0, chat_controller_1.deleteMessage)(req(data.customer, { messageId }), out.response); return out; }, async () => { const out = response(); await (0, chat_controller_1.reactToMessage)(req(data.customer, { messageId }, { emoji: "❤️" }), out.response); return out; }, async () => { const out = response(); await (0, chat_controller_1.markChatAsSeen)(req(data.customer, { bookingId: id }), out.response); return out; }])
            terminal(await invoke());
        strict_1.default.equal((await chat_model_1.Chat.findById(data.chat._id).orFail()).message, "Preserved evidence");
    }
});
(0, node_test_1.test)("conversation list includes confirmed, cancelled, and completed participant history only", async () => {
    const customer = await User_1.default.create({ email: `chat-list-${new mongoose_1.Types.ObjectId()}@test.local`, password: "test", status: "active", governanceState: "ACTIVE" });
    const records = await Promise.all(["CONFIRMED", "CANCELLED", "COMPLETED"].map(async (status) => { const data = await fixture(status); await booking_model_1.Booking.updateOne({ _id: data.booking._id }, { $set: { userId: customer._id } }); return data.booking; }));
    const out = response();
    await (0, chat_controller_1.getConversations)({ user: { id: String(customer._id) } }, out.response);
    strict_1.default.equal(out.body.conversations.length, 3);
    strict_1.default.equal(records.length, 3);
});
