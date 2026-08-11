import assert from "node:assert/strict";
import { test } from "node:test";

import { WithdrawalProviderExecutionOutcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import { creatorWithdrawalFinalizationService } from
  "../../../services/financial/creatorWithdrawalFinalization.service";
import {
  createTerminalWithdrawalFixture,
  snapshotPhase9DFinancialState,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalFinalizationFixtures";

export const registerWithdrawalConcurrencyTests = () => {
  test("phase9d ten-way success and failure concurrency converge", async () => {
    for (const outcome of [
      WithdrawalProviderExecutionOutcome.SUCCESS,
      WithdrawalProviderExecutionOutcome.FAILURE,
    ]) {
      await clearPhase7HDatabase();
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createTerminalWithdrawalFixture(
          server.baseUrl,
          outcome,
        );
        const attempts = await Promise.allSettled(
          Array.from({ length: 10 }, () =>
            creatorWithdrawalFinalizationService.finalize(
              fixture.withdrawal.withdrawalReference,
            )),
        );
        assert.ok(attempts.every((attempt) =>
          attempt.status === "fulfilled"), attempts.map((attempt) =>
          attempt.status === "fulfilled" ? "fulfilled" :
            String(attempt.reason)).join(" | "));
        const state = await snapshotPhase9DFinancialState(
          fixture.creatorWallet._id,
        );
        assert.equal(state.ledgerCount, 2);
        assert.equal(state.projectionCount, 1);
        assert.equal(state.auditCount, 1);
        const replays = await Promise.all(Array.from({ length: 10 }, () =>
          creatorWithdrawalFinalizationService.validateReplay(
            fixture.withdrawal.withdrawalReference,
          )));
        assert.ok(replays.every((result) => result.replay));
        assert.deepEqual(await snapshotPhase9DFinancialState(
          fixture.creatorWallet._id,
        ), state);
      } finally {
        await server.close();
      }
    }
  });
};
