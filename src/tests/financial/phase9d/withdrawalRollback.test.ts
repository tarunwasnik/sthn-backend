import assert from "node:assert/strict";
import { test } from "node:test";

import { WithdrawalProviderExecutionOutcome } from
  "../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { CreatorWithdrawalRequest } from
  "../../../models/creatorWithdrawalRequest.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import {
  CreatorWithdrawalFinalizationService,
  CreatorWithdrawalFinalizationStage,
} from "../../../services/financial/creatorWithdrawalFinalization.service";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import {
  createTerminalWithdrawalFixture,
  snapshotPhase9DFinancialState,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalFinalizationFixtures";

export const registerWithdrawalRollbackTests = () => {
  test("phase9d every injected interruption fully rolls back finalization", async () => {
    const stages: CreatorWithdrawalFinalizationStage[] = [
      "AFTER_FINALIZATION_IDENTITY",
      "AFTER_FIRST_LEDGER_ENTRY",
      "AFTER_BOTH_LEDGER_ENTRIES",
      "DURING_WALLET_PROJECTION",
      "AFTER_WALLET_PROJECTION",
      "BEFORE_WITHDRAWAL_TERMINAL_GUARD",
      "BEFORE_AUDIT",
      "BEFORE_COMMIT",
    ];
    for (const stage of stages) {
      await clearPhase7HDatabase();
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture = await createTerminalWithdrawalFixture(
          server.baseUrl,
          WithdrawalProviderExecutionOutcome.SUCCESS,
        );
        const before = await snapshotPhase9DFinancialState(
          fixture.creatorWallet._id,
        );
        const service = new CreatorWithdrawalFinalizationService((current) => {
          if (current === stage) throw new Error(`PHASE9D_${stage}`);
        });
        await assert.rejects(service.finalize(
          fixture.withdrawal.withdrawalReference,
        ));
        const withdrawal = await CreatorWithdrawalRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).select("+finalizationKey +finalizationLedgerEntryIds").orFail();
        assert.equal(withdrawal.status, "RESERVED");
        assert.equal(withdrawal.reservedAmount, withdrawal.amount);
        assert.equal(withdrawal.finalizationReference, undefined);
        assert.equal(withdrawal.finalizationKey, undefined);
        assert.equal(withdrawal.finalizationLedgerEntryIds.length, 0);
        const provider = await InternalWithdrawalProviderRequest.findOne({
          withdrawalReference: fixture.withdrawal.withdrawalReference,
        }).orFail();
        assert.equal(provider.providerStatus, "SUCCEEDED");
        assert.equal(provider.version, 3);
        assert.deepEqual(await snapshotPhase9DFinancialState(
          fixture.creatorWallet._id,
        ), before);
      } finally {
        await server.close();
      }
    }
  });
};
