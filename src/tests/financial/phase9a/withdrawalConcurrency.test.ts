import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from "../../../models/creatorWithdrawalRequest.model";
import { LedgerEntry } from "../../../models/ledgerEntry.model";
import { Wallet } from "../../../models/wallet.model";
import { WalletProjectionOperation } from "../../../models/walletProjectionOperation.model";
import { creatorWithdrawalRequestService } from "../../../services/financial/creatorWithdrawalRequest.service";
import {
  createEligibleCreatorWithdrawalFixture,
  startCreatorWithdrawalHttpServer,
} from "./fixtures/creatorWithdrawalRequestFixtures";

export const registerWithdrawalConcurrencyTests = () => {
  test("phase9a ten identical requests converge on one reservation winner", async () => {
    const server = await startCreatorWithdrawalHttpServer();
    try {
      const fixture =
        await createEligibleCreatorWithdrawalFixture(server.baseUrl);
      const walletBefore =
        await Wallet.findById(fixture.creatorWallet._id).orFail();
      const attempts = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          creatorWithdrawalRequestService.request(fixture.input)),
      );
      assert.ok(attempts.every((attempt) => attempt.status === "fulfilled"),
        attempts.map((attempt) => attempt.status === "fulfilled"
          ? "fulfilled" : String(attempt.reason)).join(" | "));
      const references = attempts.map((attempt) =>
        attempt.status === "fulfilled"
          ? attempt.value.withdrawalReference
          : "rejected");
      assert.equal(new Set(references).size, 1);
      assert.equal(await CreatorWithdrawalRequest.countDocuments(), 1);
      assert.equal(await LedgerEntry.countDocuments({
        type: "CREATOR_WITHDRAWAL_RESERVED",
      }), 2);
      assert.equal(await WalletProjectionOperation.countDocuments({
        operationKey: { $regex: "^creator-withdrawal-reservation:CWR-" },
      }), 1);
      assert.equal(await AuditLog.countDocuments({
        action: AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
      }), 1);
      const walletAfter =
        await Wallet.findById(fixture.creatorWallet._id).orFail();
      assert.equal(
        walletAfter.availableBalance,
        walletBefore.availableBalance - fixture.input.amount.amount,
      );
      assert.equal(
        walletAfter.reservedBalance,
        walletBefore.reservedBalance + fixture.input.amount.amount,
      );
    } finally {
      await server.close();
    }
  });
};
