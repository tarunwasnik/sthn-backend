import assert from "node:assert/strict";
import { test } from "node:test";

import { createSuccessfulMarketplaceFlow } from
  "./fixtures/marketplaceFixtures";

export const registerMarketplaceSuccessfulFlowTests = () => {
  test("phase10a executes the complete successful marketplace lifecycle", async () => {
    const flow = await createSuccessfulMarketplaceFlow();
    try {
      assert.deepEqual(flow.walletTimeline.customerAfterTopUp,
        { available: 2_000, reserved: 0, locked: 0, total: 2_000,
          version: 1 });
      assert.deepEqual(flow.walletTimeline.customerAfterReservation,
        { available: 950, reserved: 1_050, locked: 0, total: 2_000,
          version: 2 });
      assert.deepEqual(flow.walletTimeline.customerAfterCapture,
        { available: 950, reserved: 0, locked: 0, total: 950,
          version: 3 });
      assert.deepEqual(flow.walletTimeline.creatorBeforeSettlement,
        { available: 0, reserved: 0, locked: 0, total: 0, version: 0 });
      assert.deepEqual(flow.walletTimeline.creatorAfterSettlement,
        { available: 800, reserved: 0, locked: 0, total: 800, version: 1 });
      assert.deepEqual(flow.walletTimeline.creatorAfterWithdrawalReservation,
        { available: 0, reserved: 800, locked: 0, total: 800, version: 2 });
      assert.deepEqual(flow.walletTimeline.creatorAfterWithdrawal,
        { available: 0, reserved: 0, locked: 0, total: 0, version: 3 });

      assert.deepEqual(flow.lifecycle.booking,
        ["REQUESTED", "CONFIRMED", "COMPLETED"]);
      assert.deepEqual(flow.lifecycle.payment, ["AUTHORIZED", "CAPTURED"]);
      assert.deepEqual(flow.lifecycle.reservation, ["ACTIVE", "CAPTURED"]);
      assert.deepEqual(flow.lifecycle.provider,
        ["CREATED", "INITIALIZED", "PROCESSING", "SUCCEEDED"]);
      assert.deepEqual(flow.lifecycle.withdrawal,
        ["PENDING", "RESERVED", "COMPLETED"]);
      assert.equal(flow.allocation.status, "ALLOCATED");
      assert.equal(flow.settlement.status, "SETTLED");
      assert.equal(flow.reconciliation.classification, "HEALTHY_COMPLETED");
      assert.equal(flow.reconciliation.severity, "INFO");
      assert.deepEqual(flow.reconciliation.issueCodes, []);
      assert.equal(flow.reconciliation.retryCount, 0);
    } finally { await flow.server.close(); }
  });
};
