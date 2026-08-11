import assert from "node:assert/strict";
import { test } from "node:test";

import User from "../../../models/User";
import { walletCreationService } from
  "../../../services/wallet/walletCreation.service";
import {
  authToken,
  createMultiCurrencyActors,
  startWalletServer,
} from "./fixtures/multiCurrencyTopUpFixtures";

const safeWalletKeys = [
  "currency", "available", "reserved", "locked", "current", "createdAt",
];

export const registerWalletListingTests = () => {
  test("phase10d listing: authenticated User receives only owned Wallets in stable order", async () => {
    const actors = await createMultiCurrencyActors();
    await Promise.all([
      walletCreationService.createWallet(actors.userId, "USD"),
      walletCreationService.createWallet(actors.userId, "EUR"),
    ]);
    const other = await createMultiCurrencyActors();
    await walletCreationService.createWallet(other.userId, "GBP");
    const server = await startWalletServer();
    try {
      const response = await fetch(`${server.baseUrl}/api/v1/wallet/all`, {
        headers: { authorization: `Bearer ${authToken(actors.userId)}` },
      });
      const body = await response.json() as any;
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.deepEqual(body.data.map((item: any) => item.currency),
        ["EUR", "INR", "USD"]);
      assert.ok(body.data.every((item: any) =>
        Object.keys(item).sort().join("|") ===
          safeWalletKeys.slice().sort().join("|")));
      assert.ok(body.data.every((item: any) =>
        !Object.keys(item).some((key) => /id|fingerprint|version/i.test(key))));
    } finally {
      await server.close();
    }
  });

  test("phase10d listing: Creator role reuses the same User-owned Wallet list", async () => {
    const actors = await createMultiCurrencyActors();
    await walletCreationService.createWallet(actors.userId, "USD");
    await User.findByIdAndUpdate(actors.userId, { role: "creator" });
    const server = await startWalletServer();
    try {
      const response = await fetch(`${server.baseUrl}/api/v1/wallet/all`, {
        headers: { authorization: `Bearer ${authToken(actors.userId)}` },
      });
      const body = await response.json() as any;
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.deepEqual(body.data.map((item: any) => item.currency),
        ["INR", "USD"]);
      assert.ok(body.data.every((item: any) => !item.creatorId));
    } finally {
      await server.close();
    }
  });

  test("phase10d metadata: authenticated currency registry exposes minor units without rates", async () => {
    const actors = await createMultiCurrencyActors();
    const server = await startWalletServer();
    try {
      const response = await fetch(
        `${server.baseUrl}/api/v1/wallet/currencies`,
        { headers: { authorization: `Bearer ${authToken(actors.userId)}` } },
      );
      const body = await response.json() as any;
      assert.equal(response.status, 200, JSON.stringify(body));
      const jpy = body.data.find((item: any) => item.code === "JPY");
      const usd = body.data.find((item: any) => item.code === "USD");
      assert.deepEqual(jpy, {
        code: "JPY",
        displayName: "Japanese Yen",
        symbol: "¥",
        minorUnits: 0,
        walletEnabled: true,
        topUpEnabled: true,
      });
      assert.equal(usd.minorUnits, 2);
      assert.ok(body.data.every((item: any) =>
        !Object.keys(item).some((key) => /rate|provider|spread|fee/i.test(key))));
    } finally {
      await server.close();
    }
  });
};
