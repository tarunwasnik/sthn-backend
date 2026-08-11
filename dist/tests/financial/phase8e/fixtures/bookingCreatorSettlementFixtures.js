"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAllocatedCreatorSettlementFixture = exports.startSettlementHttpServer = void 0;
const bookingEscrowAllocation_model_1 = require("../../../../models/bookingEscrowAllocation.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const bookingEscrowAllocation_service_1 = require("../../../../services/financial/bookingEscrowAllocation.service");
const marketplacePricing_service_1 = require("../../../../services/financial/marketplacePricing.service");
const bookingEscrowAllocationFixtures_1 = require("../../phase8d/fixtures/bookingEscrowAllocationFixtures");
exports.startSettlementHttpServer = bookingEscrowAllocationFixtures_1.startAllocationHttpServer;
const createAllocatedCreatorSettlementFixture = async (baseUrl, options = {}) => {
    const bookingAmount = options.bookingAmount ?? 1000;
    const totalAmount = marketplacePricing_service_1.marketplacePricingService.calculate({
        serviceAmount: bookingAmount,
        currency: "INR",
    }).totalAmount;
    const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(baseUrl, {
        walletAmount: options.customerWalletAmount ?? totalAmount,
        slotAmounts: [bookingAmount],
        actors: options.actors,
    });
    await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString());
    const allocation = await bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({
        bookingId: captured.booking._id,
    }).select("+allocationKey +escrowLedgerTransaction +allocationLedgerTransaction " +
        "+allocationLedgerEntryIds +allocationFingerprint").orFail();
    const creatorWallet = await wallet_model_1.Wallet.findOneAndUpdate({
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
exports.createAllocatedCreatorSettlementFixture = createAllocatedCreatorSettlementFixture;
