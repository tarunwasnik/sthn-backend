import { LedgerEntry } from "../../../../models/ledgerEntry.model";
import { Wallet } from "../../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../../models/walletProjectionOperation.model";
import { withdrawalProviderInitializationService } from
  "../../../../services/financial/withdrawalProviderInitialization.service";
import {
  createReservedWithdrawalProviderFixture,
  startCreatorWithdrawalHttpServer,
} from "../../phase9b/fixtures/withdrawalProviderInitializationFixtures";

export { startCreatorWithdrawalHttpServer };

export const createInitializedWithdrawalProviderFixture = async (
  baseUrl: string,
) => {
  const fixture = await createReservedWithdrawalProviderFixture(baseUrl);
  const provider = await withdrawalProviderInitializationService.initialize(
    fixture.withdrawal.withdrawalReference,
  );
  return { ...fixture, provider };
};

export const snapshotPhase9CFinancialState = async (walletId: unknown) => {
  const wallet = await Wallet.findById(walletId).orFail();
  return {
    wallet: {
      currentBalance: wallet.currentBalance,
      availableBalance: wallet.availableBalance,
      reservedBalance: wallet.reservedBalance,
      lockedBalance: wallet.lockedBalance,
      projectionVersion: wallet.projectionVersion,
    },
    ledgerCount: await LedgerEntry.countDocuments(),
    projectionCount: await WalletProjectionOperation.countDocuments(),
  };
};
