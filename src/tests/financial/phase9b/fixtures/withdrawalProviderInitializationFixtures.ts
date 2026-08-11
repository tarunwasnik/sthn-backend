import { LedgerEntry } from "../../../../models/ledgerEntry.model";
import { Wallet } from "../../../../models/wallet.model";
import { creatorWithdrawalRequestService } from
  "../../../../services/financial/creatorWithdrawalRequest.service";
import {
  createEligibleCreatorWithdrawalFixture,
  startCreatorWithdrawalHttpServer,
} from "../../phase9a/fixtures/creatorWithdrawalRequestFixtures";

export { startCreatorWithdrawalHttpServer };

export const createReservedWithdrawalProviderFixture = async (
  baseUrl: string,
) => {
  const fixture = await createEligibleCreatorWithdrawalFixture(baseUrl);
  const withdrawal =
    await creatorWithdrawalRequestService.request(fixture.input);
  return { ...fixture, withdrawal };
};

export const snapshotFinancialState = async (walletId: unknown) => {
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
  };
};
