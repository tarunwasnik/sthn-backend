"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const mongoose_1 = require("mongoose");
const User_1 = __importDefault(require("../../models/User"));
const availability_model_1 = require("../../models/availability.model");
const creatorService_model_1 = require("../../models/creatorService.model");
const slot_model_1 = require("../../models/slot.model");
const creatorAvailability_controller_1 = require("../../controllers/creatorAvailability.controller");
const database_1 = require("../financial/phase7h/helpers/database");
process.env.NODE_ENV = "test";
const response = () => {
    const result = {};
    result.response = {
        status: (statusCode) => {
            result.statusCode = statusCode;
            return result.response;
        },
        json: (body) => {
            result.body = body;
            return result.response;
        },
    };
    return result;
};
const request = (userId, params = {}, body = {}) => ({
    user: { id: String(userId), role: "creator" },
    params,
    body,
});
async function fixture() {
    const suffix = new mongoose_1.Types.ObjectId().toString();
    const [creatorA, creatorB] = await Promise.all([
        User_1.default.create({ email: `availability-a-${suffix}@test.local`, password: "test", role: "creator", status: "active", governanceState: "ACTIVE" }),
        User_1.default.create({ email: `availability-b-${suffix}@test.local`, password: "test", role: "creator", status: "active", governanceState: "ACTIVE" }),
    ]);
    const [serviceA, serviceB] = await Promise.all([
        creatorService_model_1.CreatorService.create({ creatorId: creatorA._id, title: "A service", description: "A", durationMinutes: 60, price: 100, currency: "USD", isActive: true }),
        creatorService_model_1.CreatorService.create({ creatorId: creatorB._id, title: "B service", description: "B", durationMinutes: 60, price: 100, currency: "USD", isActive: true }),
    ]);
    const date = new Date(Date.now() + 86400000 * 7);
    const [availabilityA, availabilityB] = await Promise.all([
        availability_model_1.Availability.create({ creatorId: creatorA._id, serviceId: serviceA._id, date, startTime: "10:00", endTime: "12:00", timezone: "UTC", slotDurationMinutes: 60, status: "ACTIVE" }),
        availability_model_1.Availability.create({ creatorId: creatorB._id, serviceId: serviceB._id, date, startTime: "10:00", endTime: "12:00", timezone: "UTC", slotDurationMinutes: 60, status: "ACTIVE" }),
    ]);
    const [slotA, slotB] = await Promise.all([
        slot_model_1.Slot.create({ availabilityId: availabilityA._id, creatorId: creatorA._id, serviceId: serviceA._id, startTime: date, endTime: new Date(date.getTime() + 3600000), timezone: "UTC", status: "AVAILABLE", price: 100 }),
        slot_model_1.Slot.create({ availabilityId: availabilityB._id, creatorId: creatorB._id, serviceId: serviceB._id, startTime: date, endTime: new Date(date.getTime() + 3600000), timezone: "UTC", status: "AVAILABLE", price: 100 }),
    ]);
    return { creatorA, creatorB, serviceA, serviceB, availabilityA, availabilityB, slotA, slotB };
}
(0, node_test_1.before)(async () => (0, database_1.connectPhase7HDatabase)(), { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => (0, database_1.clearPhase7HDatabase)());
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, node_test_1.test)("create availability permits the owner and rejects another creator's service without writes", async () => {
    const { creatorA, serviceA, serviceB } = await fixture();
    const date = new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10);
    const body = { date, startTime: "10:00", endTime: "11:00", timezone: "UTC" };
    const own = response();
    await (0, creatorAvailability_controller_1.createAvailability)(request(creatorA._id, {}, { ...body, serviceId: String(serviceA._id) }), own.response);
    strict_1.default.equal(own.statusCode, 201);
    const beforeAvailabilityCount = await availability_model_1.Availability.countDocuments({ creatorId: creatorA._id, serviceId: serviceB._id });
    const beforeSlotCount = await slot_model_1.Slot.countDocuments({ creatorId: creatorA._id, serviceId: serviceB._id });
    const crossOwner = response();
    await (0, creatorAvailability_controller_1.createAvailability)(request(creatorA._id, {}, { ...body, serviceId: String(serviceB._id) }), crossOwner.response);
    strict_1.default.equal(crossOwner.statusCode, 404);
    strict_1.default.equal(await availability_model_1.Availability.countDocuments({ creatorId: creatorA._id, serviceId: serviceB._id }), beforeAvailabilityCount);
    strict_1.default.equal(await slot_model_1.Slot.countDocuments({ creatorId: creatorA._id, serviceId: serviceB._id }), beforeSlotCount);
});
(0, node_test_1.test)("private availability reads and parent cancellation are ownership-scoped", async () => {
    const { creatorA, availabilityA, availabilityB, slotA, slotB } = await fixture();
    const ownCancel = response();
    await (0, creatorAvailability_controller_1.cancelAvailability)(request(creatorA._id, { availabilityId: String(availabilityA._id) }), ownCancel.response);
    strict_1.default.equal(ownCancel.statusCode, 200);
    strict_1.default.equal((await availability_model_1.Availability.findById(availabilityA._id).orFail()).status, "CANCELLED");
    strict_1.default.equal((await slot_model_1.Slot.findById(slotA._id).orFail()).status, "CANCELLED");
    const read = response();
    await (0, creatorAvailability_controller_1.getAvailabilitySlots)(request(creatorA._id, { availabilityId: String(availabilityB._id) }), read.response);
    strict_1.default.equal(read.statusCode, 404);
    strict_1.default.equal(((await slot_model_1.Slot.findById(slotB._id).orFail()).status), "AVAILABLE");
    const cancel = response();
    await (0, creatorAvailability_controller_1.cancelAvailability)(request(creatorA._id, { availabilityId: String(availabilityB._id) }), cancel.response);
    strict_1.default.equal(cancel.statusCode, 400);
    strict_1.default.equal((await availability_model_1.Availability.findById(availabilityB._id).orFail()).status, "ACTIVE");
    strict_1.default.equal((await slot_model_1.Slot.findById(slotB._id).orFail()).status, "AVAILABLE");
});
(0, node_test_1.test)("slot mutations are ownership-scoped and preserve the victim slot", async () => {
    const { creatorA, creatorB, availabilityA, serviceA, slotA, slotB } = await fixture();
    const ownDisable = response();
    await (0, creatorAvailability_controller_1.disableSlot)(request(creatorA._id, { slotId: String(slotA._id) }), ownDisable.response);
    strict_1.default.equal(ownDisable.statusCode, 200);
    strict_1.default.equal((await slot_model_1.Slot.findById(slotA._id).orFail()).status, "CANCELLED");
    const ownEnable = response();
    await (0, creatorAvailability_controller_1.enableSlot)(request(creatorA._id, { slotId: String(slotA._id) }), ownEnable.response);
    strict_1.default.equal(ownEnable.statusCode, 200);
    strict_1.default.equal((await slot_model_1.Slot.findById(slotA._id).orFail()).status, "AVAILABLE");
    const disableVictim = response();
    await (0, creatorAvailability_controller_1.disableSlot)(request(creatorA._id, { slotId: String(slotB._id) }), disableVictim.response);
    strict_1.default.equal(disableVictim.statusCode, 404);
    strict_1.default.equal((await slot_model_1.Slot.findById(slotB._id).orFail()).status, "AVAILABLE");
    await slot_model_1.Slot.updateOne({ _id: slotB._id }, { $set: { status: "CANCELLED" } });
    const enableVictim = response();
    await (0, creatorAvailability_controller_1.enableSlot)(request(creatorA._id, { slotId: String(slotB._id) }), enableVictim.response);
    strict_1.default.equal(enableVictim.statusCode, 404);
    strict_1.default.equal((await slot_model_1.Slot.findById(slotB._id).orFail()).status, "CANCELLED");
    const deleteVictim = response();
    await (0, creatorAvailability_controller_1.deleteSlot)(request(creatorA._id, { slotId: String(slotB._id) }), deleteVictim.response);
    strict_1.default.equal(deleteVictim.statusCode, 404);
    strict_1.default.ok(await slot_model_1.Slot.exists({ _id: slotB._id }));
    const ownSlot = await slot_model_1.Slot.create({ availabilityId: availabilityA._id, creatorId: creatorA._id, serviceId: serviceA._id, startTime: new Date(), endTime: new Date(Date.now() + 3600000), timezone: "UTC", status: "AVAILABLE", price: 100 });
    const ownDelete = response();
    await (0, creatorAvailability_controller_1.deleteSlot)(request(creatorA._id, { slotId: String(ownSlot._id) }), ownDelete.response);
    strict_1.default.equal(ownDelete.statusCode, 200);
    strict_1.default.equal(await slot_model_1.Slot.exists({ _id: ownSlot._id }), null);
    strict_1.default.equal(String(creatorB._id).length > 0, true);
});
(0, node_test_1.test)("malformed availability, slot, and service IDs fail with bounded 400 responses", async () => {
    const { creatorA } = await fixture();
    const invalidAvailability = response();
    await (0, creatorAvailability_controller_1.getAvailabilitySlots)(request(creatorA._id, { availabilityId: "invalid" }), invalidAvailability.response);
    strict_1.default.equal(invalidAvailability.statusCode, 400);
    const invalidSlot = response();
    await (0, creatorAvailability_controller_1.disableSlot)(request(creatorA._id, { slotId: "invalid" }), invalidSlot.response);
    strict_1.default.equal(invalidSlot.statusCode, 400);
    const invalidService = response();
    await (0, creatorAvailability_controller_1.createAvailability)(request(creatorA._id, {}, { serviceId: "invalid", date: "2099-01-01", startTime: "10:00", endTime: "11:00", timezone: "UTC" }), invalidService.response);
    strict_1.default.equal(invalidService.statusCode, 400);
});
