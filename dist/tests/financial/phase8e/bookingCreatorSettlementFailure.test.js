"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const booking_model_1 = require("../../../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const bookingEscrowAllocation_model_1 = require("../../../models/bookingEscrowAllocation.model");
const dispute_model_1 = require("../../../models/dispute.model");
const userProfile_model_1 = require("../../../models/userProfile.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const bookingCreatorSettlement_repository_1 = require("../../../repositories/bookingCreatorSettlement.repository");
const bookingCreatorSettlement_service_1 = require("../../../services/financial/bookingCreatorSettlement.service");
const bookingEscrowAllocation_service_1 = require("../../../services/financial/bookingEscrowAllocation.service");
const walletProjection_service_1 = require("../../../services/wallet/walletProjection.service");
const bookingEscrowAllocationFixtures_1 = require("../phase8d/fixtures/bookingEscrowAllocationFixtures");
const bookingCreatorSettlementFixtures_1 = require("./fixtures/bookingCreatorSettlementFixtures");
const expectCode = async (operation, code) => {
    await strict_1.default.rejects(operation, (error) => {
        strict_1.default.equal(error?.code, code, String(error));
        return true;
    });
};
const assertNoSettlementEffect = async (fixture, before) => {
    strict_1.default.equal(await bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments({
        bookingId: fixture.booking._id,
    }), 0);
    strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
        bookingId: fixture.booking._id,
        source: ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
    }), 0);
    strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
        walletId: fixture.creatorWallet._id,
    }), 0);
    strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
        action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
    }), 0);
    const wallet = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
    strict_1.default.equal(wallet.currentBalance, before.balance);
    strict_1.default.equal(wallet.projectionVersion, before.version);
    strict_1.default.equal((await booking_model_1.Booking.findById(fixture.booking._id).orFail()).status, "COMPLETED");
    strict_1.default.equal((await bookingEscrowAllocation_model_1.BookingEscrowAllocation.findById(fixture.allocation._id).orFail()).status, "ALLOCATED");
};
const registerBookingCreatorSettlementFailureTests = () => {
    (0, node_test_1.test)("phase8e missing Creator currency Wallet is created through the User-owned Wallet authority", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString());
            await userProfile_model_1.UserProfile.create({
                userId: captured.fixture.actors.creatorId,
                username: `phase8e_creator_wallet_${captured.booking._id}`,
                dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
                interests: ["finance"],
                bio: "Phase 8E Creator Wallet creation test",
                avatar: "https://test.local/avatar",
                cover: "https://test.local/cover",
                profilePhotos: ["https://test.local/1", "https://test.local/2"],
                profileStatus: "verified",
            });
            const result = await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(captured.booking._id.toString());
            strict_1.default.equal(result.replay, false);
            strict_1.default.equal(result.wallet.currency, "INR");
            strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({
                userId: captured.fixture.actors.creatorId,
                currency: "INR",
            }), 1);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e Creator Wallet currency buckets remain independent", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl, { creatorWalletCurrency: "USD" });
            await userProfile_model_1.UserProfile.create({
                userId: fixture.fixture.actors.creatorId,
                username: `phase8e_creator_currency_${fixture.booking._id}`,
                dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
                interests: ["finance"],
                bio: "Phase 8E multi-currency Creator Wallet test",
                avatar: "https://test.local/avatar",
                cover: "https://test.local/cover",
                profilePhotos: ["https://test.local/1", "https://test.local/2"],
                profileStatus: "verified",
            });
            const result = await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString());
            strict_1.default.equal(result.wallet.currency, "INR");
            strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({
                userId: fixture.fixture.actors.creatorId,
            }), 2);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e OPEN dispute blocks settlement with zero Phase 8E effect", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            const before = {
                balance: fixture.creatorWallet.currentBalance,
                version: fixture.creatorWallet.projectionVersion,
            };
            await dispute_model_1.Dispute.create({
                bookingId: fixture.booking._id,
                raisedBy: fixture.fixture.actors.userId,
                raisedByRole: "USER",
                reason: "Phase 8E settlement dispute guard",
                status: "OPEN",
                slaHours: 48,
                escalationLevel: "NONE",
                signals: [],
            });
            await expectCode(bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString()), "BOOKING_CREATOR_SETTLEMENT_DISPUTE_OPEN");
            await assertNoSettlementEffect(fixture, before);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e financial lock blocks settlement with zero Phase 8E effect", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            const before = {
                balance: fixture.creatorWallet.currentBalance,
                version: fixture.creatorWallet.projectionVersion,
            };
            await booking_model_1.Booking.updateOne({ _id: fixture.booking._id }, { $set: { isFinancialLocked: true } });
            await expectCode(bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString()), "BOOKING_CREATOR_SETTLEMENT_FINANCIAL_LOCKED");
            await assertNoSettlementEffect(fixture, before);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e projection failure rolls back PENDING record and both Ledger entries", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        const original = walletProjection_service_1.walletProjectionService.applyProjectionMutation.bind(walletProjection_service_1.walletProjectionService);
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            const before = {
                balance: fixture.creatorWallet.currentBalance,
                version: fixture.creatorWallet.projectionVersion,
            };
            walletProjection_service_1.walletProjectionService.applyProjectionMutation = async () => {
                throw new Error("controlled Phase 8E projection failure");
            };
            await expectCode(bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString()), "BOOKING_CREATOR_SETTLEMENT_PROJECTION_CONFLICT");
            await assertNoSettlementEffect(fixture, before);
        }
        finally {
            walletProjection_service_1.walletProjectionService.applyProjectionMutation = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e failure after projection rolls back Wallet, projection, Ledger, and authority", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        const original = bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.guardPendingToSettled.bind(bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository);
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            const before = {
                balance: fixture.creatorWallet.currentBalance,
                version: fixture.creatorWallet.projectionVersion,
            };
            bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.guardPendingToSettled =
                async () => null;
            await expectCode(bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString()), "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT");
            await assertNoSettlementEffect(fixture, before);
        }
        finally {
            bookingCreatorSettlement_repository_1.bookingCreatorSettlementRepository.guardPendingToSettled = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e audit failure before commit rolls back every Phase 8E effect", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        const auditModel = auditLog_model_1.AuditLog;
        const original = auditModel.create;
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            const before = {
                balance: fixture.creatorWallet.currentBalance,
                version: fixture.creatorWallet.projectionVersion,
            };
            auditModel.create = (async () => {
                throw new Error("controlled Phase 8E audit failure");
            });
            await expectCode(bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString()), "BOOKING_CREATOR_SETTLEMENT_TRANSACTION_CONFLICT");
            await assertNoSettlementEffect(fixture, before);
        }
        finally {
            auditModel.create = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e corrupted allocation amounts and Ledger graph fail closed", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const amountFixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            await bookingEscrowAllocation_model_1.BookingEscrowAllocation.collection.updateOne({ _id: amountFixture.allocation._id }, { $set: { commissionAmount: 201, creatorAmount: 799 } });
            await expectCode(bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(amountFixture.booking._id.toString()), "BOOKING_CREATOR_SETTLEMENT_COMMISSION_CONFLICT");
            strict_1.default.equal(await bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments(), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e corrupted allocation Ledger direction fails closed", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            await ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                bookingId: fixture.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
                account: ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE,
            }, {
                $set: { direction: "DEBIT" },
            });
            await expectCode(bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString()), "BOOKING_CREATOR_SETTLEMENT_LEDGER_CONFLICT");
            strict_1.default.equal(await bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments(), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e settled replay rejects corrupted projection deltas", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString());
            await walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({
                walletId: fixture.creatorWallet._id,
            }, {
                $set: { "deltas.availableBalance": 799 },
            });
            await expectCode(bookingCreatorSettlement_service_1.bookingCreatorSettlementService.validateReplay(fixture.booking._id.toString()), "BOOKING_CREATOR_SETTLEMENT_PROJECTION_CONFLICT");
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingCreatorSettlementFailureTests = registerBookingCreatorSettlementFailureTests;
