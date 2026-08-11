"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaySuccessfulMarketplaceFlow = exports.createSuccessfulMarketplaceFlow = exports.snapshotMarketplaceCounts = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const withdrawalProviderExecutionOutcome_enum_1 = require("../../../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const auditLog_model_1 = require("../../../../models/auditLog.model");
const booking_model_1 = require("../../../../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../../../../models/bookingCreatorSettlement.model");
const bookingEscrowAllocation_model_1 = require("../../../../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../../../../models/bookingFundReservation.model");
const creatorWithdrawalReconciliation_model_1 = require("../../../../models/creatorWithdrawalReconciliation.model");
const creatorWithdrawalRepairOperation_model_1 = require("../../../../models/creatorWithdrawalRepairOperation.model");
const creatorWithdrawalRequest_model_1 = require("../../../../models/creatorWithdrawalRequest.model");
const creatorWithdrawalRetryAttempt_model_1 = require("../../../../models/creatorWithdrawalRetryAttempt.model");
const internalTopUpFunding_model_1 = require("../../../../models/internalTopUpFunding.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../../models/internalProvider/internalProviderEvent.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const ledgerEntry_model_1 = require("../../../../models/ledgerEntry.model");
const payment_model_1 = require("../../../../models/payment.model");
const payoutDestination_model_1 = require("../../../../models/payoutDestination.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../../models/walletProjectionOperation.model");
const walletTopUpRequest_model_1 = require("../../../../models/walletTopUpRequest.model");
const bookingCreatorSettlement_service_1 = require("../../../../services/financial/bookingCreatorSettlement.service");
const bookingEscrowAllocation_service_1 = require("../../../../services/financial/bookingEscrowAllocation.service");
const creatorWithdrawalFinalization_service_1 = require("../../../../services/financial/creatorWithdrawalFinalization.service");
const creatorWithdrawalReconciliation_service_1 = require("../../../../services/financial/creatorWithdrawalReconciliation.service");
const creatorWithdrawalRequest_service_1 = require("../../../../services/financial/creatorWithdrawalRequest.service");
const withdrawalProviderExecution_service_1 = require("../../../../services/financial/withdrawalProviderExecution.service");
const withdrawalProviderInitialization_service_1 = require("../../../../services/financial/withdrawalProviderInitialization.service");
const reference_util_1 = require("../../../../utils/financial/reference.util");
const topUpFixtures_1 = require("../../phase7h/fixtures/topUpFixtures");
const bookingWalletFixtures_1 = require("../../phase8a/fixtures/bookingWalletFixtures");
const bookingWalletReleaseFixtures_1 = require("../../phase8b/fixtures/bookingWalletReleaseFixtures");
const bookingWalletCaptureFixtures_1 = require("../../phase8c/fixtures/bookingWalletCaptureFixtures");
const creatorWithdrawalOperationalFixtures_1 = require("../../phase9e/fixtures/creatorWithdrawalOperationalFixtures");
let sequence = 0;
const walletState = async (walletId) => {
    const wallet = await wallet_model_1.Wallet.findById(walletId).orFail();
    return {
        available: wallet.availableBalance,
        reserved: wallet.reservedBalance,
        locked: wallet.lockedBalance,
        total: wallet.currentBalance,
        version: wallet.projectionVersion,
    };
};
const snapshotMarketplaceCounts = async () => ({
    topUps: await walletTopUpRequest_model_1.WalletTopUpRequest.countDocuments(),
    fundings: await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(),
    bookings: await booking_model_1.Booking.countDocuments(),
    payments: await payment_model_1.Payment.countDocuments(),
    reservations: await bookingFundReservation_model_1.BookingFundReservation.countDocuments(),
    allocations: await bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments(),
    settlements: await bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments(),
    withdrawals: await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments(),
    providers: await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.countDocuments(),
    providerEvents: await internalProviderEvent_model_1.default.countDocuments(),
    reconciliations: await creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.countDocuments(),
    retries: await creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt.countDocuments(),
    repairs: await creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.countDocuments(),
    ledger: await ledgerEntry_model_1.LedgerEntry.countDocuments(),
    projections: await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(),
    audits: await auditLog_model_1.AuditLog.countDocuments(),
});
exports.snapshotMarketplaceCounts = snapshotMarketplaceCounts;
const createSuccessfulMarketplaceFlow = async (options = {}) => {
    sequence += 1;
    const server = await (0, creatorWithdrawalOperationalFixtures_1.startCreatorWithdrawalHttpServer)();
    try {
        const actors = await (0, topUpFixtures_1.createActors)();
        const creatorWallet = await wallet_model_1.Wallet.create({
            userId: actors.creatorId,
            currency: "INR",
            currentBalance: 0,
            availableBalance: 0,
            reservedBalance: 0,
            lockedBalance: 0,
        });
        const walletTimeline = {
            customerBeforeTopUp: await walletState(actors.wallet._id),
            creatorBeforeSettlement: await walletState(creatorWallet._id),
        };
        const topUp = await (0, topUpFixtures_1.createFundedTopUp)(actors, options.customerTopUpAmount ?? 2000);
        const topUpAccounting = await (0, topUpFixtures_1.completeFundedTopUp)(topUp.request.topUpReference);
        walletTimeline.customerAfterTopUp = await walletState(actors.wallet._id);
        const bookingFixture = await (0, bookingWalletFixtures_1.createBookingWalletFixture)({
            actors,
            walletAmount: 0,
            slotAmounts: [1000],
        });
        const bookingIdempotencyKey = `phase10a-booking-${sequence}`;
        const requested = await (0, bookingWalletFixtures_1.postWalletBooking)(server.baseUrl, bookingFixture, bookingIdempotencyKey);
        if (requested.status !== 201)
            throw new Error(`Phase 10A booking request failed: ${JSON.stringify(requested.body)}`);
        let booking = await booking_model_1.Booking.findOne({
            bookingReference: requested.body.booking.bookingReference,
        }).orFail();
        let payment = await payment_model_1.Payment.findById(booking.paymentId)
            .select("+walletId +reservationId").orFail();
        let reservation = await bookingFundReservation_model_1.BookingFundReservation.findOne({
            bookingId: booking._id,
        }).orFail();
        const lifecycle = {
            booking: [booking.status],
            payment: [payment.status],
            reservation: [reservation.status],
            provider: ["CREATED"],
            withdrawal: ["PENDING"],
        };
        walletTimeline.customerAfterReservation = await walletState(actors.wallet._id);
        const creatorToken = jsonwebtoken_1.default.sign({ id: actors.creatorId.toString(), role: "creator" }, process.env.JWT_SECRET);
        const accepted = await (0, bookingWalletReleaseFixtures_1.postCreatorDecision)(server.baseUrl, booking._id.toString(), creatorToken, "ACCEPT");
        if (accepted.status !== 200)
            throw new Error(`Phase 10A Creator acceptance failed: ${JSON.stringify(accepted.body)}`);
        booking = await booking_model_1.Booking.findById(booking._id).orFail();
        lifecycle.booking.push(booking.status);
        await (0, bookingWalletCaptureFixtures_1.enableBookingCompletion)(actors.adminId.toString());
        const completed = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(server.baseUrl, booking._id.toString(), creatorToken);
        if (completed.status !== 200)
            throw new Error(`Phase 10A Booking completion failed: ${JSON.stringify(completed.body)}`);
        booking = await booking_model_1.Booking.findById(booking._id).orFail();
        payment = await payment_model_1.Payment.findById(payment._id)
            .select("+walletId +reservationId").orFail();
        reservation = await bookingFundReservation_model_1.BookingFundReservation.findById(reservation._id).orFail();
        lifecycle.booking.push(booking.status);
        lifecycle.payment.push(payment.status);
        lifecycle.reservation.push(reservation.status);
        walletTimeline.customerAfterCapture = await walletState(actors.wallet._id);
        const allocationResult = await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(booking._id.toString());
        const allocation = await bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({
            bookingId: booking._id,
        }).orFail();
        const settlementResult = await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(booking._id.toString());
        const settlement = await bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({
            bookingId: booking._id,
        }).orFail();
        walletTimeline.creatorAfterSettlement = await walletState(creatorWallet._id);
        const destination = await payoutDestination_model_1.PayoutDestination.create({
            destinationReference: (0, reference_util_1.generateFinancialReference)("PAYOUT_DESTINATION"),
            creatorId: actors.creatorId,
            type: "BANK_ACCOUNT",
            verificationStatus: "VERIFIED",
            isActive: true,
            idempotencyKey: `phase10a-destination-${sequence}`,
            destinationFingerprint: `phase10a-destination-fingerprint-${sequence}`,
            requestFingerprint: `phase10a-destination-request-${sequence}`,
            encryptedPayload: { version: 1, ciphertext: "phase10a-fixture",
                iv: "phase10a-fixture", authTag: "phase10a-fixture" },
            maskedIdentifier: "••••8000",
            accountNumberLast4: "8000",
            ifscDisplay: "TEST0123456",
            verifiedAt: new Date(),
        });
        const withdrawalInput = {
            authenticatedUserId: actors.creatorId.toString(),
            amount: { amount: 800, currency: "INR" },
            destinationReference: destination.destinationReference,
            idempotencyKey: `phase10a-withdrawal-${sequence}`,
        };
        const withdrawalRequested = await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(withdrawalInput);
        lifecycle.withdrawal.push(withdrawalRequested.status);
        walletTimeline.creatorAfterWithdrawalReservation = await walletState(creatorWallet._id);
        const providerInitialized = await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService
            .initialize(withdrawalRequested.withdrawalReference);
        lifecycle.provider.push(providerInitialized.providerStatus);
        const providerExecuted = await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.execute({
            withdrawalReference: withdrawalRequested.withdrawalReference,
            outcome: withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS,
        });
        lifecycle.provider.push("PROCESSING", providerExecuted.providerStatus);
        const withdrawalFinalized = await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService
            .finalize(withdrawalRequested.withdrawalReference);
        lifecycle.withdrawal.push(withdrawalFinalized.status);
        walletTimeline.creatorAfterWithdrawal = await walletState(creatorWallet._id);
        const reconciliation = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(withdrawalRequested.withdrawalReference, actors.adminId.toString());
        return {
            server,
            actors,
            creatorWallet,
            topUp,
            topUpAccounting,
            bookingFixture,
            bookingIdempotencyKey,
            creatorToken,
            booking,
            payment,
            reservation,
            allocation,
            allocationResult,
            settlement,
            settlementResult,
            destination,
            withdrawalInput,
            withdrawalReference: withdrawalRequested.withdrawalReference,
            providerInitialized,
            providerExecuted,
            withdrawalFinalized,
            reconciliation,
            lifecycle,
            walletTimeline,
        };
    }
    catch (error) {
        await server.close();
        throw error;
    }
};
exports.createSuccessfulMarketplaceFlow = createSuccessfulMarketplaceFlow;
const replaySuccessfulMarketplaceFlow = async (flow) => {
    const topUp = await (0, topUpFixtures_1.completeFundedTopUp)(flow.topUp.request.topUpReference);
    const capture = await (0, bookingWalletCaptureFixtures_1.postCreatorCompletion)(flow.server.baseUrl, flow.booking._id.toString(), flow.creatorToken);
    if (capture.status !== 200)
        throw new Error(`Phase 10A capture replay failed: ${JSON.stringify(capture.body)}`);
    const allocation = await bookingEscrowAllocation_service_1.bookingEscrowAllocationService.allocate(flow.booking._id.toString());
    const settlement = await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(flow.booking._id.toString());
    const withdrawal = await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(flow.withdrawalInput);
    const initialized = await withdrawalProviderInitialization_service_1.withdrawalProviderInitializationService.initialize(flow.withdrawalReference);
    const executed = await withdrawalProviderExecution_service_1.withdrawalProviderExecutionService.execute({
        withdrawalReference: flow.withdrawalReference,
        outcome: withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS,
    });
    const finalized = await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(flow.withdrawalReference);
    const reconciliation = await creatorWithdrawalReconciliation_service_1.creatorWithdrawalReconciliationService.inspect(flow.withdrawalReference, flow.actors.adminId.toString());
    return { topUp, capture, allocation, settlement, withdrawal, initialized,
        executed, finalized, reconciliation };
};
exports.replaySuccessfulMarketplaceFlow = replaySuccessfulMarketplaceFlow;
