"use strict";
// backend/src/controllers/booking.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refundBooking = exports.requestBooking = exports.checkCreatorJourneyEligibility = exports.getUserBookings = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const slot_model_1 = require("../models/slot.model");
const booking_model_1 = require("../models/booking.model");
const dispute_model_1 = require("../models/dispute.model");
const userProfile_model_1 = require("../models/userProfile.model");
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const creatorService_model_1 = require("../models/creatorService.model");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const payment_service_1 = require("../services/financial/payment.service");
const paymentLifecycle_service_1 = require("../services/financial/paymentLifecycle.service");
const marketplacePricing_service_1 = require("../services/financial/marketplacePricing.service");
const creatorServicePrice_util_1 = require("../utils/financial/creatorServicePrice.util");
const bookingFinancialTermination_service_1 = require("../services/financial/bookingFinancialTermination.service");
const bookingTerminationType_enum_1 = require("../enums/booking/bookingTerminationType.enum");
const User_1 = __importDefault(require("../models/User"));
const accountGovernanceResolver_service_1 = require("../services/accountGovernance/accountGovernanceResolver.service");
const paymentMethod_enum_1 = require("../enums/financial/paymentMethod.enum");
const paymentPricingPolicy_enum_1 = require("../enums/financial/paymentPricingPolicy.enum");
const paymentStatus_enum_1 = require("../enums/financial/paymentStatus.enum");
const bookingFundReservationStatus_enum_1 = require("../enums/financial/bookingFundReservationStatus.enum");
const BookingWalletReservationError_1 = require("../errors/financial/BookingWalletReservationError");
const bookingWalletReservation_service_1 = require("../services/financial/bookingWalletReservation.service");
const bookingFundReservation_repository_1 = require("../repositories/bookingFundReservation.repository");
const payment_model_1 = require("../models/payment.model");
const bookingWalletReservationIdentity_util_1 = require("../utils/financial/bookingWalletReservationIdentity.util");
/* =========================================================
   CLEANUP EXPIRED BOOKINGS
========================================================= */
const cleanupExpiredBookings = async (creatorId) => {
    const expiredBookings = await booking_model_1.Booking.find({
        creatorId,
        status: "REQUESTED",
        expiresAt: { $lt: new Date() },
    }).select("_id");
    for (const booking of expiredBookings) {
        await bookingFinancialTermination_service_1.bookingFinancialTerminationService.terminateBookingFinancially({
            bookingId: booking._id.toString(),
            actorType: bookingTerminationType_enum_1.BookingTerminationActorType.SYSTEM,
            terminationType: bookingTerminationType_enum_1.BookingTerminationType.BOOKING_EXPIRED,
            reason: "Booking request expired.",
        });
    }
};
/* =========================================================
   GET USER BOOKINGS
========================================================= */
const getUserBookings = async (req, res) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const bookings = await booking_model_1.Booking.find({ userId: user.id })
            .sort({ createdAt: -1 })
            .lean();
        const allSlotIds = bookings.flatMap((b) => b.slotIds);
        const slots = await slot_model_1.Slot.find({
            _id: { $in: allSlotIds },
        })
            .sort({ startTime: 1 })
            .lean();
        const slotMap = new Map(slots.map((slot) => [String(slot._id), slot]));
        const creatorIds = [...new Set(bookings.map((b) => String(b.creatorId)))];
        const creators = await creatorProfile_model_1.CreatorProfile.find({
            userId: { $in: creatorIds },
        }).lean();
        const creatorMap = new Map(creators.map((c) => [String(c.userId), c]));
        const serviceIds = [...new Set(bookings.map((b) => String(b.serviceId)))];
        const services = await creatorService_model_1.CreatorService.find({
            _id: { $in: serviceIds },
        }).lean();
        const serviceMap = new Map(services.map((s) => [String(s._id), s]));
        const formatted = bookings.map((booking) => {
            const bookingSlots = booking.slotIds
                .map((id) => slotMap.get(String(id)))
                .filter(Boolean)
                .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
            return {
                _id: booking._id,
                userId: booking.userId,
                creatorId: booking.creatorId,
                serviceId: booking.serviceId,
                status: booking.status,
                paymentStatus: booking.paymentStatus,
                price: booking.price,
                serviceAmount: booking.serviceAmount,
                platformFeeAmount: booking.platformFeeAmount,
                totalAmount: booking.totalAmount,
                commissionAmount: booking.commissionAmount,
                creatorAmount: booking.creatorAmount,
                currency: booking.currency,
                durationMinutes: booking.durationMinutes,
                expiresAt: booking.expiresAt,
                createdAt: booking.createdAt,
                completedAt: booking.completedAt,
                service: {
                    _id: booking.serviceId,
                    title: booking.serviceTitle,
                    // Null means this is a legacy booking; live service data below is
                    // not booking-time evidence.
                    snapshot: booking.serviceSnapshot ?? null,
                    data: serviceMap.get(String(booking.serviceId)) || null,
                },
                creator: {
                    _id: booking.creatorId,
                    profile: creatorMap.get(String(booking.creatorId)) || null,
                },
                slots: bookingSlots.map((slot) => ({
                    _id: slot._id,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    status: slot.status,
                    price: slot.price,
                })),
            };
        });
        return res.status(200).json({
            bookings: formatted,
        });
    }
    catch (err) {
        return res.status(500).json({
            message: err.message || "Failed to fetch bookings",
        });
    }
};
exports.getUserBookings = getUserBookings;
/* =========================================================
   CHECK CREATOR JOURNEY ELIGIBILITY
========================================================= */
const checkCreatorJourneyEligibility = async (req, res) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({
            message: "Unauthorized",
        });
    }
    try {
        const blockingBooking = await booking_model_1.Booking.findOne({
            userId: user.id,
            status: {
                $in: ["REQUESTED", "CONFIRMED"],
            },
        })
            .select("_id status serviceTitle createdAt")
            .lean();
        if (blockingBooking) {
            return res.status(200).json({
                eligible: false,
                message: "You can't begin your Creator Journey while you have active or upcoming bookings. Please complete or resolve your current bookings before applying as a creator.",
                blockingBooking: {
                    _id: blockingBooking._id,
                    status: blockingBooking.status,
                    serviceTitle: blockingBooking.serviceTitle,
                },
            });
        }
        return res.status(200).json({
            eligible: true,
            message: "You are eligible to begin your Creator Journey.",
            blockingBooking: null,
        });
    }
    catch (err) {
        return res.status(500).json({
            message: err.message || "Failed to check Creator Journey eligibility",
        });
    }
};
exports.checkCreatorJourneyEligibility = checkCreatorJourneyEligibility;
/* =========================================================
   REQUEST BOOKING
========================================================= */
const safeWalletBookingResponse = (booking, payment, reservation, slots) => ({
    message: "Booking request sent",
    booking: {
        bookingReference: booking.bookingReference,
        status: booking.status,
        paymentMethod: paymentMethod_enum_1.PaymentMethod.WALLET,
        paymentReference: payment.paymentReference,
        reservationReference: reservation.reservationReference,
        fundsReservedAt: reservation.authorizedAt,
        price: booking.price,
        serviceAmount: booking.serviceAmount,
        platformFeeAmount: booking.platformFeeAmount,
        totalAmount: booking.totalAmount,
        commissionAmount: booking.commissionAmount,
        creatorAmount: booking.creatorAmount,
        currency: booking.currency,
        durationMinutes: booking.durationMinutes,
        slots: slots.map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: slot.status,
        })),
    },
    payment: {
        paymentReference: payment.paymentReference,
        method: paymentMethod_enum_1.PaymentMethod.WALLET,
        status: paymentStatus_enum_1.PaymentStatus.AUTHORIZED,
        amount: payment.amount,
        serviceAmount: booking.serviceAmount,
        platformFeeAmount: booking.platformFeeAmount,
        totalAmount: booking.totalAmount,
        commissionAmount: booking.commissionAmount,
        creatorAmount: booking.creatorAmount,
        currency: payment.currency,
        authorizedAt: reservation.authorizedAt,
    },
    reservation: {
        reservationReference: reservation.reservationReference,
        status: reservation.status,
        amount: reservation.amount,
        currency: reservation.currency,
        authorizedAt: reservation.authorizedAt,
    },
});
const requestBooking = async (req, res) => {
    const user = req.user;
    const { serviceId, slotIds } = req.body;
    const requestedMethod = req.body.paymentMethod ?? paymentMethod_enum_1.PaymentMethod.INTERNAL;
    const paymentMethod = requestedMethod === paymentMethod_enum_1.PaymentMethod.WALLET
        ? paymentMethod_enum_1.PaymentMethod.WALLET
        : requestedMethod === paymentMethod_enum_1.PaymentMethod.INTERNAL
            ? paymentMethod_enum_1.PaymentMethod.INTERNAL
            : null;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    if (user.status !== "active") {
        return res.status(403).json({ message: "Account is not active." });
    }
    if (!paymentMethod) {
        return res.status(422).json({
            message: "paymentMethod must be WALLET or INTERNAL.",
        });
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(serviceId)) {
        return res.status(400).json({ message: "Invalid serviceId" });
    }
    if (!Array.isArray(slotIds) || slotIds.length === 0) {
        return res.status(400).json({ message: "slotIds are required" });
    }
    if (!slotIds.every((id) => mongoose_1.default.Types.ObjectId.isValid(id))) {
        return res.status(400).json({ message: "Invalid slotIds" });
    }
    const suppliedIdempotencyKey = typeof req.body.idempotencyKey === "string"
        ? req.body.idempotencyKey.trim()
        : typeof req.header("Idempotency-Key") === "string"
            ? req.header("Idempotency-Key").trim()
            : "";
    if (paymentMethod === paymentMethod_enum_1.PaymentMethod.WALLET) {
        if (!suppliedIdempotencyKey || suppliedIdempotencyKey.length > 200) {
            return res.status(422).json({
                message: "A bounded idempotencyKey is required for Wallet booking.",
            });
        }
        const clientFinancialFields = ["userId", "walletId", "amount", "currency"]
            .filter((field) => req.body[field] !== undefined);
        if (clientFinancialFields.length > 0) {
            return res.status(422).json({
                message: "Wallet owner, amount, and currency are server-authoritative.",
            });
        }
    }
    const requestIdentity = paymentMethod === paymentMethod_enum_1.PaymentMethod.WALLET
        ? (0, bookingWalletReservationIdentity_util_1.deriveBookingRequestIdentity)({
            userId: user.id,
            serviceId,
            slotIds,
            method: paymentMethod,
            idempotencyKey: suppliedIdempotencyKey,
        })
        : null;
    const loadWalletReplay = async () => {
        if (!requestIdentity)
            return null;
        const booking = await booking_model_1.Booking.findOne({
            userId: user.id,
            bookingRequestKey: requestIdentity.bookingRequestKey,
        }).select("+bookingRequestKey +bookingRequestFingerprint");
        if (!booking)
            return null;
        if (booking.bookingRequestFingerprint !== requestIdentity.bookingRequestFingerprint) {
            throw new BookingWalletReservationError_1.BookingWalletReservationError("Booking idempotency key conflicts with a different request.", "BOOKING_WALLET_RESERVATION_IDENTITY_CONFLICT");
        }
        const payment = booking.paymentId
            ? await payment_model_1.Payment.findById(booking.paymentId)
            : null;
        const reservation = await bookingFundReservation_repository_1.bookingFundReservationRepository.findByBooking(booking._id);
        const replaySlots = await slot_model_1.Slot.find({ _id: { $in: booking.slotIds } })
            .select("startTime endTime status")
            .sort({ startTime: 1 });
        if (!payment || !reservation || reservation.status !== bookingFundReservationStatus_enum_1.BookingFundReservationStatus.ACTIVE) {
            throw new BookingWalletReservationError_1.BookingWalletReservationError("Committed Wallet booking is missing its financial authorization.", "BOOKING_WALLET_RESERVATION_INTEGRITY_ERROR");
        }
        return safeWalletBookingResponse(booking, payment, reservation, replaySlots);
    };
    try {
        const replay = await loadWalletReplay();
        if (replay)
            return res.status(200).json(replay);
    }
    catch (error) {
        if (error instanceof BookingWalletReservationError_1.BookingWalletReservationError) {
            return res.status(error.statusCode).json({ message: error.message, code: error.code });
        }
        return res.status(500).json({ message: "Failed to validate booking replay." });
    }
    const profile = await userProfile_model_1.UserProfile.findOne({ userId: user.id });
    if (!profile) {
        return res.status(403).json({
            message: "You must complete your profile before booking.",
        });
    }
    if (profile.profileStatus !== "verified") {
        let message = "Profile verification required.";
        if (profile.profileStatus === "pending_verification") {
            message = "Your profile is under verification.";
        }
        if (profile.profileStatus === "rejected") {
            message = "Your profile was rejected. Please update and resubmit.";
        }
        return res.status(403).json({ message });
    }
    const serviceForExpiry = await creatorService_model_1.CreatorService.findById(serviceId)
        .select("creatorId")
        .lean();
    if (serviceForExpiry) {
        await cleanupExpiredBookings(new mongoose_1.default.Types.ObjectId(serviceForExpiry.creatorId));
    }
    const serviceForGovernance = await creatorService_model_1.CreatorService.findById(serviceId)
        .select("creatorId")
        .lean();
    if (!serviceForGovernance) {
        return res.status(404).json({ message: "Service not found" });
    }
    const requesterUser = await User_1.default.findById(user.id);
    if (!requesterUser) {
        return res.status(401).json({ message: "Authenticated user not found." });
    }
    const requesterGovernance = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(requesterUser);
    if (requesterGovernance.blocksOutgoingBookings) {
        return res.status(403).json({
            message: "Your account is currently restricted from creating new bookings.",
            ...(requesterGovernance.isCooldownActive && requesterGovernance.cooldownUntil
                ? { cooldownUntil: requesterGovernance.cooldownUntil }
                : {}),
        });
    }
    const targetCreatorUser = await User_1.default.findById(serviceForGovernance.creatorId);
    if (!targetCreatorUser) {
        return res.status(404).json({ message: "Creator account not found" });
    }
    const targetCreatorGovernance = (0, accountGovernanceResolver_service_1.resolveAccountGovernance)(targetCreatorUser);
    if (targetCreatorGovernance.blocksIncomingBookings) {
        return res.status(403).json({
            message: "This creator is currently unable to receive new booking requests.",
            ...(targetCreatorGovernance.isCreatorCooldownActive && targetCreatorGovernance.cooldownUntil
                ? { cooldownUntil: targetCreatorGovernance.cooldownUntil }
                : {}),
        });
    }
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const service = await creatorService_model_1.CreatorService.findById(serviceId).session(session);
        if (!service)
            throw new Error("Service not found");
        if (!service.isActive)
            throw new Error("Service is not active");
        const creatorId = service.creatorId;
        if (String(creatorId) === String(user.id)) {
            throw new Error("You cannot book your own service");
        }
        const creatorProfile = await creatorProfile_model_1.CreatorProfile.findOne({
            userId: creatorId,
        }).session(session);
        if (!creatorProfile)
            throw new Error("Creator profile not found");
        if (creatorProfile.status !== "active") {
            throw new Error("Creator is not active");
        }
        const slots = await slot_model_1.Slot.find({
            _id: { $in: slotIds },
            status: "AVAILABLE",
            serviceId: service._id,
        }).session(session);
        const now = new Date();
        for (const slot of slots) {
            if (new Date(slot.startTime) < now) {
                throw new Error("Cannot book expired slots");
            }
        }
        if (slots.length !== slotIds.length) {
            throw new Error("One or more slots not available");
        }
        const totalMinutes = slots.reduce((sum, slot) => {
            const duration = (slot.endTime.getTime() - slot.startTime.getTime()) / (1000 * 60);
            return sum + duration;
        }, 0);
        if (totalMinutes < service.durationMinutes ||
            totalMinutes % service.durationMinutes !== 0) {
            throw new Error(`Slots must be in multiples of ${service.durationMinutes} minutes`);
        }
        const existingRequest = await booking_model_1.Booking.findOne({
            slotIds: { $in: slotIds },
            status: "REQUESTED",
            expiresAt: { $gt: new Date() },
        }).session(session);
        if (existingRequest) {
            throw new Error("This slot is already requested by another user");
        }
        const lockResult = await slot_model_1.Slot.updateMany({
            _id: { $in: slotIds },
            status: "AVAILABLE",
            serviceId: service._id,
        }, { status: "LOCKED" }, { session });
        if (lockResult.modifiedCount !== slotIds.length) {
            throw new Error("Failed to lock slots");
        }
        const totalPrice = slots.reduce((sum, slot) => sum +
            (0, creatorServicePrice_util_1.creatorServiceMajorToMinor)(slot.price, creatorProfile.currency), 0);
        const paymentCurrency = supportedCurrencies_1.SUPPORTED_CURRENCIES.find((currency) => currency === creatorProfile.currency);
        if (!paymentCurrency) {
            throw new Error("Creator currency is not supported for payments");
        }
        const pricing = marketplacePricing_service_1.marketplacePricingService.calculate({
            serviceAmount: totalPrice,
            currency: paymentCurrency,
        });
        const expiresAt = new Date(Date.now() + 180 * 60 * 1000);
        const booking = await booking_model_1.Booking.create([
            {
                slotIds,
                userId: user.id,
                creatorId,
                serviceId: service._id,
                serviceSnapshot: {
                    serviceId: service._id,
                    title: service.title,
                    description: service.description,
                    durationMinutes: service.durationMinutes,
                    price: service.price,
                    currency: service.currency,
                    media: [...(service.media ?? [])],
                },
                serviceTitle: service.title,
                durationMinutes: totalMinutes,
                price: totalPrice,
                serviceAmount: pricing.serviceAmount,
                platformFeeAmount: pricing.platformFeeAmount,
                commissionAmount: pricing.commissionAmount,
                creatorAmount: pricing.creatorAmount,
                totalAmount: pricing.totalAmount,
                currency: creatorProfile.currency,
                status: "REQUESTED",
                paymentStatus: "PENDING",
                expiresAt,
                ...(requestIdentity ? {
                    bookingReference: requestIdentity.bookingReference,
                    paymentMethod: paymentMethod_enum_1.PaymentMethod.WALLET,
                    bookingRequestKey: requestIdentity.bookingRequestKey,
                    bookingRequestFingerprint: requestIdentity.bookingRequestFingerprint,
                } : {
                    paymentMethod: paymentMethod_enum_1.PaymentMethod.INTERNAL,
                }),
            },
        ], { session });
        const createdBooking = booking[0];
        const payment = await payment_service_1.paymentService.createPayment({
            bookingId: createdBooking._id.toString(),
            userId: user.id,
            creatorId: creatorId.toString(),
            serviceAmount: {
                amount: totalPrice,
                currency: paymentCurrency,
            },
            idempotencyKey: `booking-payment:${createdBooking._id.toString()}`,
            method: paymentMethod,
            ...(paymentMethod === paymentMethod_enum_1.PaymentMethod.WALLET ? {
                idempotencyKey: `booking-payment:${requestIdentity.bookingReference}`,
                pricingSnapshot: {
                    serviceAmount: pricing.serviceAmount,
                    customerFeeRateBps: marketplacePricing_service_1.CUSTOMER_PLATFORM_FEE_RATE_BPS,
                    customerFeeAmount: pricing.platformFeeAmount,
                    grossEscrowAmount: pricing.totalAmount,
                    currency: paymentCurrency,
                    pricingPolicy: paymentPricingPolicy_enum_1.PaymentPricingPolicy.STANDARD_CUSTOMER_FEE_V1,
                    pricingVersion: 1,
                },
            } : {}),
            session,
        });
        createdBooking.paymentId = payment._id;
        createdBooking.paymentReference = payment.paymentReference;
        await createdBooking.save({ session });
        let walletReservation = null;
        if (paymentMethod === paymentMethod_enum_1.PaymentMethod.WALLET) {
            walletReservation = await bookingWalletReservation_service_1.bookingWalletReservationService.authorize({
                booking: createdBooking,
                payment,
                authenticatedUserId: new mongoose_1.default.Types.ObjectId(user.id),
                currency: paymentCurrency,
                session,
            });
        }
        await session.commitTransaction();
        if (walletReservation) {
            payment.status = paymentStatus_enum_1.PaymentStatus.AUTHORIZED;
            const safeResponse = safeWalletBookingResponse(createdBooking, payment, walletReservation.reservation, slots.map((slot) => ({
                startTime: slot.startTime,
                endTime: slot.endTime,
                status: "LOCKED",
            })));
            return res.status(201).json(safeResponse);
        }
        const initializedPayment = await paymentLifecycle_service_1.paymentLifecycleService.completePaymentLifecycle(payment._id.toString());
        if (initializedPayment.payment.status === paymentStatus_enum_1.PaymentStatus.CAPTURED) {
            await booking_model_1.Booking.updateOne({ _id: createdBooking._id, status: "REQUESTED" }, { $set: { paymentStatus: "PAID", isPayable: true } });
            createdBooking.paymentStatus = "PAID";
            createdBooking.isPayable = true;
        }
        return res.status(201).json({
            message: "Booking request sent",
            booking: createdBooking,
            payment: initializedPayment.payment,
        });
    }
    catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        if (paymentMethod === paymentMethod_enum_1.PaymentMethod.WALLET) {
            try {
                const replay = await loadWalletReplay();
                if (replay)
                    return res.status(200).json(replay);
            }
            catch (replayError) {
                if (replayError instanceof BookingWalletReservationError_1.BookingWalletReservationError) {
                    return res.status(replayError.statusCode).json({
                        message: replayError.message,
                        code: replayError.code,
                    });
                }
            }
            const cause = err instanceof BookingWalletReservationError_1.BookingWalletReservationError
                ? err.cause
                : err;
            const isTransientTransactionConflict = typeof cause === "object" &&
                cause !== null &&
                "hasErrorLabel" in cause &&
                typeof cause.hasErrorLabel === "function" &&
                (cause
                    .hasErrorLabel("TransientTransactionError") ||
                    cause
                        .hasErrorLabel("UnknownTransactionCommitResult"));
            const retryCount = typeof res.locals.bookingWalletTransactionRetryCount === "number"
                ? res.locals.bookingWalletTransactionRetryCount
                : 0;
            if (isTransientTransactionConflict && retryCount < 3) {
                res.locals.bookingWalletTransactionRetryCount = retryCount + 1;
                return (0, exports.requestBooking)(req, res);
            }
        }
        if (err instanceof BookingWalletReservationError_1.BookingWalletReservationError) {
            return res.status(err.statusCode).json({
                message: err.message,
                code: err.code,
            });
        }
        if (paymentMethod === paymentMethod_enum_1.PaymentMethod.WALLET) {
            const bookingConflictMessages = new Set([
                "Service not found",
                "Service is not active",
                "You cannot book your own service",
                "Creator profile not found",
                "Creator is not active",
                "Cannot book expired slots",
                "One or more slots not available",
                "This slot is already requested by another user",
                "Failed to lock slots",
            ]);
            const bookingConflict = bookingConflictMessages.has(err?.message);
            return res.status(409).json({
                message: bookingConflict
                    ? "Booking or slot state conflicts with this request."
                    : "Wallet booking transaction could not be committed.",
                code: bookingConflict
                    ? "BOOKING_WALLET_RESERVATION_BOOKING_CONFLICT"
                    : "BOOKING_WALLET_RESERVATION_TRANSACTION_CONFLICT",
            });
        }
        return res.status(400).json({
            message: err.message || "Failed to request booking",
        });
    }
    finally {
        session.endSession();
    }
};
exports.requestBooking = requestBooking;
/* =========================================================
   REFUND (DISPUTE SAFE)
========================================================= */
const REFUND_ALLOWED_STATUSES = ["CANCELLED", "EXPIRED", "REJECTED"];
const refundBooking = async (req, res) => {
    const user = req.user;
    const { bookingId } = req.params;
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const booking = await booking_model_1.Booking.findById(bookingId);
    if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
    }
    const openDispute = await dispute_model_1.Dispute.findOne({
        bookingId,
        status: "OPEN",
    });
    if (openDispute) {
        return res.status(400).json({
            message: "Cannot refund while dispute is open",
        });
    }
    if (booking.isFinancialLocked ||
        booking.isPayoutEligible ||
        booking.paymentStatus !== "PAID" ||
        !booking.isPayable ||
        !REFUND_ALLOWED_STATUSES.includes(booking.status)) {
        return res.status(400).json({
            message: "Refund not allowed",
        });
    }
    return res.status(409).json({ message: "Legacy refund endpoint is disabled; Financial Payment state is authoritative." });
};
exports.refundBooking = refundBooking;
