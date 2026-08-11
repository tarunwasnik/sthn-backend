import assert from "node:assert/strict";
import { test } from "node:test";

import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { InternalTopUpFunding } from
  "../../../models/internalTopUpFunding.model";
import InternalProviderEvent from
  "../../../models/internalProvider/internalProviderEvent.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../models/walletProjectionOperation.model";
import { WalletTopUpRequest } from
  "../../../models/walletTopUpRequest.model";
import { WalletTopUpRequestError } from
  "../../../errors/financial/WalletTopUpRequestError";
import { adminWalletTopUpDecisionService } from
  "../../../services/financial/adminWalletTopUpDecision.service";
import { topUpAccountingOrchestratorService } from
  "../../../services/financial/topUpAccountingOrchestrator.service";
import { topUpFundingOrchestratorService } from
  "../../../services/financial/topUpFundingOrchestrator.service";
import { walletTopUpRequestService } from
  "../../../services/financial/walletTopUpRequest.service";
import { walletCreationService } from
  "../../../services/wallet/walletCreation.service";
import { InternalTopUpFundingOutcome } from
  "../../../enums/financial/internalTopUpFundingOutcome.enum";
import { WalletTopUpDecision } from
  "../../../enums/financial/walletTopUpDecision.enum";
import {
  createMultiCurrencyActors,
  requestTopUp,
} from "./fixtures/multiCurrencyTopUpFixtures";

export const registerReplayTests = () => {
  test("phase10d replay: Wallet and cross-currency key replay are currency-bound", async () => {
    const actors = await createMultiCurrencyActors();
    const wallets = await Promise.all([
      walletCreationService.createWallet(actors.userId, "USD"),
      walletCreationService.createWallet(actors.userId, "USD"),
    ]);
    assert.equal(wallets[0]._id.toString(), wallets[1]._id.toString());

    const key = "phase10d-cross-currency-key";
    const first = await requestTopUp(actors, "USD", 100, key);
    const replay = await requestTopUp(actors, "USD", 100, key);
    assert.equal(replay.topUpReference, first.topUpReference);
    await assert.rejects(
      () => requestTopUp(actors, "EUR", 100, key),
      (error: unknown) => error instanceof WalletTopUpRequestError &&
        error.code === "WALLET_TOP_UP_REQUEST_IDEMPOTENCY_CONFLICT",
    );
    assert.equal(await Wallet.countDocuments({
      userId: actors.userId, currency: "EUR",
    }), 0, "Conflicting replay must not create another currency Wallet.");
  });

  test("phase10d replay: approval, provider, accounting, completion, and service reload preserve one effect", async () => {
    const actors = await createMultiCurrencyActors();
    const request = await requestTopUp(actors, "USD", 2_500);
    const approval = {
      adminUserId: actors.adminId.toString(),
      topUpReference: request.topUpReference,
      decision: WalletTopUpDecision.APPROVE,
    };
    const firstApproval = await adminWalletTopUpDecisionService.decide(approval);
    const replayApproval = await new (adminWalletTopUpDecisionService.constructor as any)()
      .decide(approval);
    assert.equal(firstApproval.decidedAt?.getTime(),
      replayApproval.decidedAt?.getTime());

    const fundingInput = {
      topUpReference: request.topUpReference,
      outcome: InternalTopUpFundingOutcome.SUCCESS,
    };
    const firstFunding = await topUpFundingOrchestratorService.start(fundingInput);
    const replayFunding = await new (topUpFundingOrchestratorService.constructor as any)()
      .start(fundingInput);
    assert.equal(firstFunding.providerFundingReference,
      replayFunding.providerFundingReference);

    const firstAccounting = await topUpAccountingOrchestratorService.complete(
      request.topUpReference,
    );
    const replayAccounting = await new (
      topUpAccountingOrchestratorService.constructor as any
    )().complete(request.topUpReference);
    assert.deepEqual({
      ledger: replayAccounting.ledgerReference,
      projection: replayAccounting.projectionOperationReference,
      transaction: replayAccounting.transactionId,
      completedAt: replayAccounting.completedAt.getTime(),
    }, {
      ledger: firstAccounting.ledgerReference,
      projection: firstAccounting.projectionOperationReference,
      transaction: firstAccounting.transactionId,
      completedAt: firstAccounting.completedAt.getTime(),
    });

    const [requests, fundings, events, ledgers, projections, wallet] =
      await Promise.all([
        WalletTopUpRequest.countDocuments({ topUpReference: request.topUpReference }),
        InternalTopUpFunding.countDocuments({ topUpReference: request.topUpReference }),
        InternalProviderEvent.countDocuments({
          providerEntityId: firstFunding.providerFundingReference,
        }),
        LedgerEntry.countDocuments({
          "metadata.topUpReference": request.topUpReference,
        }),
        WalletProjectionOperation.countDocuments({ userId: actors.userId }),
        Wallet.findOne({ userId: actors.userId, currency: "USD" }).orFail(),
      ]);
    assert.deepEqual([requests, fundings, events, ledgers, projections],
      [1, 1, 3, 1, 1]);
    assert.deepEqual([wallet.availableBalance, wallet.currentBalance],
      [2_500, 2_500]);
    assert.equal(await walletTopUpRequestService.getOwn(
      actors.userId.toString(), request.topUpReference,
    ).then((item) => item.status), "COMPLETED");
  });
};
