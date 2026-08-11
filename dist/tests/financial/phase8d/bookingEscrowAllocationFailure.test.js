"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingEscrowAllocationFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditLog_model_1 = require("../../../models/auditLog.model");
const booking_model_1 = require("../../../models/booking.model");
const bookingEscrowAllocation_model_1 = require("../../../models/bookingEscrowAllocation.model");
const dispute_model_1 = require("../../../models/dispute.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const bookingEscrowAllocation_repository_1 = require("../../../repositories/bookingEscrowAllocation.repository");
const bookingEscrowAllocation_service_1 = require("../../../services/financial/bookingEscrowAllocation.service");
const ledger_service_1 = require("../../../services/financial/ledger.service");
const bookingEscrowAllocationFixtures_1 = require("./fixtures/bookingEscrowAllocationFixtures");
const expectCode = async (operation, code) => {
    await strict_1.default.rejects(operation, (error) => {
        strict_1.default.equal(error?.code, code, String(error));
        return true;
    });
};
const assertNoAllocation = async (bookingId, walletId, walletVersion, currentBalance, projectionCount) => {
    strict_1.default.equal(await bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments({ bookingId }), 0);
    strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
        bookingId,
        source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
    }), 0);
    strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(), projectionCount);
    const wallet = await wallet_model_1.Wallet.findById(walletId).orFail();
    strict_1.default.equal(wallet.currentBalance, currentBalance);
    strict_1.default.equal(wallet.projectionVersion, walletVersion);
    strict_1.default.equal((await booking_model_1.Booking.findById(bookingId).orFail()).status, "COMPLETED");
};
const registerBookingEscrowAllocationFailureTests = () => {
    (0, node_test_1.test)("phase8d OPEN dispute blocks allocation with zero accounting effects", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            const wallet = await wallet_model_1.Wallet.findById(captured.fixture.actors.wallet._id).orFail();
            const projections = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments();
            await dispute_model_1.Dispute.create({
                bookingId: captured.booking._id,
                raisedBy: captured.fixture.actors.userId,
                raisedByRole: "USER",
                reason: "Phase 8D allocation dispute guard",
                status: "OPEN",
                slaHours: 48,
                escalationLevel: "NONE",
                signals: [],
            });
            await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString()), "BOOKING_ESCROW_ALLOCATION_DISPUTE_OPEN");
            await assertNoAllocation(captured.booking._id.toString(), wallet._id.toString(), wallet.projectionVersion, wallet.currentBalance, projections);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8d financial lock blocks allocation with zero accounting effects", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            const wallet = await wallet_model_1.Wallet.findById(captured.fixture.actors.wallet._id).orFail();
            const projections = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments();
            await booking_model_1.Booking.updateOne({ _id: captured.booking._id }, { $set: { isFinancialLocked: true } });
            await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString()), "BOOKING_ESCROW_ALLOCATION_FINANCIAL_LOCKED");
            await assertNoAllocation(captured.booking._id.toString(), wallet._id.toString(), wallet.projectionVersion, wallet.currentBalance, projections);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8d existing settlement link blocks allocation", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            await booking_model_1.Booking.collection.updateOne({ _id: captured.booking._id }, { $set: { settlementId: captured.fixture.actors.adminId } });
            await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString()), "BOOKING_ESCROW_ALLOCATION_STATUS_CONFLICT");
            strict_1.default.equal(await bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments(), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
            }), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8d Ledger failure after escrow debit attempt rolls back record and all postings", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        const original = ledger_service_1.ledgerService.createCredit.bind(ledger_service_1.ledgerService);
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            const wallet = await wallet_model_1.Wallet.findById(captured.fixture.actors.wallet._id).orFail();
            const projections = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments();
            ledger_service_1.ledgerService.createCredit = async () => {
                throw new Error("controlled Phase 8D Ledger failure");
            };
            await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString()), "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT");
            await assertNoAllocation(captured.booking._id.toString(), wallet._id.toString(), wallet.projectionVersion, wallet.currentBalance, projections);
        }
        finally {
            ledger_service_1.ledgerService.createCredit = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8d failure after all Ledger postings rolls back PENDING record and transaction", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        const original = bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository.guardPendingToAllocated.bind(bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository);
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            const wallet = await wallet_model_1.Wallet.findById(captured.fixture.actors.wallet._id).orFail();
            const projections = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments();
            bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository.guardPendingToAllocated =
                async () => null;
            await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString()), "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT");
            await assertNoAllocation(captured.booking._id.toString(), wallet._id.toString(), wallet.projectionVersion, wallet.currentBalance, projections);
        }
        finally {
            bookingEscrowAllocation_repository_1.bookingEscrowAllocationRepository.guardPendingToAllocated = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8d audit failure before commit rolls back allocation and Ledger", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        const auditModel = auditLog_model_1.AuditLog;
        const original = auditModel.create;
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            const wallet = await wallet_model_1.Wallet.findById(captured.fixture.actors.wallet._id).orFail();
            const projections = await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments();
            auditModel.create = (async () => {
                throw new Error("controlled Phase 8D audit failure");
            });
            await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString()), "BOOKING_ESCROW_ALLOCATION_TRANSACTION_CONFLICT");
            await assertNoAllocation(captured.booking._id.toString(), wallet._id.toString(), wallet.projectionVersion, wallet.currentBalance, projections);
        }
        finally {
            auditModel.create = original;
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8d corrupted capture Ledger blocks allocation", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            await ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                bookingId: captured.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_WALLET_CAPTURE,
                account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW,
            }, {
                $set: { account: ledgerAccount_enum_1.LedgerAccount.CREATOR_PAYABLE },
            });
            await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString()), "BOOKING_ESCROW_ALLOCATION_INTEGRITY_ERROR");
            strict_1.default.equal(await bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments(), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
            }), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8d corrupted allocation amounts fail authoritative replay", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl, {
                walletAmount: 1050,
                slotAmounts: [1000],
            });
            await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString());
            await bookingEscrowAllocation_model_1.BookingEscrowAllocation.collection.updateOne({ bookingId: captured.booking._id }, { $set: { commissionAmount: 201, creatorAmount: 799 } });
            await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.validateReplay(captured.booking._id.toString()), "BOOKING_ESCROW_ALLOCATION_IDENTITY_CONFLICT");
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8d corrupted allocation Ledger direction fails authoritative replay", async () => {
        const server = await (0, bookingEscrowAllocationFixtures_1.startAllocationHttpServer)();
        try {
            const captured = await (0, bookingEscrowAllocationFixtures_1.createCapturedWalletBooking)(server.baseUrl);
            await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(captured.booking._id.toString());
            await ledgerEntry_model_1.LedgerEntry.collection.updateOne({
                bookingId: captured.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_ESCROW_ALLOCATION,
                account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW,
            }, {
                $set: { direction: "CREDIT" },
            });
            await expectCode(bookingEscrowAllocation_service_1.bookingEscrowAllocationService.validateReplay(captured.booking._id.toString()), "BOOKING_ESCROW_ALLOCATION_LEDGER_CONFLICT");
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingEscrowAllocationFailureTests = registerBookingEscrowAllocationFailureTests;
