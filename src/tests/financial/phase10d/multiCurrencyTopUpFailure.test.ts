import assert from "node:assert/strict";
import { test } from "node:test";

import { InternalTopUpFundingOutcome } from
  "../../../enums/financial/internalTopUpFundingOutcome.enum";
import { InternalTopUpFundingFailureCode } from
  "../../../enums/financial/internalTopUpFundingFailureCode.enum";
import { WalletTopUpDecision } from
  "../../../enums/financial/walletTopUpDecision.enum";
import { WalletTopUpRejectionCode } from
  "../../../enums/financial/walletTopUpRejectionCode.enum";
import { InternalTopUpFunding } from
  "../../../models/internalTopUpFunding.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { adminWalletTopUpDecisionService } from
  "../../../services/financial/adminWalletTopUpDecision.service";
import { topUpFundingOrchestratorService } from
  "../../../services/financial/topUpFundingOrchestrator.service";
import { walletTopUpProviderFailureService } from
  "../../../services/financial/walletTopUpProviderFailure.service";
import {
  createMultiCurrencyActors,
  getWallet,
  reloadTopUp,
  requestTopUp,
} from "./fixtures/multiCurrencyTopUpFixtures";

export const registerFailureTests = () => {
  test("phase10d rejection: rejected USD request has no provider or Wallet effect", async () => {
    const actors = await createMultiCurrencyActors();
    const request = await requestTopUp(actors, "USD", 700);
    const rejected = await adminWalletTopUpDecisionService.decide({
      adminUserId: actors.adminId.toString(),
      topUpReference: request.topUpReference,
      decision: WalletTopUpDecision.REJECT,
      rejectionCode: WalletTopUpRejectionCode.ADMIN_DECLINED,
      rejectionReason: "Direct USD top-up declined",
    });
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.currency, "USD");
    assert.equal(rejected.amount, 700);
    assert.equal(await InternalTopUpFunding.countDocuments({}), 0);
    assert.equal(await LedgerEntry.countDocuments({}), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
    assert.deepEqual([
      (await getWallet(actors.userId, "USD")).availableBalance,
      (await getWallet(actors.userId, "INR")).availableBalance,
    ], [0, 0]);
  });

  test("phase10d provider failure: failed EUR funding finalizes with zero credit", async () => {
    const actors = await createMultiCurrencyActors();
    const request = await requestTopUp(actors, "EUR", 900);
    await adminWalletTopUpDecisionService.decide({
      adminUserId: actors.adminId.toString(),
      topUpReference: request.topUpReference,
      decision: WalletTopUpDecision.APPROVE,
    });
    const provider = await topUpFundingOrchestratorService.start({
      topUpReference: request.topUpReference,
      outcome: InternalTopUpFundingOutcome.FAILURE,
      failureCode: InternalTopUpFundingFailureCode.SIMULATED_DECLINE,
      failureReason: "Phase 10D EUR provider failure",
    });
    assert.equal(provider.currency, "EUR");
    assert.equal(provider.providerStatus, "FAILED");
    await walletTopUpProviderFailureService.finalize(
      request.topUpReference, actors.adminId.toString(),
    );
    assert.equal((await reloadTopUp(request.topUpReference)).status, "FAILED");
    assert.equal(await LedgerEntry.countDocuments({}), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
    assert.equal((await getWallet(actors.userId, "EUR")).availableBalance, 0);
    assert.equal((await getWallet(actors.userId, "INR")).availableBalance, 0);
  });
};
