import assert from "node:assert/strict";
import { test } from "node:test";

import { planLegacyWalletUserUniqueIndexRemoval } from
  "../../../scripts/removeLegacyWalletUserUniqueIndex";

const compound = {
  name: "userId_1_currency_1",
  key: { userId: 1, currency: 1 },
  unique: true,
};

export const registerWalletIndexMaintenanceTests = () => {
  test("phase10d maintenance identifies only the stale unique userId index", () => {
    const plan = planLegacyWalletUserUniqueIndexRemoval([
      { name: "_id_", key: { _id: 1 }, unique: true },
      { name: "userId_1", key: { userId: 1 }, unique: true },
      compound,
    ]);
    assert.equal(plan.staleUserUniqueIndex?.name, "userId_1");
    assert.equal(plan.compoundCurrencyIndex.name, "userId_1_currency_1");
  });

  test("phase10d maintenance refuses an unexpected userId_1 signature", () => {
    assert.throws(() => planLegacyWalletUserUniqueIndexRemoval([
      { name: "userId_1", key: { userId: 1 }, unique: false }, compound,
    ]), /expected stale unique/);
  });

  test("phase10d maintenance requires compound Wallet ownership uniqueness", () => {
    assert.throws(() => planLegacyWalletUserUniqueIndexRemoval([
      { name: "userId_1", key: { userId: 1 }, unique: true },
    ]), /compound unique/);
  });
};
