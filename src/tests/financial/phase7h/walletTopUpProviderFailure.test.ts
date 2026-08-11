import assert from "node:assert/strict";
import { test } from "node:test";
import { InternalTopUpFundingOutcome } from "../../../enums/financial/internalTopUpFundingOutcome.enum";
import { Wallet } from "../../../models/wallet.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { WalletTopUpOperationalAudit } from "../../../models/walletTopUpOperationalAudit.model";
import { walletTopUpProviderFailureService } from "../../../services/financial/walletTopUpProviderFailure.service";
import { walletTopUpReconciliationService } from "../../../services/financial/walletTopUpReconciliation.service";
import { walletTopUpRetryService } from "../../../services/financial/walletTopUpRetry.service";
import { WalletTopUpOperationalAction } from "../../../enums/financial/walletTopUpOperationalAction.enum";
import {
  createActors,
  createFundedTopUp,
  establishLedgerStage,
  establishProjectionStage,
  reloadRequest,
} from "./fixtures/topUpFixtures";

export const registerProviderFailureTests = () => {
  test("phase7h provider failure: guarded finalization is idempotent and effect-free", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(
      actors, 800, InternalTopUpFundingOutcome.FAILURE,
    );
    const first = await walletTopUpProviderFailureService.finalize(
      request.topUpReference, actors.adminId.toString(),
    );
    const finalized = await reloadRequest(request.topUpReference);
    const finalizedAt = finalized.failureFinalizedAt?.getTime();
    const replay = await walletTopUpProviderFailureService.finalize(
      request.topUpReference, actors.adminId.toString(),
    );
    const afterReplay = await reloadRequest(request.topUpReference);
    assert.equal(finalized.status, "FAILED");
    assert.ok(finalized.failureCode);
    assert.ok(finalized.failureFinalizedBy?.equals(actors.adminId));
    assert.equal(afterReplay.failureFinalizedAt?.getTime(), finalizedAt);
    assert.equal(first.topUpReference, replay.topUpReference);
    assert.equal(await LedgerEntry.countDocuments({}), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
    assert.equal((await Wallet.findById(actors.wallet._id))?.availableBalance, 0);
    assert.equal(await WalletTopUpOperationalAudit.countDocuments({
      topUpReference: request.topUpReference,
      action: WalletTopUpOperationalAction.FINALIZE_PROVIDER_FAILURE,
      result: "SUCCEEDED",
    }), 1);
  });

  test("phase7h provider failure: 10 concurrent finalizers converge to one timestamp", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(
      actors, 810, InternalTopUpFundingOutcome.FAILURE,
    );
    const settled = await Promise.allSettled(Array.from({ length: 10 }, () =>
      walletTopUpProviderFailureService.finalize(
        request.topUpReference, actors.adminId.toString(),
      )));
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 10);
    const failed = await reloadRequest(request.topUpReference);
    assert.equal(failed.status, "FAILED");
    assert.ok(failed.failureFinalizedAt);
    assert.equal(await LedgerEntry.countDocuments({}), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
    assert.equal((await Wallet.findById(actors.wallet._id))?.availableBalance, 0);
  });

  test("phase7h provider failure: existing Ledger or projection rejects finalization", async () => {
    const actors = await createActors();
    const ledgerCase = await createFundedTopUp(
      actors, 200, InternalTopUpFundingOutcome.FAILURE,
    );
    await establishLedgerStage(ledgerCase.request, ledgerCase.funding);
    await assert.rejects(() => walletTopUpProviderFailureService.finalize(
      ledgerCase.request.topUpReference, actors.adminId.toString(),
    ));
    assert.equal((await reloadRequest(ledgerCase.request.topUpReference)).status, "PROCESSING");

    const projectionCase = await createFundedTopUp(
      actors, 250, InternalTopUpFundingOutcome.FAILURE,
    );
    await establishProjectionStage(projectionCase.request, projectionCase.funding);
    await assert.rejects(() => walletTopUpProviderFailureService.finalize(
      projectionCase.request.topUpReference, actors.adminId.toString(),
    ));
    assert.equal((await reloadRequest(projectionCase.request.topUpReference)).status, "PROCESSING");
  });

  test("phase7h retry/failure race: terminal failure produces no new accounting effect", async () => {
    const actors = await createActors();
    const { request } = await createFundedTopUp(
      actors, 975, InternalTopUpFundingOutcome.FAILURE,
    );
    const reconciliation = await walletTopUpReconciliationService.inspectForOperation(
      request.topUpReference,
    );
    const settled = await Promise.allSettled([
      walletTopUpRetryService.retry(
        reconciliation.reconciliation.reconciliationReference,
        WalletTopUpOperationalAction.RETRY_ACCOUNTING,
        actors.adminId.toString(),
      ),
      walletTopUpProviderFailureService.finalize(
        request.topUpReference, actors.adminId.toString(),
      ),
    ]);
    assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal((await reloadRequest(request.topUpReference)).status, "FAILED");
    assert.equal(await LedgerEntry.countDocuments({}), 0);
    assert.equal(await WalletProjectionOperation.countDocuments({}), 0);
    assert.equal((await Wallet.findById(actors.wallet._id))?.availableBalance, 0);
  });
};
