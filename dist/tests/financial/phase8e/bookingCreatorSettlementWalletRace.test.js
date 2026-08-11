"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementWalletRaceTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const userProfile_model_1 = require("../../../models/userProfile.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingCreatorSettlement_service_1 = require("../../../services/financial/bookingCreatorSettlement.service");
const walletProjection_service_1 = require("../../../services/wallet/walletProjection.service");
const topUpFixtures_1 = require("../phase7h/fixtures/topUpFixtures");
const bookingCreatorSettlementFixtures_1 = require("./fixtures/bookingCreatorSettlementFixtures");
const registerBookingCreatorSettlementWalletRaceTests = () => {
    (0, node_test_1.test)("phase8e settlement and outgoing reservation projection on one Wallet do not lose updates", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl, { creatorWalletAmount: 500 });
            const attempts = await Promise.allSettled([
                bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString()),
                walletProjection_service_1.walletProjectionService.applyProjectionMutation({
                    userId: fixture.fixture.actors.creatorId,
                    currency: "INR",
                    operationKey: `phase8e-outgoing-reservation:${fixture.booking._id}`,
                    deltas: { availableBalance: -600, reservedBalance: 600 },
                    minimums: { availableBalance: 600 },
                }),
            ]);
            strict_1.default.equal(attempts[0].status, "fulfilled");
            const wallet = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            if (attempts[1].status === "fulfilled") {
                strict_1.default.deepEqual([
                    wallet.availableBalance,
                    wallet.reservedBalance,
                    wallet.lockedBalance,
                    wallet.currentBalance,
                ], [700, 600, 0, 1300]);
            }
            else {
                strict_1.default.deepEqual([
                    wallet.availableBalance,
                    wallet.reservedBalance,
                    wallet.lockedBalance,
                    wallet.currentBalance,
                ], [1300, 0, 0, 1300]);
            }
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e settlement and actual top-up accounting on one Wallet remain independent", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl, { creatorWalletAmount: 100 });
            await userProfile_model_1.UserProfile.create({
                userId: fixture.fixture.actors.creatorId,
                username: `phase8e_creator_${fixture.booking._id}`,
                dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
                interests: ["finance"],
                bio: "Phase 8E verified Creator user",
                avatar: "https://test.local/avatar",
                cover: "https://test.local/cover",
                profilePhotos: ["https://test.local/1", "https://test.local/2"],
                profileStatus: "verified",
            });
            const topUpActors = {
                userId: fixture.fixture.actors.creatorId,
                creatorId: fixture.fixture.actors.creatorId,
                adminId: fixture.fixture.actors.adminId,
                wallet: fixture.creatorWallet,
            };
            const topUp = await (0, topUpFixtures_1.createFundedTopUp)(topUpActors, 300);
            const attempts = await Promise.allSettled([
                bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString()),
                (0, topUpFixtures_1.completeFundedTopUp)(topUp.request.topUpReference),
            ]);
            strict_1.default.ok(attempts.every((entry) => entry.status === "fulfilled"), attempts.map((entry) => entry.status === "fulfilled"
                ? "fulfilled"
                : String(entry.reason)).join(" | "));
            const wallet = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.deepEqual([
                wallet.availableBalance,
                wallet.reservedBalance,
                wallet.lockedBalance,
                wallet.currentBalance,
            ], [1200, 0, 0, 1200]);
            strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({
                topUpRequestId: topUp.request._id,
            }), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
            }), 2);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: ledgerSource_enum_1.LedgerSource.INTERNAL_TOP_UP_FUNDING,
                userId: fixture.fixture.actors.creatorId,
            }), 1);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                walletId: fixture.creatorWallet._id,
            }), 2);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingCreatorSettlementWalletRaceTests = registerBookingCreatorSettlementWalletRaceTests;
