import { Types } from "mongoose";

import { ExchangeRateSnapshot } from
  "../../../../models/exchangeRateSnapshot.model";
import { InternalWalletConversionProviderRequest } from
  "../../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { LedgerEntry } from "../../../../models/ledgerEntry.model";
import { Wallet } from "../../../../models/wallet.model";
import { WalletConversionAudit } from
  "../../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../../models/walletConversionRequest.model";
import { WalletProjectionOperation } from
  "../../../../models/walletProjectionOperation.model";
import { WalletConversionReconciliationService,
  WalletConversionReconciliationStage } from
  "../../../../services/financial/walletConversionReconciliation.service";
import { account, createAccountingFixture } from
  "../../phase10i/fixtures/walletConversionAccountingFixtures";

export const OPERATIONAL_ADMIN = new Types.ObjectId();

export const createHealthyOperationalFixture = async (options?: {
  failureInjector?: (stage: WalletConversionReconciliationStage) =>
    void | Promise<void>;
}) => {
  const fixture = await createAccountingFixture();
  await account(fixture);
  const service = new WalletConversionReconciliationService({
    now: () => new Date("2026-08-05T10:00:00.000Z"),
    failureInjector: options?.failureInjector,
  });
  return { ...fixture, service, adminId: OPERATIONAL_ADMIN.toString(),
    conversionReference: fixture.created.conversionReference };
};

export const makeReplayRequired = async (conversionReference: string) => {
  await WalletConversionRequest.collection.updateOne({ conversionReference },
    { $set: { status: "APPROVED" } });
};

export const removeCompletionAudit = (conversionReference: string) =>
  WalletConversionAudit.deleteOne({ conversionReference,
    action: "WALLET_CONVERSION_COMPLETED" });

export const removeLedgerReference = (conversionReference: string) =>
  WalletConversionRequest.collection.updateOne({ conversionReference },
    { $unset: { accountingTransactionReference: "" } });

export const captureFinancialState = async (conversionReference: string) => ({
  wallets: await Wallet.find({}).sort({ _id: 1 }).lean(),
  ledger: await LedgerEntry.find({}).sort({ _id: 1 }).lean(),
  projections: await WalletProjectionOperation.find({}).sort({ _id: 1 })
    .select("+fingerprint").lean(),
  snapshots: await ExchangeRateSnapshot.find({}).sort({ _id: 1 })
    .select("+snapshotFingerprint +responseFingerprint").lean(),
  provider: await InternalWalletConversionProviderRequest.find({
    conversionReference,
  }).select("+providerFingerprint +executionFingerprint +userId " +
    "+sourceWalletId +targetWalletId +providerMetadata +execution +payloads")
    .lean(),
});
