import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const TEST_DATABASE = "sthn_phase7h_test";
let replSet: MongoMemoryReplSet | null = null;

const assertTestEnvironment = () => {
  assert.equal(process.env.NODE_ENV, "test", "Phase 7H requires NODE_ENV=test.");
  assert.match(TEST_DATABASE, /(test|testing|ci)/i, "Unsafe MongoDB test database name.");
};

export const connectPhase7HDatabase = async () => {
  assertTestEnvironment();
  process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION ?? "8.2.6";
  process.env.MONGOMS_DOWNLOAD_DIR =
    process.env.MONGOMS_DOWNLOAD_DIR ?? "node_modules/.cache/mongodb-memory-server";
  replSet = await MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const uri = replSet.getUri(TEST_DATABASE);
  await mongoose.connect(uri, { autoIndex: true });
  assert.match(mongoose.connection.name, /(test|testing|ci)/i,
    "Connected MongoDB database is not an isolated test database.");
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
  ].filter((name) => mongoose.modelNames().includes(name));
  await Promise.all(requiredModels.map((name) => mongoose.model(name).init()));
};

export const clearPhase7HDatabase = async () => {
  assertTestEnvironment();
  assert.match(mongoose.connection.name, /(test|testing|ci)/i,
    "Refusing cleanup against an unsafe MongoDB database.");
  await Promise.all(
    Object.values(mongoose.connection.collections)
      .map((collection) => collection.deleteMany({})),
  );
};

export const disconnectPhase7HDatabase = async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
  replSet = null;
};
