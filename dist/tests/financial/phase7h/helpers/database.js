"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectPhase7HDatabase = exports.clearPhase7HDatabase = exports.connectPhase7HDatabase = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
const TEST_DATABASE = "sthn_phase7h_test";
let replSet = null;
const assertTestEnvironment = () => {
    strict_1.default.equal(process.env.NODE_ENV, "test", "Phase 7H requires NODE_ENV=test.");
    strict_1.default.match(TEST_DATABASE, /(test|testing|ci)/i, "Unsafe MongoDB test database name.");
};
const connectPhase7HDatabase = async () => {
    assertTestEnvironment();
    process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION ?? "8.2.6";
    process.env.MONGOMS_DOWNLOAD_DIR =
        process.env.MONGOMS_DOWNLOAD_DIR ?? "node_modules/.cache/mongodb-memory-server";
    replSet = await mongodb_memory_server_1.MongoMemoryReplSet.create({
        binary: { version: process.env.MONGOMS_VERSION },
        replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    const uri = replSet.getUri(TEST_DATABASE);
    await mongoose_1.default.connect(uri, { autoIndex: true });
    strict_1.default.match(mongoose_1.default.connection.name, /(test|testing|ci)/i, "Connected MongoDB database is not an isolated test database.");
    const requiredModels = [
        "WalletTopUpRequest",
        "InternalTopUpFunding",
        "LedgerEntry",
        "WalletProjectionOperation",
        "WalletTopUpReconciliation",
        "WalletTopUpRetryAttempt",
        "WalletTopUpRepairOperation",
        "WalletTopUpOperationalAudit",
        "Wallet",
        "BookingFundReservation",
        "Booking",
        "Payment",
        "Slot",
        "User",
        "UserProfile",
        "CreatorProfile",
        "CreatorService",
        "InternalPayment",
        "ProviderEvent",
    ].filter((name) => mongoose_1.default.modelNames().includes(name));
    await Promise.all(requiredModels.map((name) => mongoose_1.default.model(name).init()));
};
exports.connectPhase7HDatabase = connectPhase7HDatabase;
const clearPhase7HDatabase = async () => {
    assertTestEnvironment();
    strict_1.default.match(mongoose_1.default.connection.name, /(test|testing|ci)/i, "Refusing cleanup against an unsafe MongoDB database.");
    await Promise.all(Object.values(mongoose_1.default.connection.collections)
        .map((collection) => collection.deleteMany({})));
};
exports.clearPhase7HDatabase = clearPhase7HDatabase;
const disconnectPhase7HDatabase = async () => {
    await mongoose_1.default.disconnect();
    if (replSet)
        await replSet.stop();
    replSet = null;
};
exports.disconnectPhase7HDatabase = disconnectPhase7HDatabase;
