import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from "../../../models/creatorWithdrawalRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import {
  CreatorWithdrawalRequestService,
  CreatorWithdrawalReservationStage,
} from "../../../services/financial/creatorWithdrawalRequest.service";
import { clearPhase7HDatabase } from "../phase7h/helpers/database";
import {
  createEligibleCreatorWithdrawalFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalRequestFixtures";

export const registerWithdrawalFailureTests = () => {
  test("phase9a every injected reservation interruption rolls back completely", async () => {
    const stages: CreatorWithdrawalReservationStage[] = [
      "AFTER_AUTHORITY",
      "AFTER_LEDGER",
      "AFTER_PROJECTION",
      "BEFORE_RESERVED_TRANSITION",
      "BEFORE_AUDIT",
      "BEFORE_COMMIT",
    ];
    for (const stage of stages) {
      const server = await startCreatorWithdrawalHttpServer();
      try {
        const fixture =
          await createEligibleCreatorWithdrawalFixture(server.baseUrl);
        const walletBefore =
          await Wallet.findById(fixture.creatorWallet._id).orFail();
        const service = new CreatorWithdrawalRequestService((current) => {
          if (current === stage) throw new Error(`PHASE9A_${stage}`);
        });
        await assert.rejects(service.request(fixture.input));
        assert.equal(await CreatorWithdrawalRequest.countDocuments(), 0);
        assert.equal(await LedgerEntry.countDocuments({
          type: "CREATOR_WITHDRAWAL_RESERVED",
        }), 0);
        assert.equal(await WalletProjectionOperation.countDocuments({
          operationKey: { $regex: "^creator-withdrawal-reservation:CWR-" },
        }), 0);
        assert.equal(await AuditLog.countDocuments({
          action: AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
        }), 0);
        const walletAfter =
          await Wallet.findById(fixture.creatorWallet._id).orFail();
        assert.deepEqual([
          walletAfter.currentBalance,
          walletAfter.availableBalance,
          walletAfter.reservedBalance,
          walletAfter.lockedBalance,
          walletAfter.projectionVersion,
        ], [
          walletBefore.currentBalance,
          walletBefore.availableBalance,
          walletBefore.reservedBalance,
          walletBefore.lockedBalance,
          walletBefore.projectionVersion,
        ]);
      } finally {
        await server.close();
        await clearPhase7HDatabase();
      }
    }
  });
};
