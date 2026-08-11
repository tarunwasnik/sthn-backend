import assert from "node:assert/strict";
import { test } from "node:test";

import { WithdrawalProviderExecutionOutcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import {
  CreatorWithdrawalFinalizationService,
  creatorWithdrawalFinalizationService,
} from "../../../services/financial/creatorWithdrawalFinalization.service";
import {
  createTerminalWithdrawalFixture,
  snapshotPhase9DFinancialState,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalFinalizationFixtures";

export const registerWithdrawalReplayTests = () => {
  for (const outcome of [
    WithdrawalProviderExecutionOutcome.SUCCESS,
    WithdrawalProviderExecutionOutcome.FAILURE,
  ]) {
    test(`phase9d ${outcome.toLowerCase()} replay is authoritative and read-only`, async () => {
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createTerminalWithdrawalFixture(
          server.baseUrl,
          outcome,
        );
        const first = await creatorWithdrawalFinalizationService.finalize(
          fixture.withdrawal.withdrawalReference,
        );
        const before = await snapshotPhase9DFinancialState(
          fixture.creatorWallet._id,
        );
        const second = await new CreatorWithdrawalFinalizationService()
          .finalize(fixture.withdrawal.withdrawalReference);
        const validated = await creatorWithdrawalFinalizationService
          .validateReplay(fixture.withdrawal.withdrawalReference);
        assert.equal(second.finalizationReference,
          first.finalizationReference);
        assert.equal(second.replay, true);
        assert.equal(validated.replay, true);
        assert.deepEqual(await snapshotPhase9DFinancialState(
          fixture.creatorWallet._id,
        ), before);
      } finally {
        await server.close();
      }
    });
  }
};
