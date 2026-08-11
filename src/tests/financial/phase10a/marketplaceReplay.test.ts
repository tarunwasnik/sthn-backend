import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSuccessfulMarketplaceFlow,
  replaySuccessfulMarketplaceFlow,
  snapshotMarketplaceCounts,
} from "./fixtures/marketplaceFixtures";

export const registerMarketplaceReplayTests = () => {
  test("phase10a sequential replay creates zero duplicate effects", async () => {
    const flow = await createSuccessfulMarketplaceFlow();
    try {
      const before = await snapshotMarketplaceCounts();
      const replay = await replaySuccessfulMarketplaceFlow(flow);
      assert.deepEqual(await snapshotMarketplaceCounts(), before);
      assert.equal(replay.capture.body.replay, true);
      assert.equal(replay.allocation.replay, true);
      assert.equal(replay.settlement.replay, true);
      assert.equal(replay.withdrawal.replay, true);
      assert.equal(replay.initialized.replay, true);
      assert.equal(replay.executed.replay, true);
      assert.equal(replay.finalized.replay, true);
      assert.equal(replay.reconciliation.classification, "HEALTHY_COMPLETED");
    } finally { await flow.server.close(); }
  });
};
