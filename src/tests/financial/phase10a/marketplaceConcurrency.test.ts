import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSuccessfulMarketplaceFlow,
  replaySuccessfulMarketplaceFlow,
  snapshotMarketplaceCounts,
} from "./fixtures/marketplaceFixtures";

export const registerMarketplaceConcurrencyTests = () => {
  test("phase10a ten concurrent complete-flow replays converge", async () => {
    const flow = await createSuccessfulMarketplaceFlow();
    try {
      const before = await snapshotMarketplaceCounts();
      const results = await Promise.all(Array.from({ length: 10 }, () =>
        replaySuccessfulMarketplaceFlow(flow)));
      assert.deepEqual(await snapshotMarketplaceCounts(), before);
      assert.equal(new Set(results.map((item) =>
        item.allocation.allocation.allocationReference)).size, 1);
      assert.equal(new Set(results.map((item) =>
        item.settlement.settlement.settlementReference)).size, 1);
      assert.equal(new Set(results.map((item) =>
        item.withdrawal.withdrawalReference)).size, 1);
      assert.ok(results.every((item) =>
        item.reconciliation.classification === "HEALTHY_COMPLETED"));
    } finally { await flow.server.close(); }
  });
};
