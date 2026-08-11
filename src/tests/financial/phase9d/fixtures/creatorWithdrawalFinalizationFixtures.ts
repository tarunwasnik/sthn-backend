import { AuditAction } from "../../../../enums/financial/auditAction.enum";
import { WithdrawalProviderExecutionOutcome } from
  "../../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { AuditLog } from "../../../../models/auditLog.model";
import { LedgerEntry } from "../../../../models/ledgerEntry.model";
import { Wallet } from "../../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../../models/walletProjectionOperation.model";
import { withdrawalProviderExecutionService } from
  "../../../../services/financial/withdrawalProviderExecution.service";
import {
  createInitializedWithdrawalProviderFixture,
  startCreatorWithdrawalHttpServer,
} from "../../phase9c/fixtures/withdrawalProviderExecutionFixtures";

export { startCreatorWithdrawalHttpServer };

export const createTerminalWithdrawalFixture = async (
  baseUrl: string,
  outcome: WithdrawalProviderExecutionOutcome,
) => {
  const fixture = await createInitializedWithdrawalProviderFixture(baseUrl);
  const provider = await withdrawalProviderExecutionService.execute({
    withdrawalReference: fixture.withdrawal.withdrawalReference,
    outcome,
    ...(outcome === WithdrawalProviderExecutionOutcome.FAILURE
      ? {
        failureCode: "BANK_NETWORK_FAILURE",
        failureReason: "Provider rejected the withdrawal.",
      }
      : {}),
  });
  return { ...fixture, provider };
};

export const snapshotPhase9DFinancialState = async (walletId: unknown) => {
  const wallet = await Wallet.findById(walletId).orFail();
  return {
    wallet: {
      currentBalance: wallet.currentBalance,
      availableBalance: wallet.availableBalance,
      reservedBalance: wallet.reservedBalance,
      lockedBalance: wallet.lockedBalance,
      projectionVersion: wallet.projectionVersion,
    },
    ledgerCount: await LedgerEntry.countDocuments({
      source: "WITHDRAWAL_PROVIDER_FINALIZATION",
    }),
    projectionCount: await WalletProjectionOperation.countDocuments({
      operationKey: /^creator-withdrawal-finalization:/,
    }),
    auditCount: await AuditLog.countDocuments({
      action: {
        $in: [
          AuditAction.CREATOR_WITHDRAWAL_COMPLETED,
          AuditAction.CREATOR_WITHDRAWAL_FAILED,
        ],
      },
    }),
  };
};
