import { SupportedCurrency } from "../../../../constants/financial/supportedCurrencies";
import { BookingEscrowAllocation } from "../../../../models/bookingEscrowAllocation.model";
import { Wallet } from "../../../../models/wallet.model";
import { bookingEscrowAllocationService } from "../../../../services/financial/bookingEscrowAllocation.service";
import { marketplacePricingService } from "../../../../services/financial/marketplacePricing.service";
import {
  createCapturedWalletBooking,
  startAllocationHttpServer,
} from "../../phase8d/fixtures/bookingEscrowAllocationFixtures";
import { Phase7HActors } from "../../phase7h/fixtures/topUpFixtures";

export const startSettlementHttpServer = startAllocationHttpServer;

export const createAllocatedCreatorSettlementFixture = async (
  baseUrl: string,
  options: {
    bookingAmount?: number;
    customerWalletAmount?: number;
    creatorWalletAmount?: number;
    creatorWalletCurrency?: SupportedCurrency;
    actors?: Phase7HActors;
  } = {},
) => {
  const bookingAmount = options.bookingAmount ?? 1_000;
  const totalAmount = marketplacePricingService.calculate({
    serviceAmount: bookingAmount,
    currency: "INR",
  }).totalAmount;
  const captured = await createCapturedWalletBooking(baseUrl, {
    walletAmount: options.customerWalletAmount ?? totalAmount,
    slotAmounts: [bookingAmount],
    actors: options.actors,
  });
  await bookingEscrowAllocationService.allocate(captured.booking._id.toString());
  const allocation = await BookingEscrowAllocation.findOne({
    bookingId: captured.booking._id,
  }).select(
    "+allocationKey +escrowLedgerTransaction +allocationLedgerTransaction " +
    "+allocationLedgerEntryIds +allocationFingerprint",
  ).orFail();
  const creatorWallet = await Wallet.findOneAndUpdate({
    userId: captured.fixture.actors.creatorId,
    currency: options.creatorWalletCurrency ?? "INR",
  }, {
    $setOnInsert: {
      userId: captured.fixture.actors.creatorId,
      currency: options.creatorWalletCurrency ?? "INR",
      currentBalance: options.creatorWalletAmount ?? 100,
      availableBalance: options.creatorWalletAmount ?? 100,
      reservedBalance: 0,
      lockedBalance: 0,
    },
  }, {
    upsert: true,
    new: true,
    runValidators: true,
  }).orFail();
  return { ...captured, allocation, creatorWallet };
};
