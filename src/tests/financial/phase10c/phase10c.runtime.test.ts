/// <reference path="../../../types/express.d.ts" />

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";

import { SUPPORTED_CURRENCIES } from
  "../../../constants/financial/supportedCurrencies";
import { InternalTopUpFundingOutcome } from
  "../../../enums/financial/internalTopUpFundingOutcome.enum";
import { LedgerSource } from "../../../enums/financial/ledgerSource.enum";
import { WalletTopUpDecision } from
  "../../../enums/financial/walletTopUpDecision.enum";
import { WalletError } from "../../../errors/financial/WalletError";
import { errorHandler } from "../../../middlewares/errorHandler";
import { notFound } from "../../../middlewares/notFound";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import walletRoutes from "../../../routes/v1/wallet.routes";
import { adminWalletTopUpDecisionService } from
  "../../../services/financial/adminWalletTopUpDecision.service";
import { currencyMetadataService } from
  "../../../services/financial/currencyMetadata.service";
import { topUpAccountingOrchestratorService } from
  "../../../services/financial/topUpAccountingOrchestrator.service";
import { topUpFundingOrchestratorService } from
  "../../../services/financial/topUpFundingOrchestrator.service";
import { walletTopUpRequestService } from
  "../../../services/financial/walletTopUpRequest.service";
import { walletCreationService } from
  "../../../services/wallet/walletCreation.service";
import {
  createActors,
  Phase7HActors,
} from "../phase7h/fixtures/topUpFixtures";
import {
  clearPhase7HDatabase,
  connectPhase7HDatabase,
  disconnectPhase7HDatabase,
} from "../phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10c-test-jwt-secret";

before(async () => connectPhase7HDatabase(), { timeout: 120_000 });
beforeEach(async () => clearPhase7HDatabase());
after(async () => disconnectPhase7HDatabase(), { timeout: 30_000 });

const completeTopUp = async (
  actors: Phase7HActors,
  currency: string,
  amount: number,
  idempotencyKey: string,
) => {
  const request = await walletTopUpRequestService.create(
    actors.userId.toString(),
    { amount, currency, idempotencyKey },
  );
  await adminWalletTopUpDecisionService.decide({
    adminUserId: actors.adminId.toString(),
    topUpReference: request.topUpReference,
    decision: WalletTopUpDecision.APPROVE,
  });
  await topUpFundingOrchestratorService.start({
    topUpReference: request.topUpReference,
    outcome: InternalTopUpFundingOutcome.SUCCESS,
  });
  const accounting = await topUpAccountingOrchestratorService.complete(
    request.topUpReference,
  );
  return { request, accounting };
};

const startWalletServer = async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/wallet", walletRoutes);
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server failed.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
};

test("phase10c creates and reuses supported currency Wallet buckets", async () => {
  const actors = await createActors();
  assert.equal(await Wallet.countDocuments({ userId: actors.userId }), 1);

  const first = await walletCreationService.createWallet(actors.userId, "USD");
  const replay = await walletCreationService.createWallet(actors.userId, "USD");
  assert.equal(first._id.toString(), replay._id.toString());
  assert.deepEqual([first.availableBalance, first.reservedBalance,
    first.lockedBalance, first.currentBalance], [0, 0, 0, 0]);
  assert.equal(await Wallet.countDocuments({ userId: actors.userId }), 2);
  await assert.rejects(
    () => walletCreationService.createWallet(actors.userId, "XYZ" as any),
    (error: unknown) => error instanceof WalletError &&
      error.code === "WALLET_UNSUPPORTED_CURRENCY",
  );

  const jpy = currencyMetadataService.get("JPY");
  assert.deepEqual(jpy, { code: "JPY", displayName: "Japanese Yen",
    symbol: "¥", minorUnits: 0, enabled: true });
  assert.equal(currencyMetadataService.listEnabled().length,
    SUPPORTED_CURRENCIES.length);
});

test("phase10c ten concurrent creations converge on one USD Wallet", async () => {
  const actors = await createActors();
  const wallets = await Promise.all(Array.from({ length: 10 }, () =>
    walletCreationService.createWallet(actors.userId, "USD")));
  assert.equal(new Set(wallets.map((wallet) => wallet._id.toString())).size, 1);
  assert.equal(await Wallet.countDocuments({
    userId: actors.userId,
    currency: "USD",
  }), 1);
});

test("phase10c USD top-up creates and credits only the USD Wallet", async () => {
  const actors = await createActors();
  const first = await completeTopUp(actors, "USD", 100,
    "phase10c-usd-top-up");
  const replayRequest = await walletTopUpRequestService.create(
    actors.userId.toString(),
    { amount: 100, currency: "USD", idempotencyKey: "phase10c-usd-top-up" },
  );
  const replayAccounting = await topUpAccountingOrchestratorService.complete(
    first.request.topUpReference,
  );
  assert.equal(replayRequest.topUpReference, first.request.topUpReference);
  assert.equal(replayAccounting.transactionId, first.accounting.transactionId);

  const [inr, usd, entries, projections] = await Promise.all([
    Wallet.findOne({ userId: actors.userId, currency: "INR" }).orFail(),
    Wallet.findOne({ userId: actors.userId, currency: "USD" }).orFail(),
    LedgerEntry.find({ source: LedgerSource.INTERNAL_TOP_UP_FUNDING }),
    WalletProjectionOperation.find({ userId: actors.userId }),
  ]);
  assert.deepEqual([inr.availableBalance, inr.currentBalance], [0, 0]);
  assert.deepEqual([usd.availableBalance, usd.currentBalance], [100, 100]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].currency, "USD");
  assert.equal(projections.length, 1);
  assert.equal(projections[0].currency, "USD");
  assert.ok(projections[0].walletId.equals(usd._id));
  assert.ok(!projections[0].walletId.equals(inr._id));
});

test("phase10c authenticated Wallet listing returns every owned currency", async () => {
  const actors = await createActors();
  await Promise.all([
    walletCreationService.createWallet(actors.userId, "USD"),
    walletCreationService.createWallet(actors.userId, "EUR"),
  ]);
  const token = jwt.sign(
    { id: actors.userId.toString(), role: "user" },
    process.env.JWT_SECRET!,
  );
  const server = await startWalletServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/v1/wallet/all`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await response.json() as Record<string, any>;
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(body.data.map((item: any) => item.currency),
      ["EUR", "INR", "USD"]);
    assert.ok(body.data.every((item: any) =>
      item.available === 0 && item.reserved === 0 && item.locked === 0 &&
      item.current === 0 && typeof item.createdAt === "string"));
    assert.ok(body.data.every((item: any) =>
      !Object.keys(item).some((key) => ["userId", "walletId", "_id",
        "projectionVersion"].includes(key))));
  } finally { await server.close(); }
});

test("phase10c MongoDB preserves the authoritative user-currency identity", async () => {
  const actors = await createActors();
  await walletCreationService.createWallet(actors.userId, "USD");
  await assert.rejects(() => Wallet.create({
    userId: actors.userId,
    currency: "USD",
  }), (error: any) => error?.code === 11000);
  const indexes = await Wallet.collection.indexes();
  const ownership = indexes.find((index) =>
    index.key.userId === 1 && index.key.currency === 1);
  assert.ok(ownership);
  assert.equal(ownership.unique, true);
});
