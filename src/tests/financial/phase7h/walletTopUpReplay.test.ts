import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { InternalTopUpFunding } from "../../../models/internalTopUpFunding.model";
import { startTestHttpServer } from "./helpers/http";
import {
  completeFundedTopUp,
  createActors,
  createFundedTopUp,
  reloadRequest,
} from "./fixtures/topUpFixtures";

export const registerReplayTests = () => {
  test("phase7h replay: service, reload, and Admin endpoint preserve one effect", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(actors, 725);
    const first = await completeFundedTopUp(request.topUpReference);
    const firstRequest = await reloadRequest(request.topUpReference);
    const firstWallet = await Wallet.findById(actors.wallet._id);
    assert.ok(firstWallet && firstRequest.completedAt);

    const immediate = await completeFundedTopUp(request.topUpReference);
    await reloadRequest(request.topUpReference);
    const reloaded = await completeFundedTopUp(request.topUpReference);

    process.env.JWT_SECRET = "phase7h-test-jwt-secret";
    const token = jwt.sign(
      { id: actors.adminId.toString(), role: "admin" },
      process.env.JWT_SECRET,
    );
    const server = await startTestHttpServer();
    try {
      const response = await fetch(
        `${server.baseUrl}/api/v1/admin/financial/wallet-top-up-requests/${request.topUpReference}/complete-accounting`,
        { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
      );
      assert.equal(response.status, 200);
      const body = await response.json() as { success: boolean; data: Record<string, unknown> };
      assert.equal(body.success, true);
      assert.equal("ledgerEntryId" in body.data, false);
      assert.equal("fingerprint" in body.data, false);
    } finally {
      await server.close();
    }

    const [ledgerCount, projectionCount, wallet, completed, provider] = await Promise.all([
      LedgerEntry.countDocuments({ "metadata.topUpReference": request.topUpReference }),
      WalletProjectionOperation.countDocuments({ operationReference: first.projectionOperationReference }),
      Wallet.findById(actors.wallet._id),
      reloadRequest(request.topUpReference),
      InternalTopUpFunding.findOne({ topUpReference: request.topUpReference }),
    ]);
    assert.equal(ledgerCount, 1);
    assert.equal(projectionCount, 1);
    assert.equal(wallet?.availableBalance, firstWallet.availableBalance);
    assert.equal(immediate.ledgerReference, first.ledgerReference);
    assert.equal(reloaded.projectionOperationReference, first.projectionOperationReference);
    assert.equal(completed.accountingTransactionId, firstRequest.accountingTransactionId);
    assert.equal(completed.completedAt?.getTime(), firstRequest.completedAt.getTime());
    assert.equal(provider?.status, "SUCCEEDED");
  });
};
