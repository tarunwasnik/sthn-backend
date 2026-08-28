"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Development-only G6 runtime certification helper.
 *
 * It authenticates through the public API and never performs direct database
 * writes. Destructive commands are deliberately not invoked by discovery mode.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../models/User"));
const userProfile_model_1 = require("../models/userProfile.model");
const creatorProfile_model_1 = require("../models/creatorProfile.model");
const wallet_model_1 = require("../models/wallet.model");
const booking_model_1 = require("../models/booking.model");
const creatorService_model_1 = require("../models/creatorService.model");
const slot_model_1 = require("../models/slot.model");
const payment_model_1 = require("../models/payment.model");
const bookingFundReservation_model_1 = require("../models/bookingFundReservation.model");
const availability_model_1 = require("../models/availability.model");
const ledgerEntry_model_1 = require("../models/ledgerEntry.model");
const bookingEscrowAllocation_model_1 = require("../models/bookingEscrowAllocation.model");
const bookingCreatorSettlement_model_1 = require("../models/bookingCreatorSettlement.model");
const settlement_model_1 = require("../models/settlement.model");
const dispute_model_1 = require("../models/dispute.model");
const adminActionLog_model_1 = __importDefault(require("../models/adminActionLog.model"));
const auditLog_model_1 = require("../models/auditLog.model");
const walletTopUpRequest_model_1 = require("../models/walletTopUpRequest.model");
const internalTopUpFunding_model_1 = require("../models/internalTopUpFunding.model");
const creatorServicePrice_util_1 = require("../utils/financial/creatorServicePrice.util");
const marketplacePricing_service_1 = require("../services/financial/marketplacePricing.service");
const supportedCurrencies_1 = require("../constants/financial/supportedCurrencies");
const paymentMethod_enum_1 = require("../enums/financial/paymentMethod.enum");
const bookingWalletReservationIdentity_util_1 = require("../utils/financial/bookingWalletReservationIdentity.util");
const ADMIN_EMAIL = "admin@test.com";
const DISPOSABLE_EMAILS = [
    "dispose@1.com",
    "dispose@2.com",
    "dispose@3.com",
    "dispose@4.com",
    "dispose@5.com",
    "dispose@6.com",
];
const TARGETED_SESSION_EMAILS = [
    "dispose@1.com",
    "dispose@3.com",
    "dispose@4.com",
    "dispose@6.com",
];
const REQUIRED_ACTIONS = [
    "SUSPEND_USER",
    "ACTIVATE_USER",
    "BAN_USER",
    "RESET_USER_TRUST",
    "APPLY_CREATOR_COOLDOWN",
    "REVOKE_CREATOR_COOLDOWN",
];
const B2_BOOKING_REFERENCE = "BKG-26F5742D967C77AADD2A703F";
const FINAL_BAN_GATE_COUNTERPARTY = "dispose@7.com";
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const getString = (value, key) => isRecord(value) && typeof value[key] === "string" ? value[key] : undefined;
const safeBackendErrorSummary = (value) => {
    if (!isRecord(value))
        return "";
    const summary = {};
    for (const key of ["code", "message"]) {
        if (typeof value[key] === "string")
            summary[key] = value[key];
    }
    if (isRecord(value.error)) {
        const nested = {};
        for (const key of ["code", "message"]) {
            if (typeof value.error[key] === "string")
                nested[key] = value.error[key];
        }
        if (Object.keys(nested).length)
            summary.error = nested;
    }
    else if (typeof value.error === "string") {
        summary.error = value.error;
    }
    if (Array.isArray(value.details)) {
        summary.details = value.details.slice(0, 5).map((detail) => {
            if (typeof detail === "string")
                return detail.slice(0, 160);
            if (!isRecord(detail))
                return "invalid detail";
            return Object.fromEntries(Object.entries(detail).filter(([key, field]) => ["field", "path", "message", "code"].includes(key) && typeof field === "string"));
        });
    }
    const serialized = JSON.stringify(summary);
    return serialized === "{}" ? "" : ` response=${serialized.slice(0, 800)}`;
};
const fail = (message) => {
    throw new Error(`G6 runtime safety check failed: ${message}`);
};
const assertSafeRuntime = () => {
    const baseUrl = process.env.G6_BACKEND_URL ?? "http://127.0.0.1:5000";
    const parsed = new URL(baseUrl);
    if (process.env.NODE_ENV === "production")
        fail("NODE_ENV=production is not allowed");
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || /render\.com$/i.test(parsed.hostname)) {
        fail("G6_BACKEND_URL must be a local backend URL");
    }
    return parsed.origin;
};
function assertDisposable(email) {
    if (!DISPOSABLE_EMAILS.includes(email)) {
        fail(`target email is not in the disposable whitelist: ${email}`);
    }
}
class G6AdminApi {
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
    }
    static async login(baseUrl) {
        const email = process.env.G6_ADMIN_EMAIL ?? ADMIN_EMAIL;
        const password = process.env.G6_ADMIN_PASSWORD;
        if (email !== ADMIN_EMAIL)
            fail("G6_ADMIN_EMAIL must equal the authorized Admin email");
        if (!password)
            fail("G6_ADMIN_PASSWORD is required");
        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            signal: AbortSignal.timeout(10000),
        });
        const body = await response.json().catch(() => null);
        const token = getString(body, "token");
        if (!response.ok || typeof token !== "string")
            throw new Error("G6 runtime safety check failed: Admin login failed");
        const client = new G6AdminApi(baseUrl, token);
        const me = await client.get("/api/auth/me");
        if (getString(me, "email") !== ADMIN_EMAIL || getString(me, "role") !== "admin") {
            fail("authenticated account is not the authorized Admin");
        }
        return client;
    }
    async get(path) {
        return this.request(path, { method: "GET" });
    }
    async post(path, body = {}) {
        return this.request(path, { method: "POST", body: JSON.stringify(body) });
    }
    async patch(path, body) {
        return this.request(path, { method: "PATCH", body: JSON.stringify(body) });
    }
    async previewGovernanceAction(input) {
        assertDisposable(input.target.email);
        return this.request("/api/v1/admin/actions/execute", {
            method: "POST", body: JSON.stringify({ key: input.key, targetId: input.target.id, params: input.params, reason: input.reason, dryRun: true }),
        });
    }
    async executeConfirmedGovernanceAction(input) {
        assertDisposable(input.target.email);
        return this.request("/api/v1/admin/actions/execute", {
            method: "POST", body: JSON.stringify({ key: input.key, targetId: input.target.id, params: input.params, reason: input.reason, dryRun: false, confirmationToken: input.confirmationToken }),
        });
    }
    async request(path, init) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
            signal: AbortSignal.timeout(10000),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok)
            fail(`Admin HTTP ${response.status} for ${init.method ?? "GET"} ${path}${safeBackendErrorSummary(body)}`);
        return body;
    }
}
const discoverWhitelistedAccounts = async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri)
        throw new Error("G6 runtime safety check failed: MONGODB_URI is required only for read-only account discovery");
    await mongoose_1.default.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    try {
        const users = await User_1.default.find({ email: { $in: DISPOSABLE_EMAILS } })
            .select("email role status governanceState creatorStatus userCooldownUntil creatorCooldownUntil")
            .lean();
        const byEmail = new Map(users.map((user) => [user.email, user]));
        for (const email of DISPOSABLE_EMAILS) {
            const user = byEmail.get(email);
            if (!user) {
                console.log(`${email}: NOT_RESOLVED`);
                continue;
            }
            const [profile, creator, wallets, customerBookings, creatorBookings] = await Promise.all([
                userProfile_model_1.UserProfile.findOne({ userId: user._id }).select("profileStatus").lean(),
                creatorProfile_model_1.CreatorProfile.findOne({ userId: user._id }).select("status slug").lean(),
                wallet_model_1.Wallet.find({ userId: user._id }).select("currency availableBalance reservedBalance lockedBalance currentBalance").lean(),
                booking_model_1.Booking.find({ userId: user._id }).select("bookingReference status paymentStatus currency totalAmount").limit(20).lean(),
                booking_model_1.Booking.find({ creatorId: user._id }).select("bookingReference status paymentStatus currency totalAmount").limit(20).lean(),
            ]);
            console.log(JSON.stringify({
                email: user.email, role: user.role, status: user.status, governanceState: user.governanceState,
                creatorStatus: user.creatorStatus, userCooldownUntil: user.userCooldownUntil ?? null,
                creatorCooldownUntil: user.creatorCooldownUntil ?? null, profileStatus: profile?.profileStatus ?? null,
                creator: creator ? { status: creator.status, slug: creator.slug } : null,
                wallets: wallets.map((wallet) => ({ currency: wallet.currency, available: wallet.availableBalance, reserved: wallet.reservedBalance, locked: wallet.lockedBalance, current: wallet.currentBalance })),
                customerBookings: customerBookings.map((booking) => ({ reference: booking.bookingReference, status: booking.status, paymentStatus: booking.paymentStatus, currency: booking.currency, totalAmount: booking.totalAmount })),
                creatorBookings: creatorBookings.map((booking) => ({ reference: booking.bookingReference, status: booking.status, paymentStatus: booking.paymentStatus, currency: booking.currency, totalAmount: booking.totalAmount })),
            }));
        }
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
const unwrapData = (value) => isRecord(value) ? value.data : undefined;
const runDiscovery = async () => {
    const baseUrl = assertSafeRuntime();
    const admin = await G6AdminApi.login(baseUrl);
    const registry = unwrapData(await admin.get("/api/v1/admin/actions/registry"));
    const actionKeys = Array.isArray(registry) ? registry.map((action) => getString(action, "key")) : [];
    const missing = REQUIRED_ACTIONS.filter((key) => !actionKeys.includes(key));
    if (missing.length)
        fail(`registry is missing required Governance actions: ${missing.join(", ")}`);
    await admin.get("/api/v1/admin/actions/logs");
    await admin.get("/api/v1/admin/audit-logs");
    console.log("ADMIN_AUTHENTICATED=admin@test.com");
    console.log("ADMIN_REGISTRY=PASS");
    console.log("ADMIN_LOG_READS=PASS");
    await discoverWhitelistedAccounts();
};
/**
 * Read-only forensic report for the historical B2 runtime booking.
 * This deliberately uses model reads only; it does not authenticate, call an
 * HTTP mutation endpoint, or invoke any booking/financial/governance service.
 */
const runB2Inspection = async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri)
        return fail("MONGODB_URI is required for the read-only B2 inspection");
    await mongoose_1.default.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    try {
        const booking = await booking_model_1.Booking.findOne({ bookingReference: B2_BOOKING_REFERENCE })
            .select("bookingReference userId creatorId serviceId slotIds paymentId paymentReference reservationReference paymentMethod status paymentStatus serviceTitle durationMinutes serviceAmount platformFeeAmount commissionAmount creatorAmount totalAmount currency expiresAt completedAt completionCause completedByType completedById completionOperationKey settlementEligibleAt settlementId settledAt terminationType terminatedByType terminatedById terminationReason terminatedAt createdAt updatedAt")
            .lean();
        if (!booking)
            return fail(`B2 booking was not found: ${B2_BOOKING_REFERENCE}`);
        const b2 = booking;
        const [payment, reservation, slots, allocation, creatorSettlement, legacySettlements, dispute] = await Promise.all([
            payment_model_1.Payment.findOne({ bookingId: b2._id })
                .select("paymentReference bookingId userId creatorId amount serviceAmount customerFeeAmount grossEscrowAmount currency provider method status providerPaymentId providerOrderId providerTransactionId authorizationId reservationReference authorizedAmount authorizedAt releasedAmount releaseCause releasedAt captureReference capturedAmount captureCause capturedAt escrowRecognizedAt escrowLedgerTransactionReference settlementId createdAt updatedAt")
                .lean(),
            bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: b2._id })
                .select("reservationReference bookingId bookingReference paymentId paymentReference userId +walletId creatorId serviceId amount currency status authorizedAt releasedAt releaseReference releaseCause releaseReason capturedAt captureReference captureCause capturedByType createdAt updatedAt")
                .lean(),
            slot_model_1.Slot.find({ _id: { $in: b2.slotIds } })
                .select("availabilityId creatorId serviceId startTime endTime timezone status price createdAt updatedAt")
                .sort({ startTime: 1 })
                .lean(),
            bookingEscrowAllocation_model_1.BookingEscrowAllocation.findOne({ bookingId: b2._id })
                .select("allocationReference bookingId paymentId reservationId bookingAmount serviceAmount platformFeeAmount totalAmount currency commissionRateBps commissionAmount creatorAmount status allocatedAt createdAt updatedAt")
                .lean(),
            bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({ bookingId: b2._id })
                .select("settlementReference bookingId paymentId reservationId allocationId bookingAmount currency commissionAmount creatorAmount status settledAt createdAt updatedAt")
                .lean(),
            settlement_model_1.Settlement.find({ bookingId: b2._id })
                .select("settlementReference bookingId paymentId amount currency status settledAt createdAt updatedAt")
                .lean(),
            dispute_model_1.Dispute.findOne({ bookingId: b2._id })
                .select("status escalationLevel raisedByRole createdAt updatedAt")
                .lean(),
        ]);
        const ledgerEntries = await ledgerEntry_model_1.LedgerEntry.find({
            $or: [{ bookingId: b2._id }, ...(payment ? [{ paymentId: payment._id }] : [])],
        })
            .select("ledgerReference transactionId idempotencyKey type source bookingId paymentId settlementId userId walletId direction account amount currency description createdAt")
            .sort({ createdAt: 1, _id: 1 })
            .lean();
        const [customerWallet, otherActiveReservations] = await Promise.all([
            reservation
                ? wallet_model_1.Wallet.findById(reservation.walletId)
                    .select("currency availableBalance reservedBalance lockedBalance currentBalance updatedAt")
                    .lean()
                : null,
            bookingFundReservation_model_1.BookingFundReservation.find({
                userId: b2.userId,
                currency: b2.currency,
                status: "ACTIVE",
                bookingId: { $ne: b2._id },
            })
                .select("reservationReference bookingId bookingReference amount currency status authorizedAt")
                .lean(),
        ]);
        const now = new Date();
        console.log(JSON.stringify({
            readOnly: true,
            inspectedAt: now.toISOString(),
            booking: {
                id: b2._id, reference: b2.bookingReference, customerId: b2.userId,
                creatorId: b2.creatorId, serviceId: b2.serviceId, slotIds: b2.slotIds,
                paymentId: b2.paymentId ?? null, paymentReference: b2.paymentReference ?? null,
                reservationReference: b2.reservationReference ?? null, paymentMethod: b2.paymentMethod ?? null,
                status: b2.status, paymentStatus: b2.paymentStatus, serviceTitle: b2.serviceTitle,
                durationMinutes: b2.durationMinutes, serviceAmount: b2.serviceAmount,
                platformFeeAmount: b2.platformFeeAmount, commissionAmount: b2.commissionAmount,
                creatorAmount: b2.creatorAmount, totalAmount: b2.totalAmount, currency: b2.currency,
                expiresAt: b2.expiresAt, completedAt: b2.completedAt ?? null,
                completionCause: b2.completionCause ?? null, completedByType: b2.completedByType ?? null,
                completedById: b2.completedById ?? null, settlementEligibleAt: b2.settlementEligibleAt ?? null,
                settlementId: b2.settlementId ?? null, settledAt: b2.settledAt ?? null,
                terminationType: b2.terminationType ?? null, terminatedByType: b2.terminatedByType ?? null,
                terminationReason: b2.terminationReason ?? null, terminatedAt: b2.terminatedAt ?? null,
                createdAt: b2.createdAt, updatedAt: b2.updatedAt,
            },
            payment: payment ? {
                id: payment._id, reference: payment.paymentReference, bookingId: payment.bookingId,
                amount: payment.amount, serviceAmount: payment.serviceAmount ?? null,
                customerFeeAmount: payment.customerFeeAmount ?? null, grossEscrowAmount: payment.grossEscrowAmount ?? null,
                currency: payment.currency, provider: payment.provider, method: payment.method, status: payment.status,
                providerPaymentId: payment.providerPaymentId ?? null, providerOrderId: payment.providerOrderId ?? null,
                providerTransactionId: payment.providerTransactionId ?? null, authorizationId: payment.authorizationId ?? null,
                reservationReference: payment.reservationReference ?? null, authorizedAmount: payment.authorizedAmount ?? null,
                authorizedAt: payment.authorizedAt ?? null, releasedAmount: payment.releasedAmount ?? null,
                releaseCause: payment.releaseCause ?? null, releasedAt: payment.releasedAt ?? null,
                captureReference: payment.captureReference ?? null, capturedAmount: payment.capturedAmount ?? null,
                captureCause: payment.captureCause ?? null, capturedAt: payment.capturedAt ?? null,
                escrowRecognizedAt: payment.escrowRecognizedAt ?? null,
                escrowLedgerTransactionReference: payment.escrowLedgerTransactionReference ?? null,
                settlementId: payment.settlementId ?? null, createdAt: payment.createdAt, updatedAt: payment.updatedAt,
            } : null,
            reservation: reservation ? {
                id: reservation._id, reference: reservation.reservationReference, bookingId: reservation.bookingId,
                paymentId: reservation.paymentId, paymentReference: reservation.paymentReference,
                walletId: reservation.walletId, amount: reservation.amount, currency: reservation.currency,
                status: reservation.status, authorizedAt: reservation.authorizedAt ?? null,
                releasedAt: reservation.releasedAt ?? null, releaseReference: reservation.releaseReference ?? null,
                releaseCause: reservation.releaseCause ?? null, releaseReason: reservation.releaseReason ?? null,
                capturedAt: reservation.capturedAt ?? null, captureReference: reservation.captureReference ?? null,
                captureCause: reservation.captureCause ?? null, capturedByType: reservation.capturedByType ?? null,
                createdAt: reservation.createdAt, updatedAt: reservation.updatedAt,
            } : null,
            slots: slots.map((slot) => ({ id: slot._id, availabilityId: slot.availabilityId, serviceId: slot.serviceId, status: slot.status, startTime: slot.startTime, endTime: slot.endTime, timezone: slot.timezone, createdAt: slot.createdAt, updatedAt: slot.updatedAt })),
            session: {
                ended: slots.length > 0 && slots.every((slot) => slot.endTime.getTime() <= now.getTime()),
                firstStartTime: slots[0]?.startTime ?? null,
                lastEndTime: slots.length ? slots[slots.length - 1].endTime : null,
            },
            customerWallet: customerWallet ? {
                currency: customerWallet.currency, available: customerWallet.availableBalance,
                reserved: customerWallet.reservedBalance, locked: customerWallet.lockedBalance,
                current: customerWallet.currentBalance, updatedAt: customerWallet.updatedAt,
            } : null,
            otherActiveReservations: otherActiveReservations.map((entry) => ({
                bookingId: entry.bookingId, bookingReference: entry.bookingReference,
                reservationReference: entry.reservationReference, amount: entry.amount,
                currency: entry.currency, status: entry.status, authorizedAt: entry.authorizedAt ?? null,
            })),
            ledgerEntries: ledgerEntries.map((entry) => ({ reference: entry.ledgerReference, transactionId: entry.transactionId, idempotencyKey: entry.idempotencyKey ?? null, type: entry.type, source: entry.source, direction: entry.direction, account: entry.account ?? null, amount: entry.amount, currency: entry.currency, createdAt: entry.createdAt })),
            escrowAllocation: allocation ? { reference: allocation.allocationReference, status: allocation.status, bookingAmount: allocation.bookingAmount, serviceAmount: allocation.serviceAmount, platformFeeAmount: allocation.platformFeeAmount, commissionAmount: allocation.commissionAmount, creatorAmount: allocation.creatorAmount, currency: allocation.currency, allocatedAt: allocation.allocatedAt ?? null, createdAt: allocation.createdAt, updatedAt: allocation.updatedAt } : null,
            creatorSettlement: creatorSettlement ? { reference: creatorSettlement.settlementReference, status: creatorSettlement.status, bookingAmount: creatorSettlement.bookingAmount, commissionAmount: creatorSettlement.commissionAmount, creatorAmount: creatorSettlement.creatorAmount, currency: creatorSettlement.currency, settledAt: creatorSettlement.settledAt ?? null, createdAt: creatorSettlement.createdAt, updatedAt: creatorSettlement.updatedAt } : null,
            legacySettlements: legacySettlements.map((settlement) => ({ reference: settlement.settlementReference, status: settlement.status, amount: settlement.amount, currency: settlement.currency, settledAt: settlement.settledAt ?? null, createdAt: settlement.createdAt, updatedAt: settlement.updatedAt })),
            dispute: dispute ? { status: dispute.status, escalationLevel: dispute.escalationLevel, raisedByRole: dispute.raisedByRole, createdAt: dispute.createdAt, updatedAt: dispute.updatedAt } : null,
        }, null, 2));
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
/**
 * Enables only the dispatcher gate through the existing Admin feature-flag
 * API, then proves the first Governance dry-run is non-mutating. It never
 * executes a confirmed Governance action.
 */
const runEnableAdminActions = async () => {
    const baseUrl = assertSafeRuntime();
    const admin = await G6AdminApi.login(baseUrl);
    const flags = unwrapData(await admin.get("/api/v1/control-plane/feature-flags"));
    if (!Array.isArray(flags))
        return fail("feature-flag list returned an invalid response");
    const flagList = flags;
    const existing = flagList.find((flag) => getString(flag, "key") === "ADMIN_ACTIONS_ENABLED");
    const payload = {
        enabled: true,
        scope: "ROLE",
        conditions: { roles: ["admin"] },
    };
    if (existing) {
        const flagId = getString(existing, "_id");
        if (!flagId)
            fail("ADMIN_ACTIONS_ENABLED exists without a safe flag identifier");
        await admin.patch(`/api/v1/control-plane/feature-flags/${flagId}`, payload);
        console.log("ADMIN_ACTIONS_FLAG=UPDATED");
    }
    else {
        await admin.post("/api/v1/control-plane/feature-flags", {
            key: "ADMIN_ACTIONS_ENABLED",
            description: "Enables hardened Admin action execution for authorized administrators.",
            ...payload,
        });
        console.log("ADMIN_ACTIONS_FLAG=CREATED");
    }
    const verifiedFlags = unwrapData(await admin.get("/api/v1/control-plane/feature-flags"));
    const verified = Array.isArray(verifiedFlags)
        ? verifiedFlags.find((flag) => getString(flag, "key") === "ADMIN_ACTIONS_ENABLED")
        : undefined;
    if (!isRecord(verified) || verified.enabled !== true || verified.scope !== "ROLE" || !isRecord(verified.conditions) || !Array.isArray(verified.conditions.roles) || !verified.conditions.roles.includes("admin")) {
        fail("ADMIN_ACTIONS_ENABLED was not enabled for the Admin role");
    }
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri)
        return fail("MONGODB_URI is required for the read-only G6 dry-run target verification");
    await mongoose_1.default.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    try {
        const target = await User_1.default.findOne({ email: "dispose@1.com" })
            .select("email status governanceState")
            .lean();
        if (!target)
            return fail("dispose@1.com was not found for the G6 dry-run");
        const targetUser = target;
        assertDisposable(targetUser.email);
        const before = { status: targetUser.status, governanceState: targetUser.governanceState };
        const preview = unwrapData(await admin.previewGovernanceAction({
            key: "SUSPEND_USER",
            target: { email: targetUser.email, id: targetUser._id.toString() },
            params: {},
            reason: "G6 safe dry-run preflight for dispose@1.com",
        }));
        const after = await User_1.default.findById(targetUser._id)
            .select("status governanceState")
            .lean();
        if (!after || after.status !== before.status || after.governanceState !== before.governanceState) {
            fail("SUSPEND_USER dry-run unexpectedly mutated dispose@1.com");
        }
        const afterUser = after;
        console.log(JSON.stringify({
            ADMIN_ACTIONS_ENABLED: { enabled: true, scope: "ROLE", roles: ["admin"] },
            SUSPEND_USER_DRY_RUN: {
                outcome: isRecord(preview) ? getString(preview, "outcome") : null,
                confirmationRequired: isRecord(preview) ? preview.confirmationRequired === true : false,
                confirmationTokenReturned: isRecord(preview) && typeof preview.confirmationToken === "string",
                target: targetUser.email,
                before,
                after: { status: afterUser.status, governanceState: afterUser.governanceState },
            },
        }));
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
const PASSWORD_VARIABLES = {
    "dispose@1.com": "G6_USER1_PASSWORD", "dispose@2.com": "G6_USER2_PASSWORD", "dispose@3.com": "G6_USER3_PASSWORD",
    "dispose@4.com": "G6_CREATOR4_PASSWORD", "dispose@5.com": "G6_CREATOR5_PASSWORD", "dispose@6.com": "G6_CREATOR6_PASSWORD",
};
class DisposableSession {
    constructor(email, role, baseUrl, token) {
        this.email = email;
        this.role = role;
        this.baseUrl = baseUrl;
        this.token = token;
    }
    static async login(baseUrl, email, password) {
        const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(10000) });
        const body = await response.json().catch(() => null);
        const token = getString(body, "token");
        if (!response.ok || typeof token !== "string")
            throw new Error(`G6 runtime safety check failed: login failed for ${email}`);
        const temporary = new DisposableSession(email, "", baseUrl, token);
        const me = await temporary.get("/api/auth/me");
        const role = getString(me, "role");
        if (getString(me, "email") !== email || typeof role !== "string")
            throw new Error(`G6 runtime safety check failed: identity verification failed for ${email}`);
        return new DisposableSession(email, role, baseUrl, token);
    }
    async get(path) { return this.request(path, { method: "GET" }); }
    async post(path, body, headers = {}) { return this.request(path, { method: "POST", headers, body: JSON.stringify(body) }); }
    async request(path, init) {
        const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15000) });
        const body = await response.json().catch(() => null);
        if (!response.ok)
            fail(`${this.email} HTTP ${response.status} for ${init.method ?? "GET"} ${path}${safeBackendErrorSummary(body)}`);
        return body;
    }
}
const setupScenarios = [
    { label: "S1", customer: "dispose@1.com", creator: "dispose@4.com", currency: "INR", timing: "REQUESTED" }, { label: "S2", customer: "dispose@1.com", creator: "dispose@4.com", currency: "INR", timing: "LT24" }, { label: "S3", customer: "dispose@1.com", creator: "dispose@4.com", currency: "INR", timing: "GT24" },
    { label: "B1", customer: "dispose@2.com", creator: "dispose@5.com", currency: "USD", timing: "REQUESTED" }, { label: "B2", customer: "dispose@2.com", creator: "dispose@5.com", currency: "USD", timing: "LT24" }, { label: "B3", customer: "dispose@2.com", creator: "dispose@5.com", currency: "USD", timing: "GT24" },
    { label: "CS1", customer: "dispose@3.com", creator: "dispose@4.com", currency: "INR", timing: "REQUESTED" }, { label: "CS2", customer: "dispose@3.com", creator: "dispose@4.com", currency: "INR", timing: "LT24" }, { label: "CS3", customer: "dispose@3.com", creator: "dispose@4.com", currency: "INR", timing: "GT24" },
    { label: "CB1", customer: "dispose@1.com", creator: "dispose@5.com", currency: "USD", timing: "REQUESTED" }, { label: "CB2", customer: "dispose@1.com", creator: "dispose@5.com", currency: "USD", timing: "LT24" }, { label: "CB3", customer: "dispose@1.com", creator: "dispose@5.com", currency: "USD", timing: "GT24" },
    { label: "CD1", customer: "dispose@2.com", creator: "dispose@6.com", currency: "THB", timing: "REQUESTED" },
];
const scenarioPurpose = (label) => label.startsWith("CS") ? "Creator suspension and activation" : label.startsWith("CB") ? "Creator ban" : label.startsWith("CD") ? "Creator cooldown unchanged-booking baseline" : label.startsWith("B") ? "Customer ban" : "Customer suspension and activation";
const runSetup = async () => {
    const baseUrl = assertSafeRuntime();
    const missing = DISPOSABLE_EMAILS.filter((email) => !process.env[PASSWORD_VARIABLES[email]]);
    if (missing.length)
        fail(`missing required password variables: ${missing.map((email) => PASSWORD_VARIABLES[email]).join(", ")}`);
    const sessions = new Map();
    for (const email of DISPOSABLE_EMAILS)
        sessions.set(email, await DisposableSession.login(baseUrl, email, process.env[PASSWORD_VARIABLES[email]]));
    const expectedRoles = { "dispose@1.com": "user", "dispose@2.com": "user", "dispose@3.com": "user", "dispose@4.com": "creator", "dispose@5.com": "creator", "dispose@6.com": "creator" };
    for (const [email, session] of sessions) {
        if (session.role !== expectedRoles[email])
            fail(`unexpected role for ${email}`);
        console.log(`AUTH=${email}:${session.role}`);
    }
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri)
        throw new Error("G6 runtime safety check failed: MONGODB_URI is required for read-only setup verification");
    await mongoose_1.default.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    try {
        const users = await User_1.default.find({ email: { $in: DISPOSABLE_EMAILS } }).select("email").lean();
        const byEmail = new Map(users.map((user) => [user.email, user]));
        if (byEmail.size !== DISPOSABLE_EMAILS.length)
            fail("all six disposable identities must resolve");
        for (const email of ["dispose@1.com", "dispose@2.com", "dispose@3.com"]) {
            const wallets = await wallet_model_1.Wallet.find({ userId: byEmail.get(email)._id }).select("currency availableBalance reservedBalance").lean();
            console.log(JSON.stringify({ customerWalletCurrencies: { email, wallets: wallets.map((wallet) => ({ currency: wallet.currency, available: wallet.availableBalance, reserved: wallet.reservedBalance })) } }));
        }
        for (const email of ["dispose@4.com", "dispose@5.com", "dispose@6.com"]) {
            const services = await creatorService_model_1.CreatorService.find({ creatorId: byEmail.get(email)._id, isActive: true }).select("title currency price durationMinutes").lean();
            console.log(JSON.stringify({ creatorServices: { email, services: services.map((service) => ({ title: service.title, currency: service.currency, price: service.price, durationMinutes: service.durationMinutes })) } }));
        }
        const usedSlots = new Set();
        const boundary = Date.now() + 24 * 60 * 60 * 1000;
        const findAvailableSlots = async (creatorId, serviceId, timing) => {
            const activeAvailabilities = await availability_model_1.Availability.find({ creatorId, serviceId, status: "ACTIVE" }).select("_id").lean();
            const availabilityIds = activeAvailabilities.map((availability) => availability._id);
            if (!availabilityIds.length)
                return [];
            const startTime = timing === "GT24" ? { $gt: new Date(boundary) } : { $gt: new Date(), $lte: new Date(boundary) };
            return slot_model_1.Slot.find({ creatorId, serviceId, availabilityId: { $in: availabilityIds }, status: "AVAILABLE", startTime }).sort({ startTime: 1 }).lean();
        };
        const createNonOverlappingAvailability = async (creator, creatorId, service, timing) => {
            const now = new Date();
            const dateOffset = timing === "GT24" ? 2 : now.getUTCHours() >= 9 ? 1 : 0;
            const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dateOffset));
            const existing = await availability_model_1.Availability.find({ creatorId, serviceId: service._id, date: day, status: "ACTIVE" }).select("startTime endTime").lean();
            const toMinutes = (value) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
            for (let startMinutes = 9 * 60; startMinutes + service.durationMinutes <= 24 * 60; startMinutes += service.durationMinutes) {
                const endMinutes = startMinutes + service.durationMinutes;
                const overlaps = existing.some((availability) => startMinutes < toMinutes(availability.endTime) && endMinutes > toMinutes(availability.startTime));
                const start = new Date(day.getTime() + startMinutes * 60000);
                if (overlaps || start <= now)
                    continue;
                const end = new Date(day.getTime() + endMinutes * 60000);
                try {
                    await sessions.get(creator).post("/api/v1/creator/availability", { serviceId: String(service._id), date: start.toISOString().slice(0, 10), startTime: start.toISOString().slice(11, 16), endTime: end.toISOString().slice(11, 16), timezone: "UTC" });
                    return;
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : "";
                    if (!message.includes("Availability overlaps with an existing active window"))
                        throw error;
                }
            }
            fail(`no non-overlapping ${timing} availability window is available for ${creator}`);
        };
        const historicalStatuses = new Set(["EXPIRED", "CANCELLED", "REJECTED", "COMPLETED"]);
        const inspectScenarioBooking = async (booking, scenario, creatorId) => {
            if (!booking)
                return null;
            if (historicalStatuses.has(booking.status))
                return { decision: "REPLACE_HISTORICAL", reason: `${booking.status} is historical for G6 live-scenario reuse` };
            if (booking.status !== "REQUESTED" && booking.status !== "CONFIRMED") {
                fail(`BLOCK_INTEGRITY for ${scenario.label}: unsupported live Booking status ${booking.status} on ${booking.bookingReference ?? "unknown"}`);
            }
            const [payment, reservation, slots, wallet] = await Promise.all([
                payment_model_1.Payment.findOne({ bookingId: booking._id }).lean(),
                bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).lean(),
                slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }).lean(),
                wallet_model_1.Wallet.findOne({ userId: booking.userId, currency: booking.currency }).select("currency availableBalance reservedBalance currentBalance").lean(),
            ]);
            const liveSlotStatus = booking.status === "REQUESTED" ? "LOCKED" : "BOOKED";
            if (!payment || !reservation || !wallet) {
                fail(`BLOCK_INTEGRITY for ${scenario.label}: live booking ${booking.bookingReference ?? "unknown"} is missing Payment, reservation, or Wallet authority`);
            }
            const livePayment = payment;
            const liveReservation = reservation;
            const liveWallet = wallet;
            if (livePayment.status !== "AUTHORIZED" || liveReservation.status !== "ACTIVE" || livePayment.amount !== booking.totalAmount || livePayment.currency !== booking.currency || liveReservation.amount !== booking.totalAmount || liveReservation.currency !== booking.currency || slots.length !== booking.slotIds.length || slots.some((slot) => slot.status !== liveSlotStatus) || liveWallet.reservedBalance < liveReservation.amount) {
                fail(`BLOCK_INTEGRITY for ${scenario.label}: live booking ${booking.bookingReference ?? "unknown"} lacks its required Wallet authorization, reservation, slot, or reserved-balance authority`);
            }
            if (!booking.creatorId.equals(creatorId) || booking.currency !== scenario.currency) {
                return { decision: "REPLACE_SCENARIO", reason: "live booking belongs to a different Creator or currency scenario" };
            }
            const expectedBookingStatus = scenario.timing === "REQUESTED" ? "REQUESTED" : "CONFIRMED";
            if (booking.status !== expectedBookingStatus)
                return { decision: "REPLACE_SCENARIO", reason: `live booking status ${booking.status} does not satisfy ${scenario.timing}` };
            if (scenario.timing === "REQUESTED")
                return { decision: "REUSE", live: { booking, payment: livePayment, reservation: liveReservation, slots, wallet: liveWallet, expectedSlotStatus: "LOCKED", timingClassification: "REQUESTED" } };
            const now = Date.now();
            const allOngoing = slots.every((slot) => slot.startTime.getTime() <= now && slot.endTime.getTime() > now);
            const allLt24 = slots.every((slot) => slot.startTime.getTime() > now && slot.startTime.getTime() <= now + 24 * 60 * 60 * 1000);
            const allGt24 = slots.every((slot) => slot.startTime.getTime() > now + 24 * 60 * 60 * 1000);
            const timingClassification = allOngoing ? "PROTECTED_ONGOING" : allLt24 ? "PROTECTED_LT24" : allGt24 ? "TERMINATE_GT24" : null;
            if (!timingClassification)
                return { decision: "REPLACE_TIME", reason: "confirmed booking is no longer a current protected/greater-than-24-hour scenario" };
            const matches = scenario.timing === "LT24" ? timingClassification === "PROTECTED_ONGOING" || timingClassification === "PROTECTED_LT24" : timingClassification === "TERMINATE_GT24";
            if (!matches)
                return { decision: "REPLACE_TIME", reason: `current timing is ${timingClassification}` };
            return { decision: "REUSE", live: { booking, payment: livePayment, reservation: liveReservation, slots, wallet: liveWallet, expectedSlotStatus: "BOOKED", timingClassification } };
        };
        const completedScenarios = [];
        for (const scenario of setupScenarios) {
            const customer = byEmail.get(scenario.customer);
            const creator = byEmail.get(scenario.creator);
            const scenarioKeyBase = `g6-setup-booking-${scenario.label.toLowerCase()}`;
            let scenarioIdempotencyKey;
            let reusable = null;
            const candidateKeys = [scenarioKeyBase, ...Array.from({ length: 24 }, (_, index) => `${scenarioKeyBase}-attempt-${index + 1}`)];
            for (const candidateKey of candidateKeys) {
                const identity = (0, bookingWalletReservationIdentity_util_1.deriveBookingRequestIdentity)({ userId: customer._id.toString(), serviceId: "", slotIds: [], method: paymentMethod_enum_1.PaymentMethod.WALLET, idempotencyKey: candidateKey });
                const keyedBooking = await booking_model_1.Booking.findOne({ userId: customer._id, bookingRequestKey: identity.bookingRequestKey }).select("+bookingRequestKey").lean();
                if (!keyedBooking) {
                    if (candidateKey !== scenarioKeyBase) {
                        scenarioIdempotencyKey = candidateKey;
                        break;
                    }
                    continue;
                }
                const inspected = await inspectScenarioBooking(keyedBooking, scenario, creator._id);
                if (inspected?.decision === "REUSE") {
                    reusable = inspected.live;
                    break;
                }
                if (inspected)
                    console.log(JSON.stringify({ scenarioDecision: { scenario: scenario.label, previousBookingReference: keyedBooking.bookingReference, previousStatus: keyedBooking.status, decision: inspected.decision, reason: inspected.reason } }));
            }
            if (!reusable) {
                const candidates = await booking_model_1.Booking.find({ userId: customer._id, creatorId: creator._id }).sort({ createdAt: -1 }).limit(20).lean();
                for (const candidate of candidates) {
                    const inspected = await inspectScenarioBooking(candidate, scenario, creator._id);
                    if (inspected?.decision === "REUSE") {
                        reusable = inspected.live;
                        break;
                    }
                    if (inspected)
                        console.log(JSON.stringify({ scenarioDecision: { scenario: scenario.label, previousBookingReference: candidate.bookingReference, previousStatus: candidate.status, decision: inspected.decision, reason: inspected.reason } }));
                }
            }
            if (reusable) {
                completedScenarios.push({ scenario, bookingId: reusable.booking._id, attemptIdentity: null });
                console.log(JSON.stringify({ reusedScenario: { scenario: scenario.label, purpose: scenarioPurpose(scenario.label), reused: true, bookingReference: reusable.booking.bookingReference, customer: scenario.customer, creator: scenario.creator, status: reusable.booking.status, currency: reusable.booking.currency, paymentStatus: reusable.payment.status, reservationStatus: reusable.reservation.status, reservationAmount: reusable.reservation.amount, slotStatus: reusable.expectedSlotStatus, timingClassification: reusable.timingClassification, sessionStart: reusable.slots[0]?.startTime, sessionEnd: reusable.slots[reusable.slots.length - 1]?.endTime, customerWallet: { currency: reusable.wallet.currency, available: reusable.wallet.availableBalance, reserved: reusable.wallet.reservedBalance, current: reusable.wallet.currentBalance } } }));
                continue;
            }
            if (!scenarioIdempotencyKey)
                throw new Error(`G6 runtime safety check failed: no bounded replacement identity is available for ${scenario.label}`);
            const selectedService = await creatorService_model_1.CreatorService.findOne({ creatorId: creator._id, isActive: true, currency: scenario.currency }).sort({ createdAt: 1 }).lean();
            if (!selectedService)
                throw new Error(`G6 runtime safety check failed: no active ${scenario.currency} service exists for ${scenario.creator}`);
            const service = selectedService;
            let slots = await findAvailableSlots(creator._id, service._id, scenario.timing);
            if (!slots.some((candidate) => !usedSlots.has(String(candidate._id)))) {
                await createNonOverlappingAvailability(scenario.creator, creator._id, service, scenario.timing);
                slots = await findAvailableSlots(creator._id, service._id, scenario.timing);
            }
            const slot = slots.find((candidate) => !usedSlots.has(String(candidate._id)));
            if (!slot)
                throw new Error(`G6 runtime safety check failed: no unused ${scenario.timing} slot for ${scenario.creator}`);
            usedSlots.add(String(slot._id));
            const previewResponse = await sessions.get(scenario.customer).post("/api/v1/bookings/pricing-preview", { serviceId: String(service._id), slotIds: [String(slot._id)] });
            const preview = isRecord(previewResponse) && isRecord(previewResponse.preview) ? previewResponse.preview : null;
            const previewCurrency = preview ? getString(preview, "currency") : undefined;
            const grossFundingAmount = preview && typeof preview.grossFundingAmount === "number" ? preview.grossFundingAmount : undefined;
            const walletFunding = preview && isRecord(preview.walletFunding) ? preview.walletFunding : null;
            if (!previewCurrency || previewCurrency !== service.currency || previewCurrency !== scenario.currency || !walletFunding || typeof grossFundingAmount !== "number")
                throw new Error(`G6 runtime safety check failed: pricing preview currency/readiness is invalid for ${scenario.label}`);
            const selectedWallet = await wallet_model_1.Wallet.findOne({ userId: customer._id, currency: previewCurrency }).select("currency availableBalance reservedBalance").lean();
            const available = selectedWallet?.availableBalance ?? 0;
            if (!selectedWallet || available < grossFundingAmount || walletFunding.sufficient !== true) {
                throw new Error(`G6 runtime safety check failed: insufficient existing Wallet balance for ${scenario.label}; customer=${scenario.customer}; currency=${previewCurrency}; available=${available}; required=${grossFundingAmount}`);
            }
            console.log(JSON.stringify({ preBooking: { scenario: scenario.label, customer: scenario.customer, creator: scenario.creator, service: { title: service.title, currency: service.currency }, walletCurrency: selectedWallet.currency, previewCurrency, grossFundingAmount } }));
            await sessions.get(scenario.customer).post("/api/v1/bookings/request", { serviceId: String(service._id), slotIds: [String(slot._id)], paymentMethod: "WALLET" }, { "Idempotency-Key": scenarioIdempotencyKey });
            const booking = await booking_model_1.Booking.findOne({ userId: customer._id, creatorId: creator._id, slotIds: slot._id }).sort({ createdAt: -1 }).lean();
            if (!booking)
                throw new Error(`G6 runtime safety check failed: booking creation failed for ${scenario.label}`);
            if (scenario.timing !== "REQUESTED")
                await sessions.get(scenario.creator).post(`/api/v1/creator/bookings/${String(booking._id)}/decision`, { decision: "ACCEPT" });
            const [reloaded, payment, reservation, slotState] = await Promise.all([booking_model_1.Booking.findById(booking._id).lean(), payment_model_1.Payment.findOne({ bookingId: booking._id }).lean(), bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).lean(), slot_model_1.Slot.findById(slot._id).lean()]);
            if (!reloaded || !payment || !reservation || !slotState)
                throw new Error(`G6 runtime safety check failed: readback missing for ${scenario.label}`);
            const expectedBookingStatus = scenario.timing === "REQUESTED" ? "REQUESTED" : "CONFIRMED";
            const expectedSlotStatus = scenario.timing === "REQUESTED" ? "LOCKED" : "BOOKED";
            if (reloaded.status !== expectedBookingStatus || payment.status !== "AUTHORIZED" || reservation.status !== "ACTIVE" || slotState.status !== expectedSlotStatus) {
                fail(`unexpected financial or slot state for ${scenario.label}`);
            }
            const wallet = await wallet_model_1.Wallet.findOne({ userId: customer._id, currency: reloaded.currency }).lean();
            if (!wallet)
                throw new Error(`G6 runtime safety check failed: customer Wallet readback missing for ${scenario.label}`);
            completedScenarios.push({ scenario, bookingId: reloaded._id, attemptIdentity: scenarioIdempotencyKey });
            console.log(JSON.stringify({ scenario: scenario.label, purpose: scenarioPurpose(scenario.label), customer: scenario.customer, creator: scenario.creator, service: { title: service.title, currency: service.currency, price: service.price, durationMinutes: service.durationMinutes }, bookingReference: reloaded.bookingReference, status: reloaded.status, startTime: slotState.startTime, endTime: slotState.endTime, timing: scenario.timing, paymentStatus: payment.status, reservationStatus: reservation.status, slotStatus: slotState.status, attemptIdentity: scenarioIdempotencyKey, customerWallet: { currency: wallet.currency, available: wallet.availableBalance, reserved: wallet.reservedBalance, current: wallet.currentBalance } }));
        }
        for (const { scenario, bookingId, attemptIdentity } of completedScenarios) {
            const booking = await booking_model_1.Booking.findById(bookingId).lean();
            const inspected = await inspectScenarioBooking(booking, scenario, byEmail.get(scenario.creator)._id);
            if (!inspected || inspected.decision !== "REUSE")
                throw new Error(`G6 runtime safety check failed: final readback failed for ${scenario.label}`);
            const validated = inspected.live;
            console.log(JSON.stringify({ finalScenario: { scenario: scenario.label, purpose: scenarioPurpose(scenario.label), bookingReference: validated.booking.bookingReference, customer: scenario.customer, creator: scenario.creator, currency: validated.booking.currency, grossAmount: validated.reservation.amount, status: validated.booking.status, paymentStatus: validated.payment.status, reservationStatus: validated.reservation.status, slotStatus: validated.expectedSlotStatus, sessionStart: validated.slots[0]?.startTime, sessionEnd: validated.slots[validated.slots.length - 1]?.endTime, timing: scenario.timing, timingClassification: validated.timingClassification, attemptIdentity, customerWallet: { currency: validated.wallet.currency, available: validated.wallet.availableBalance, reserved: validated.wallet.reservedBalance, current: validated.wallet.currentBalance } } }));
        }
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
const CERTIFICATION_BOOKINGS = [
    "BKG-5AE3D33D7A58D33900A4CD92", "BKG-C0661901E758DC843E0A223F", "BKG-58D95D700B28591865136F3E",
    "BKG-17823DC680966DF68E41D7E3", "BKG-26F5742D967C77AADD2A703F", "BKG-9631B03D97A53BE167C4BD24",
    "BKG-CCA68C7995C12FB12CD23717", "BKG-B406225327990C725DD4BFDF", "BKG-16A28017C28AC8C7F82A179E",
    "BKG-1D727D9F26E8D803685BF7E7", "BKG-AB5E532DE1A9FC76F264C82F", "BKG-3BCD5AE04A209F9E53FD3E21",
    "BKG-FE1DE92D320B60A65D7A2D61",
];
const runCertification = async () => {
    // Booking setup performs only normal user/Creator APIs and may refresh expired
    // REQUESTED baselines before any Governance command is considered.
    await runSetup();
    const baseUrl = assertSafeRuntime();
    const admin = await G6AdminApi.login(baseUrl);
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri)
        throw new Error("G6 runtime safety check failed: MONGODB_URI is required for read-only certification verification");
    await mongoose_1.default.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    try {
        const users = await User_1.default.find({ email: { $in: DISPOSABLE_EMAILS } }).select("email governanceState status userCooldownUntil creatorCooldownUntil").lean();
        const byEmail = new Map(users.map((user) => [user.email, user]));
        if (byEmail.size !== DISPOSABLE_EMAILS.length)
            fail("all six disposable identities must resolve before certification");
        const ids = new Set(users.map((user) => user._id.toString()));
        const snapshot = async (stage, target) => {
            const targetIdentity = byEmail.get(target);
            const targetUser = await User_1.default.findById(targetIdentity._id)
                .select("email governanceState status userCooldownUntil creatorCooldownUntil")
                .lean();
            if (!targetUser)
                throw new Error(`G6 runtime safety check failed: target disappeared during ${stage}`);
            const bookings = await booking_model_1.Booking.find({ $or: [{ userId: targetUser._id }, { creatorId: targetUser._id }] }).lean();
            for (const booking of bookings) {
                if (!ids.has(booking.userId.toString()) || !ids.has(booking.creatorId.toString()))
                    fail(`non-whitelisted booking participant detected for ${target}`);
            }
            const bookingRows = await Promise.all(bookings.map(async (booking) => {
                const [payment, reservation, slots] = await Promise.all([payment_model_1.Payment.findOne({ bookingId: booking._id }).lean(), bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).lean(), slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }).lean()]);
                return { bookingReference: booking.bookingReference, status: booking.status, currency: booking.currency, grossAmount: booking.totalAmount, paymentStatus: payment?.status ?? null, reservationStatus: reservation?.status ?? null, reservationAmount: reservation?.amount ?? null, slotStatuses: slots.map((slot) => slot.status), startTimes: slots.map((slot) => slot.startTime) };
            }));
            const wallets = await wallet_model_1.Wallet.find({ userId: targetUser._id }).select("currency availableBalance reservedBalance").lean();
            console.log(JSON.stringify({ certificationSnapshot: { stage, target, governanceState: targetUser.governanceState, status: targetUser.status, wallets: wallets.map((wallet) => ({ currency: wallet.currency, available: wallet.availableBalance, reserved: wallet.reservedBalance })), bookings: bookingRows } }));
        };
        const execute = async (key, target, params = {}) => {
            assertDisposable(target);
            const user = byEmail.get(target);
            const targetId = key === "APPLY_CREATOR_COOLDOWN" || key === "REVOKE_CREATOR_COOLDOWN"
                ? (await creatorProfile_model_1.CreatorProfile.findOne({ userId: user._id, status: "active" }).select("_id").lean())?._id.toString()
                : user._id.toString();
            if (!targetId)
                throw new Error(`G6 runtime safety check failed: active Creator profile is required for ${key} on ${target}`);
            const reason = `G6 controlled runtime certification: ${key} for ${target}`;
            const normalizedParams = key === "APPLY_CREATOR_COOLDOWN" ? { days: 7, ...params } : params;
            await snapshot(`${key}:before-dry-run`, target);
            const dry = unwrapData(await admin.previewGovernanceAction({ key, target: { email: target, id: targetId }, params: normalizedParams, reason }));
            const confirmationToken = getString(dry, "confirmationToken");
            if (!confirmationToken)
                throw new Error(`G6 runtime safety check failed: dry-run did not return a confirmation token for ${key} on ${target}`);
            const executed = unwrapData(await admin.executeConfirmedGovernanceAction({ key, target: { email: target, id: targetId }, params: normalizedParams, reason, confirmationToken }));
            console.log(JSON.stringify({ certificationAction: { key, target, outcome: getString(executed, "outcome"), replay: isRecord(executed) ? executed.replay === true : false } }));
            await snapshot(`${key}:after-execution`, target);
            return { targetId, reason, confirmationToken, normalizedParams };
        };
        const replay = async (key, target, action) => {
            const replayed = unwrapData(await admin.executeConfirmedGovernanceAction({ key, target: { email: target, id: action.targetId }, params: action.normalizedParams, reason: action.reason, confirmationToken: action.confirmationToken }));
            if (!isRecord(replayed) || replayed.replay !== true)
                fail(`${key} replay did not return the authoritative replay result`);
            await snapshot(`${key}:after-replay`, target);
        };
        const suspended = await execute("SUSPEND_USER", "dispose@1.com");
        await replay("SUSPEND_USER", "dispose@1.com", suspended);
        await admin.get("/api/v1/admin/actions/logs");
        await admin.get("/api/v1/admin/audit-logs");
        await execute("ACTIVATE_USER", "dispose@1.com");
        const bannedUser = await execute("BAN_USER", "dispose@2.com");
        await replay("BAN_USER", "dispose@2.com", bannedUser);
        let bannedUserActivationBlocked = false;
        try {
            await execute("ACTIVATE_USER", "dispose@2.com");
        }
        catch (error) {
            bannedUserActivationBlocked = true;
            console.log(JSON.stringify({ expectedBlockedAction: { key: "ACTIVATE_USER", target: "dispose@2.com", error: error instanceof Error ? error.message : "blocked" } }));
        }
        if (!bannedUserActivationBlocked)
            fail("ordinary activation unexpectedly succeeded for banned user");
        await execute("RESET_USER_TRUST", "dispose@2.com");
        await execute("SUSPEND_USER", "dispose@4.com");
        await execute("ACTIVATE_USER", "dispose@4.com");
        const bannedCreator = await execute("BAN_USER", "dispose@5.com");
        let bannedCreatorActivationBlocked = false;
        try {
            await execute("ACTIVATE_USER", "dispose@5.com");
        }
        catch (error) {
            bannedCreatorActivationBlocked = true;
            console.log(JSON.stringify({ expectedBlockedAction: { key: "ACTIVATE_USER", target: "dispose@5.com", error: error instanceof Error ? error.message : "blocked" } }));
        }
        if (!bannedCreatorActivationBlocked)
            fail("ordinary activation unexpectedly succeeded for banned Creator");
        await execute("APPLY_CREATOR_COOLDOWN", "dispose@6.com");
        const revokedCooldown = await execute("REVOKE_CREATOR_COOLDOWN", "dispose@6.com");
        await replay("REVOKE_CREATOR_COOLDOWN", "dispose@6.com", revokedCooldown);
        await execute("RESET_USER_TRUST", "dispose@3.com");
        const mismatchDry = unwrapData(await admin.previewGovernanceAction({ key: "SUSPEND_USER", target: { email: "dispose@3.com", id: byEmail.get("dispose@3.com")._id.toString() }, params: {}, reason: "G6 confirmation mismatch proof" }));
        const mismatchToken = getString(mismatchDry, "confirmationToken");
        if (!mismatchToken)
            throw new Error("G6 runtime safety check failed: confirmation mismatch dry-run did not return a token");
        let mismatchBlocked = false;
        try {
            await admin.executeConfirmedGovernanceAction({ key: "SUSPEND_USER", target: { email: "dispose@1.com", id: byEmail.get("dispose@1.com")._id.toString() }, params: {}, reason: "G6 confirmation mismatch proof", confirmationToken: mismatchToken });
        }
        catch (error) {
            mismatchBlocked = true;
            console.log(JSON.stringify({ confirmationMismatch: { rejected: true, error: error instanceof Error ? error.message : "rejected" } }));
        }
        if (!mismatchBlocked)
            fail("confirmation mismatch unexpectedly executed");
        await admin.get("/api/v1/admin/actions/logs");
        await admin.get("/api/v1/admin/audit-logs");
        console.log(JSON.stringify({ certification: { completedStages: ["customer-suspension", "customer-ban", "creator-suspension", "creator-ban", "creator-cooldown", "trust-reset", "confirmation-mismatch"], designatedBookings: CERTIFICATION_BOOKINGS } }));
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
const runTargetedCertification = async () => {
    const baseUrl = assertSafeRuntime();
    const missing = [...TARGETED_SESSION_EMAILS, "admin@test.com"].filter((email) => email === "admin@test.com" ? !process.env.G6_ADMIN_PASSWORD : !process.env[PASSWORD_VARIABLES[email]]);
    if (missing.length)
        fail(`missing required authenticated runtime credentials for: ${missing.join(", ")}`);
    const sessions = new Map();
    for (const email of TARGETED_SESSION_EMAILS)
        sessions.set(email, await DisposableSession.login(baseUrl, email, process.env[PASSWORD_VARIABLES[email]]));
    const admin = await G6AdminApi.login(baseUrl);
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri)
        throw new Error("G6 runtime safety check failed: MONGODB_URI is required for read-only targeted certification readback");
    await mongoose_1.default.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    try {
        const users = await User_1.default.find({ email: { $in: DISPOSABLE_EMAILS } }).select("email role status governanceState userCooldownUntil creatorCooldownUntil creatorCooldownReason creatorCooldownTriggeredAt").lean();
        const byEmail = new Map(users.map((user) => [user.email, user]));
        if (byEmail.size !== DISPOSABLE_EMAILS.length)
            fail("all six disposable identities must resolve");
        for (const email of ["dispose@1.com", "dispose@3.com", "dispose@4.com"]) {
            const user = byEmail.get(email);
            if (user.governanceState !== "ACTIVE" || user.status !== "active" || user.userCooldownUntil || user.creatorCooldownUntil)
                fail(`${email} must be ACTIVE with no cooldown before targeted certification`);
        }
        const cooldownTarget = byEmail.get("dispose@6.com");
        const cooldownProfile = await creatorProfile_model_1.CreatorProfile.findOne({ userId: cooldownTarget._id, status: "active" }).select("_id creatorCooldownUntil").lean();
        if (!cooldownProfile || cooldownTarget.governanceState !== "ACTIVE" || cooldownTarget.status !== "active" || cooldownTarget.userCooldownUntil)
            throw new Error("G6 runtime safety check failed: dispose@6.com must remain ACTIVE with no user cooldown before targeted certification");
        const targetedCooldownReason = "G6 targeted runtime certification: APPLY_CREATOR_COOLDOWN for dispose@6.com";
        const cooldownIsActive = Boolean(cooldownTarget.creatorCooldownUntil && cooldownTarget.creatorCooldownUntil.getTime() > Date.now());
        const [targetedCooldownAction, targetedCooldownAudit] = cooldownIsActive
            ? await Promise.all([
                adminActionLog_model_1.default.findOne({ actionKey: "APPLY_CREATOR_COOLDOWN", targetId: cooldownProfile._id, status: "SUCCESS", reason: targetedCooldownReason }).sort({ createdAt: -1 }).lean(),
                auditLog_model_1.AuditLog.findOne({ action: "CREATOR_COOLDOWN_APPLIED", entityType: "USER", entityId: cooldownTarget._id, "after.reason": targetedCooldownReason }).sort({ createdAt: -1 }).lean(),
            ])
            : [null, null];
        const resumeCooldown = cooldownIsActive && cooldownTarget.creatorCooldownReason === targetedCooldownReason && Boolean(cooldownTarget.creatorCooldownTriggeredAt) && Boolean(targetedCooldownAction) && Boolean(targetedCooldownAudit) && cooldownProfile.creatorCooldownUntil?.getTime() === cooldownTarget.creatorCooldownUntil?.getTime();
        if (cooldownIsActive && !resumeCooldown)
            fail("dispose@6.com has an active Creator cooldown not safely attributable to this targeted G6 run");
        console.log(JSON.stringify({ targetedCooldownResume: { mode: resumeCooldown ? "RESUME" : "FRESH", cooldownUntil: cooldownTarget.creatorCooldownUntil ?? null, actionLogConfirmed: Boolean(targetedCooldownAction), auditLogConfirmed: Boolean(targetedCooldownAudit) } }));
        console.log(JSON.stringify({ targetedIdentityIsolation: { cooldownTarget: "dispose@6.com", cooldownCustomers: ["dispose@1.com"], cooldownOutgoingCounterparty: "dispose@4.com", banTarget: "dispose@4.com", banCustomer: "dispose@3.com", banOutgoingCounterparty: "dispose@6.com" } }));
        const usedSlots = new Set();
        const liveRead = async (bookingId) => {
            const booking = await booking_model_1.Booking.findById(bookingId).lean();
            if (!booking)
                throw new Error("G6 runtime safety check failed: booking disappeared during targeted certification");
            const [payment, reservation, slots, wallet, releases] = await Promise.all([
                payment_model_1.Payment.findOne({ bookingId }).lean(), bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId }).lean(), slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }).lean(),
                wallet_model_1.Wallet.findOne({ userId: booking.userId, currency: booking.currency }).select("currency availableBalance reservedBalance").lean(),
                ledgerEntry_model_1.LedgerEntry.find({ bookingId, source: "BOOKING_WALLET_RESERVATION_RELEASE" }).select("direction account amount currency transactionId").lean(),
            ]);
            if (!payment || !reservation || !wallet)
                throw new Error(`G6 runtime safety check failed: missing financial authority for ${booking.bookingReference}`);
            if (!booking.bookingReference || typeof booking.totalAmount !== "number" || !booking.currency || !payment.status || typeof payment.amount !== "number" || !payment.currency || !reservation.status || typeof reservation.amount !== "number" || !reservation.currency || !wallet.currency || typeof wallet.availableBalance !== "number" || typeof wallet.reservedBalance !== "number" || slots.some((slot) => !slot.status || !slot.startTime || !slot.endTime) || releases.some((entry) => !entry.direction || !entry.account || typeof entry.amount !== "number" || !entry.currency))
                throw new Error(`G6 runtime safety check failed: incomplete authoritative read for ${bookingId}`);
            return {
                booking: { ...booking, bookingReference: booking.bookingReference },
                payment: { status: payment.status, amount: payment.amount, currency: payment.currency },
                reservation: { status: reservation.status, amount: reservation.amount, currency: reservation.currency },
                slots: slots.map((slot) => ({ status: slot.status, startTime: slot.startTime, endTime: slot.endTime })),
                wallet: { currency: wallet.currency, availableBalance: wallet.availableBalance, reservedBalance: wallet.reservedBalance },
                releases: releases.map((entry) => ({ direction: entry.direction, account: entry.account, amount: entry.amount, currency: entry.currency, transactionId: entry.transactionId ?? undefined })),
            };
        };
        const assertLive = async (bookingId, expected) => {
            const state = await liveRead(bookingId);
            const slotStatus = expected === "REQUESTED" ? "LOCKED" : "BOOKED";
            if (state.booking.status !== expected || state.payment.status !== "AUTHORIZED" || state.reservation.status !== "ACTIVE" || state.slots.some((slot) => slot.status !== slotStatus) || state.wallet.reservedBalance < state.reservation.amount)
                fail(`live baseline failed for ${state.booking.bookingReference}`);
            return state;
        };
        const ensureSlot = async (creator, creatorId, service, timing) => {
            const now = new Date();
            const boundary = now.getTime() + 24 * 60 * 60 * 1000;
            const search = async () => {
                const availabilityIds = (await availability_model_1.Availability.find({ creatorId, serviceId: service._id, status: "ACTIVE" }).select("_id").lean()).map((row) => row._id);
                return slot_model_1.Slot.find({ creatorId, serviceId: service._id, availabilityId: { $in: availabilityIds }, status: "AVAILABLE", startTime: timing === "GT24" ? { $gt: new Date(boundary) } : { $gt: now, $lte: new Date(boundary) } }).sort({ startTime: 1 }).lean();
            };
            let slots = await search();
            let slot = slots.find((row) => !usedSlots.has(String(row._id)));
            if (!slot) {
                const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (timing === "GT24" ? 2 : 1)));
                const start = new Date(day.getTime() + 9 * 60 * 60 * 1000);
                const end = new Date(start.getTime() + service.durationMinutes * 60000);
                await sessions.get(creator).post("/api/v1/creator/availability", { serviceId: String(service._id), date: start.toISOString().slice(0, 10), startTime: start.toISOString().slice(11, 16), endTime: end.toISOString().slice(11, 16), timezone: "UTC" });
                slots = await search();
                slot = slots.find((row) => !usedSlots.has(String(row._id)));
            }
            if (!slot)
                throw new Error(`G6 runtime safety check failed: no safe ${timing} slot for ${creator}`);
            usedSlots.add(String(slot._id));
            return slot;
        };
        const create = async (label, customer, creator, timing) => {
            const customerUser = byEmail.get(customer);
            const creatorUser = byEmail.get(creator);
            const services = await creatorService_model_1.CreatorService.find({ creatorId: creatorUser._id, isActive: true }).sort({ createdAt: 1 }).lean();
            for (const service of services) {
                if (!service.currency || typeof service.durationMinutes !== "number")
                    continue;
                const wallet = await wallet_model_1.Wallet.findOne({ userId: customerUser._id, currency: service.currency }).select("availableBalance reservedBalance currency").lean();
                if (!wallet)
                    continue;
                const slot = await ensureSlot(creator, creatorUser._id, service, timing);
                const previewResponse = await sessions.get(customer).post("/api/v1/bookings/pricing-preview", { serviceId: String(service._id), slotIds: [String(slot._id)] });
                const preview = isRecord(previewResponse) && isRecord(previewResponse.preview) ? previewResponse.preview : null;
                const required = preview && typeof preview.grossFundingAmount === "number" ? preview.grossFundingAmount : null;
                if (!preview || preview.currency !== service.currency || !isRecord(preview.walletFunding) || preview.walletFunding.sufficient !== true || required === null || wallet.availableBalance < required)
                    continue;
                let booking = null;
                for (let attempt = 1; attempt <= 12 && !booking; attempt += 1) {
                    const key = `g6-targeted-${label.toLowerCase()}-attempt-${attempt}`;
                    const identity = (0, bookingWalletReservationIdentity_util_1.deriveBookingRequestIdentity)({ userId: String(customerUser._id), serviceId: String(service._id), slotIds: [String(slot._id)], method: paymentMethod_enum_1.PaymentMethod.WALLET, idempotencyKey: key });
                    const existing = await booking_model_1.Booking.findOne({ userId: customerUser._id, bookingRequestKey: identity.bookingRequestKey }).lean();
                    if (existing)
                        continue;
                    await sessions.get(customer).post("/api/v1/bookings/request", { serviceId: String(service._id), slotIds: [String(slot._id)], paymentMethod: "WALLET" }, { "Idempotency-Key": key });
                    booking = await booking_model_1.Booking.findOne({ userId: customerUser._id, bookingRequestKey: identity.bookingRequestKey }).lean();
                }
                if (!booking)
                    throw new Error(`G6 runtime safety check failed: no bounded booking identity available for ${label}`);
                if (timing !== "REQUESTED")
                    await sessions.get(creator).post(`/api/v1/creator/bookings/${String(booking._id)}/decision`, { decision: "ACCEPT" });
                const state = await assertLive(booking._id, timing === "REQUESTED" ? "REQUESTED" : "CONFIRMED");
                console.log(JSON.stringify({ targetedBaseline: { label, bookingReference: state.booking.bookingReference, customer, creator, timing, currency: state.booking.currency, amount: state.reservation.amount, wallet: { available: state.wallet.availableBalance, reserved: state.wallet.reservedBalance } } }));
                return state;
            }
            throw new Error(`G6 runtime safety check failed: no funded active service/currency pairing for ${label}; customer=${customer}; creator=${creator}`);
        };
        const invoke = async (key, target) => {
            const user = byEmail.get(target);
            const creatorProfile = key.includes("COOLDOWN") ? await creatorProfile_model_1.CreatorProfile.findOne({ userId: user._id, status: "active" }).select("_id").lean() : null;
            const targetId = key.includes("COOLDOWN") ? (creatorProfile ? String(creatorProfile._id) : "") : String(user._id);
            if (!targetId)
                throw new Error(`G6 runtime safety check failed: missing active Creator profile for ${key}`);
            const params = key === "APPLY_CREATOR_COOLDOWN" ? { days: 7 } : {};
            const reason = `G6 targeted runtime certification: ${key} for ${target}`;
            const dry = unwrapData(await admin.previewGovernanceAction({ key, target: { email: target, id: targetId }, params, reason }));
            const token = getString(dry, "confirmationToken");
            if (!token)
                throw new Error(`G6 runtime safety check failed: dry-run did not issue confirmation for ${key}`);
            const result = unwrapData(await admin.executeConfirmedGovernanceAction({ key, target: { email: target, id: targetId }, params, reason, confirmationToken: token }));
            return { targetId, params, reason, token, result };
        };
        const replay = async (key, target, action) => {
            const result = unwrapData(await admin.executeConfirmedGovernanceAction({ key, target: { email: target, id: action.targetId }, params: action.params, reason: action.reason, confirmationToken: action.token }));
            if (!isRecord(result) || result.replay !== true)
                fail(`${key} replay did not return replay=true`);
        };
        const assertBlockedBooking = async (label, customer, creator) => {
            const customerUser = byEmail.get(customer);
            const creatorUser = byEmail.get(creator);
            const services = await creatorService_model_1.CreatorService.find({ creatorId: creatorUser._id, isActive: true }).sort({ createdAt: 1 }).lean();
            const customerWallets = await wallet_model_1.Wallet.find({ userId: customerUser._id, availableBalance: { $gt: 0 } }).select("currency availableBalance reservedBalance").lean();
            const walletByCurrency = new Map(customerWallets.filter((wallet) => Boolean(wallet.currency)).map((wallet) => [wallet.currency, wallet]));
            const service = services.find((candidate) => Boolean(candidate.currency) && typeof candidate.durationMinutes === "number" && walletByCurrency.has(candidate.currency));
            if (!service || !service.currency || typeof service.durationMinutes !== "number") {
                throw new Error(`G6 runtime safety check failed: no compatible funded Wallet/service precondition for blocked proof ${label}; customer=${customer}; walletCurrencies=${customerWallets.map((wallet) => wallet.currency).join(",") || "NONE"}; creator=${creator}; serviceCurrencies=${services.map((candidate) => candidate.currency).join(",") || "NONE"}`);
            }
            const slot = await ensureSlot(creator, creatorUser._id, service, "GT24");
            const key = `g6-targeted-blocked-${label.toLowerCase()}`;
            const identity = (0, bookingWalletReservationIdentity_util_1.deriveBookingRequestIdentity)({ userId: String(customerUser._id), serviceId: String(service._id), slotIds: [String(slot._id)], method: paymentMethod_enum_1.PaymentMethod.WALLET, idempotencyKey: key });
            const before = walletByCurrency.get(service.currency);
            let blocked = false;
            let error = "";
            try {
                await sessions.get(customer).post("/api/v1/bookings/request", { serviceId: String(service._id), slotIds: [String(slot._id)], paymentMethod: "WALLET" }, { "Idempotency-Key": key });
            }
            catch (cause) {
                blocked = true;
                error = cause instanceof Error ? cause.message : "blocked";
            }
            const [after, booking, slotState] = await Promise.all([wallet_model_1.Wallet.findOne({ userId: customerUser._id, currency: service.currency }).select("availableBalance reservedBalance").lean(), booking_model_1.Booking.findOne({ userId: customerUser._id, bookingRequestKey: identity.bookingRequestKey }).lean(), slot_model_1.Slot.findById(slot._id).lean()]);
            if (!blocked || booking || !after || before.availableBalance !== after.availableBalance || before.reservedBalance !== after.reservedBalance || slotState?.status !== "AVAILABLE")
                fail(`blocked booking residue or unexpected success for ${label}; httpError=${error || "request unexpectedly succeeded"}`);
            console.log(JSON.stringify({ blockedBooking: { label, customer, creator, currency: service.currency, availableBefore: before.availableBalance, reservedBefore: before.reservedBalance, error, residue: "NONE" } }));
        };
        // Cooldown first: U4 remains the active outgoing counterparty; it is banned only afterwards.
        let cdExisting;
        let cdAccept;
        if (resumeCooldown) {
            const [existingBooking, acceptanceBooking] = await Promise.all([
                booking_model_1.Booking.findOne({ bookingReference: "BKG-3CDD807659F52E0E61A32249" }).select("_id").lean(),
                booking_model_1.Booking.findOne({ bookingReference: "BKG-E9DB7AD58EE868FD7909379E" }).select("_id").lean(),
            ]);
            if (!existingBooking || !acceptanceBooking)
                throw new Error("G6 runtime safety check failed: targeted cooldown resume baselines are missing; do not recreate while cooldown is active");
            cdExisting = await assertLive(existingBooking._id, "CONFIRMED");
            cdAccept = await assertLive(acceptanceBooking._id, "REQUESTED");
            if (cdExisting.booking.creatorId.toString() !== cooldownTarget._id.toString() || cdAccept.booking.creatorId.toString() !== cooldownTarget._id.toString())
                fail("targeted cooldown resume baselines do not belong to dispose@6.com");
            console.log(JSON.stringify({ targetedCooldownResumeBaselines: { existing: cdExisting.booking.bookingReference, acceptance: cdAccept.booking.bookingReference, status: "VALID" } }));
        }
        else {
            cdExisting = await create("CDR_EXISTING", "dispose@1.com", "dispose@6.com", "LT24");
            cdAccept = await create("CDR_ACCEPT", "dispose@1.com", "dispose@6.com", "REQUESTED");
            const cdBefore = await liveRead(cdExisting.booking._id);
            await invoke("APPLY_CREATOR_COOLDOWN", "dispose@6.com");
            const cdAfter = await liveRead(cdExisting.booking._id);
            if (cdBefore.booking.status !== cdAfter.booking.status || cdBefore.payment.status !== cdAfter.payment.status || cdBefore.reservation.status !== cdAfter.reservation.status || cdBefore.wallet.availableBalance !== cdAfter.wallet.availableBalance || cdBefore.wallet.reservedBalance !== cdAfter.wallet.reservedBalance || cdBefore.slots.some((slot, index) => slot.status !== cdAfter.slots[index]?.status) || cdAfter.releases.length !== cdBefore.releases.length)
                fail("Creator cooldown changed an existing booking or financial state");
            await assertBlockedBooking("COOLDOWN_INCOMING", "dispose@3.com", "dispose@6.com");
        }
        let acceptanceBlocked = false;
        try {
            await sessions.get("dispose@6.com").post(`/api/v1/creator/bookings/${String(cdAccept.booking._id)}/decision`, { decision: "ACCEPT" });
        }
        catch {
            acceptanceBlocked = true;
        }
        if (!acceptanceBlocked)
            fail("Creator cooldown did not block acceptance");
        await assertLive(cdAccept.booking._id, "REQUESTED");
        await assertBlockedBooking("COOLDOWN_OUTGOING", "dispose@6.com", "dispose@4.com");
        const revoke = await invoke("REVOKE_CREATOR_COOLDOWN", "dispose@6.com");
        await replay("REVOKE_CREATOR_COOLDOWN", "dispose@6.com", revoke);
        const cooldownUser = await User_1.default.findById(byEmail.get("dispose@6.com")._id).select("governanceState status creatorCooldownUntil userCooldownUntil").lean();
        if (!cooldownUser || cooldownUser.governanceState !== "ACTIVE" || cooldownUser.status !== "active" || cooldownUser.creatorCooldownUntil)
            fail("Creator cooldown revoke did not restore canonical state");
        await sessions.get("dispose@6.com").post(`/api/v1/creator/bookings/${String(cdAccept.booking._id)}/decision`, { decision: "ACCEPT" });
        await assertLive(cdAccept.booking._id, "CONFIRMED");
        const cbr1 = await create("CBR1", "dispose@3.com", "dispose@4.com", "REQUESTED");
        const cbr2 = await create("CBR2", "dispose@3.com", "dispose@4.com", "LT24");
        const cbr3 = await create("CBR3", "dispose@3.com", "dispose@4.com", "GT24");
        await assertLive(cbr1.booking._id, "REQUESTED");
        await assertLive(cbr2.booking._id, "CONFIRMED");
        await assertLive(cbr3.booking._id, "CONFIRMED");
        const ban = await invoke("BAN_USER", "dispose@4.com");
        await replay("BAN_USER", "dispose@4.com", ban);
        const [after1, after2, after3, bannedUser] = await Promise.all([liveRead(cbr1.booking._id), liveRead(cbr2.booking._id), liveRead(cbr3.booking._id), User_1.default.findById(byEmail.get("dispose@4.com")._id).select("governanceState status").lean()]);
        const released = (state) => state.booking.status === "CANCELLED" && state.payment.status === "CANCELLED" && state.reservation.status === "RELEASED" && state.slots.every((slot) => slot.status === "AVAILABLE") && state.releases.length === 2 && state.releases.some((entry) => entry.direction === "DEBIT" && entry.account === "WALLET_RESERVED" && entry.amount === state.reservation.amount) && state.releases.some((entry) => entry.direction === "CREDIT" && entry.account === "WALLET_AVAILABLE" && entry.amount === state.reservation.amount);
        if (!bannedUser || bannedUser.governanceState !== "BANNED" || bannedUser.status !== "banned" || !released(after1) || !released(after3) || after2.booking.status !== "CONFIRMED" || after2.payment.status !== "AUTHORIZED" || after2.reservation.status !== "ACTIVE" || after2.slots.some((slot) => slot.status !== "BOOKED") || after2.releases.length)
            fail("Creator ban matrix failed authoritative postconditions");
        await assertBlockedBooking("BAN_OUTGOING", "dispose@4.com", "dispose@6.com");
        const activateDry = unwrapData(await admin.previewGovernanceAction({ key: "ACTIVATE_USER", target: { email: "dispose@4.com", id: String(byEmail.get("dispose@4.com")._id) }, params: {}, reason: "G6 targeted ordinary activation rejection" }));
        if (!isRecord(activateDry) || activateDry.outcome !== "BLOCKED")
            fail("ordinary activation did not return an explicit blocked outcome for banned Creator");
        const [actions, audits] = await Promise.all([adminActionLog_model_1.default.find({ actionKey: { $in: ["BAN_USER", "APPLY_CREATOR_COOLDOWN", "REVOKE_CREATOR_COOLDOWN"] } }).lean(), auditLog_model_1.AuditLog.find({ entityType: "USER", entityId: { $in: [byEmail.get("dispose@4.com")._id, byEmail.get("dispose@6.com")._id] } }).lean()]);
        if (!actions.length || !audits.length)
            fail("targeted action/audit log readback missing");
        console.log(JSON.stringify({ targetedCertification: { cooldown: { existing: cdExisting.booking.bookingReference, acceptance: cdAccept.booking.bookingReference, applyReplay: false, revokeReplay: true }, creatorBan: { requested: after1.booking.bookingReference, protected: after2.booking.bookingReference, future: after3.booking.bookingReference, replay: true, creatorParticipation: "creatorId matched governed User" }, logs: { adminActionLog: actions.length, auditLog: audits.length } } }));
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
/**
 * Completes only the two remaining G6 runtime items after the targeted run
 * has legitimately banned U4.  It deliberately does not authenticate U4/U5:
 * a fresh session for either banned account would be a security bypass, not a
 * certification step.  The command is fail-closed if either fixed cooldown
 * baseline is no longer in its pre-action state.
 */
const runFinishRemainingCertification = async () => {
    const baseUrl = assertSafeRuntime();
    const u6Password = process.env.G6_CREATOR6_PASSWORD;
    const mongoUri = process.env.MONGODB_URI;
    if (!u6Password || !process.env.G6_ADMIN_PASSWORD) {
        fail("G6_CREATOR6_PASSWORD and G6_ADMIN_PASSWORD are required for the cooldown closure");
    }
    const [u6Session, admin] = await Promise.all([
        DisposableSession.login(baseUrl, "dispose@6.com", u6Password),
        G6AdminApi.login(baseUrl),
    ]);
    if (!mongoUri)
        fail("MONGODB_URI is required for read-only cooldown certification readback");
    await mongoose_1.default.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    try {
        const cooldownReason = "G6 targeted runtime certification: APPLY_CREATOR_COOLDOWN for dispose@6.com";
        const u6 = await User_1.default.findOne({ email: "dispose@6.com" })
            .select("email status governanceState userCooldownUntil creatorCooldownUntil creatorCooldownReason creatorCooldownTriggeredAt")
            .lean();
        const u6Profile = u6
            ? await creatorProfile_model_1.CreatorProfile.findOne({ userId: u6._id, status: "active" }).select("_id creatorCooldownUntil").lean()
            : null;
        if (!u6 || !u6Profile) {
            fail("dispose@6.com must resolve to an active Creator profile; no revoke was attempted");
        }
        const targetU6 = u6;
        const targetU6Profile = u6Profile;
        if (targetU6.governanceState !== "ACTIVE" || targetU6.status !== "active" || targetU6.userCooldownUntil || !targetU6.creatorCooldownUntil || targetU6.creatorCooldownUntil.getTime() <= Date.now() || targetU6.creatorCooldownReason !== cooldownReason || !targetU6.creatorCooldownTriggeredAt || targetU6Profile.creatorCooldownUntil?.getTime() !== targetU6.creatorCooldownUntil.getTime()) {
            fail("dispose@6.com is not in the exact active targeted-cooldown state; no revoke was attempted");
        }
        const [applyLog, applyAudit] = await Promise.all([
            adminActionLog_model_1.default.findOne({ actionKey: "APPLY_CREATOR_COOLDOWN", targetId: targetU6Profile._id, status: "SUCCESS", reason: cooldownReason }).lean(),
            auditLog_model_1.AuditLog.findOne({ action: "CREATOR_COOLDOWN_APPLIED", entityType: "USER", entityId: targetU6._id, "after.reason": cooldownReason }).lean(),
        ]);
        if (!applyLog || !applyAudit)
            fail("active U6 cooldown is not safely attributable to the targeted G6 run");
        const readBooking = async (reference) => {
            const booking = await booking_model_1.Booking.findOne({ bookingReference: reference }).lean();
            if (!booking)
                fail(`cooldown baseline booking is missing: ${reference}`);
            const safeBooking = booking;
            const [payment, reservation, slots, wallet, releases, ledgerEntryCount] = await Promise.all([
                payment_model_1.Payment.findOne({ bookingId: safeBooking._id }).select("status").lean(),
                bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: safeBooking._id }).select("status amount").lean(),
                slot_model_1.Slot.find({ _id: { $in: safeBooking.slotIds } }).select("status").lean(),
                wallet_model_1.Wallet.findOne({ userId: safeBooking.userId, currency: safeBooking.currency }).select("availableBalance reservedBalance").lean(),
                ledgerEntry_model_1.LedgerEntry.find({ bookingId: safeBooking._id, source: "BOOKING_WALLET_RESERVATION_RELEASE" }).select("_id").lean(),
                ledgerEntry_model_1.LedgerEntry.countDocuments({ bookingId: safeBooking._id }),
            ]);
            if (!payment || !reservation || !wallet || typeof reservation.amount !== "number" || typeof wallet.availableBalance !== "number" || typeof wallet.reservedBalance !== "number")
                fail(`cooldown baseline financial read is incomplete: ${reference}`);
            return {
                id: safeBooking._id,
                creatorId: safeBooking.creatorId,
                state: { reference, status: safeBooking.status, payment: payment.status, reservation: reservation.status, slotStates: slots.map((slot) => slot.status ?? ""), wallet: { available: wallet.availableBalance, reserved: wallet.reservedBalance }, releaseEntries: releases.length, ledgerEntryCount },
            };
        };
        const assertBaseline = (state, expected) => {
            const expectedSlot = expected === "REQUESTED" ? "LOCKED" : "BOOKED";
            if (state.status !== expected || state.payment !== "AUTHORIZED" || state.reservation !== "ACTIVE" || state.slotStates.some((status) => status !== expectedSlot) || state.releaseEntries !== 0) {
                fail(`cooldown baseline is no longer safe for certification: ${state.reference} status=${state.status} payment=${state.payment} reservation=${state.reservation} slots=${state.slotStates.join(",") || "NONE"} releases=${state.releaseEntries}`);
            }
        };
        const existingBefore = await readBooking("BKG-3CDD807659F52E0E61A32249");
        const acceptanceBefore = await readBooking("BKG-E9DB7AD58EE868FD7909379E");
        if (existingBefore.creatorId.toString() !== targetU6._id.toString() || acceptanceBefore.creatorId.toString() !== targetU6._id.toString())
            fail("fixed cooldown baselines are not owned by dispose@6.com");
        assertBaseline(existingBefore.state, "CONFIRMED");
        assertBaseline(acceptanceBefore.state, "REQUESTED");
        let acceptanceError = "";
        try {
            await u6Session.post(`/api/v1/creator/bookings/${String(acceptanceBefore.id)}/decision`, { decision: "ACCEPT" });
        }
        catch (error) {
            acceptanceError = error instanceof Error ? error.message : "blocked";
        }
        if (!acceptanceError)
            fail("Creator cooldown did not block acceptance");
        const [existingAfterBlocked, acceptanceAfterBlocked] = await Promise.all([
            readBooking(existingBefore.state.reference),
            readBooking(acceptanceBefore.state.reference),
        ]);
        assertBaseline(existingAfterBlocked.state, "CONFIRMED");
        assertBaseline(acceptanceAfterBlocked.state, "REQUESTED");
        if (JSON.stringify(existingBefore.state) !== JSON.stringify(existingAfterBlocked.state))
            fail("Creator cooldown acceptance attempt changed the existing booking baseline");
        if (JSON.stringify(acceptanceBefore.state) !== JSON.stringify(acceptanceAfterBlocked.state))
            fail("Creator cooldown acceptance attempt changed the pending booking baseline");
        const revokeReason = "G6 targeted runtime certification: REVOKE_CREATOR_COOLDOWN for dispose@6.com";
        const revokeAuditCountBefore = await auditLog_model_1.AuditLog.countDocuments({ action: "CREATOR_COOLDOWN_REVOKED", entityType: "USER", entityId: targetU6._id });
        const dry = unwrapData(await admin.previewGovernanceAction({ key: "REVOKE_CREATOR_COOLDOWN", target: { email: "dispose@6.com", id: String(targetU6Profile._id) }, params: {}, reason: revokeReason }));
        const confirmationToken = getString(dry, "confirmationToken");
        if (!confirmationToken)
            fail("REVOKE_CREATOR_COOLDOWN dry-run did not return a confirmation token");
        const execution = unwrapData(await admin.executeConfirmedGovernanceAction({ key: "REVOKE_CREATOR_COOLDOWN", target: { email: "dispose@6.com", id: String(targetU6Profile._id) }, params: {}, reason: revokeReason, confirmationToken: confirmationToken }));
        const replay = unwrapData(await admin.executeConfirmedGovernanceAction({ key: "REVOKE_CREATOR_COOLDOWN", target: { email: "dispose@6.com", id: String(targetU6Profile._id) }, params: {}, reason: revokeReason, confirmationToken: confirmationToken }));
        if (!isRecord(replay) || replay.replay !== true)
            fail("REVOKE_CREATOR_COOLDOWN replay did not return replay=true");
        const [u6After, profileAfter, existingAfterRevoke, acceptanceAfterRevoke, revokeAuditCountAfter, revokeLogs] = await Promise.all([
            User_1.default.findById(targetU6._id).select("status governanceState userCooldownUntil creatorCooldownUntil").lean(),
            creatorProfile_model_1.CreatorProfile.findById(targetU6Profile._id).select("creatorCooldownUntil").lean(),
            readBooking(existingBefore.state.reference),
            readBooking(acceptanceBefore.state.reference),
            auditLog_model_1.AuditLog.countDocuments({ action: "CREATOR_COOLDOWN_REVOKED", entityType: "USER", entityId: targetU6._id }),
            adminActionLog_model_1.default.find({ actionKey: "REVOKE_CREATOR_COOLDOWN", targetId: targetU6Profile._id, status: "SUCCESS", reason: revokeReason }).lean(),
        ]);
        if (!u6After || !profileAfter || u6After.governanceState !== "ACTIVE" || u6After.status !== "active" || u6After.userCooldownUntil || u6After.creatorCooldownUntil || profileAfter.creatorCooldownUntil || revokeAuditCountAfter !== revokeAuditCountBefore + 1 || revokeLogs.length !== 1)
            fail("Creator cooldown revoke did not preserve the exact canonical/replay-safe result");
        assertBaseline(existingAfterRevoke.state, "CONFIRMED");
        assertBaseline(acceptanceAfterRevoke.state, "REQUESTED");
        if (JSON.stringify(existingBefore.state) !== JSON.stringify(existingAfterRevoke.state))
            fail("Creator cooldown revoke changed the existing booking or financial baseline");
        await u6Session.post(`/api/v1/creator/bookings/${String(acceptanceBefore.id)}/decision`, { decision: "ACCEPT" });
        const acceptanceRestored = await readBooking(acceptanceBefore.state.reference);
        if (acceptanceRestored.state.status !== "CONFIRMED" || acceptanceRestored.state.payment !== "AUTHORIZED" || acceptanceRestored.state.reservation !== "ACTIVE" || acceptanceRestored.state.slotStates.some((status) => status !== "BOOKED") || acceptanceRestored.state.releaseEntries !== 0)
            fail("Creator acceptance was not restored after cooldown revoke");
        const [activeUsers, activeProfiles] = await Promise.all([
            User_1.default.find({ email: { $in: DISPOSABLE_EMAILS }, governanceState: "ACTIVE", status: "active" }).select("_id email").lean(),
            creatorProfile_model_1.CreatorProfile.find({ status: "active" }).select("userId").lean(),
        ]);
        const activeProfileUserIds = new Set(activeProfiles.map((profile) => String(profile.userId)));
        const activeCreatorEmails = activeUsers.filter((user) => activeProfileUserIds.has(String(user._id))).map((user) => user.email).filter((email) => typeof email === "string").sort();
        const banGateFeasible = activeCreatorEmails.length >= 2;
        console.log(JSON.stringify({
            finishRemainingCertification: {
                cooldown: { existingBookingUnchanged: existingAfterRevoke.state.reference, acceptanceBlockedError: acceptanceError, revokeExecution: isRecord(execution) ? { replay: execution.replay === true } : {}, revokeReplay: true, revokeAuditCountDelta: revokeAuditCountAfter - revokeAuditCountBefore, capabilityRestored: acceptanceRestored.state.reference },
                banAsCustomerFeasibility: { activeDisposableCreators: activeCreatorEmails, feasible: banGateFeasible, conclusion: banGateFeasible ? "SAFE_MATRIX_AVAILABLE" : "ADDITIONAL_DISPOSABLE_CREATOR_REQUIRED" },
            },
        }));
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
/**
 * One-process G6 proof that a Creator's retained pre-ban session cannot make
 * an outgoing booking after BAN_USER. U6 is deliberately left BANNED on
 * success; this command must never be used to make the account reusable.
 */
const runFinalBannedCreatorCustomerProof = async () => {
    const baseUrl = assertSafeRuntime();
    const u6Password = process.env.G6_CREATOR6_PASSWORD;
    const u7Password = process.env.G6_CREATOR7_PASSWORD;
    const mongoUri = process.env.MONGODB_URI;
    if (!u6Password || !u7Password || !process.env.G6_ADMIN_PASSWORD || !mongoUri) {
        fail("G6_CREATOR6_PASSWORD, G6_CREATOR7_PASSWORD, G6_ADMIN_PASSWORD, and MONGODB_URI are required for the final ban-gate proof");
    }
    // Sessions are established while both Creators are active. U6's token is
    // retained only in memory and intentionally used once after the ban.
    const [u6Session, u7Session, admin] = await Promise.all([
        DisposableSession.login(baseUrl, "dispose@6.com", u6Password),
        DisposableSession.login(baseUrl, FINAL_BAN_GATE_COUNTERPARTY, u7Password),
        G6AdminApi.login(baseUrl),
    ]);
    await mongoose_1.default.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    try {
        const [rawU6, rawU7] = await Promise.all([
            User_1.default.findOne({ email: "dispose@6.com" }).select("email role status governanceState userCooldownUntil creatorCooldownUntil").lean(),
            User_1.default.findOne({ email: FINAL_BAN_GATE_COUNTERPARTY }).select("email role status governanceState creatorStatus userCooldownUntil creatorCooldownUntil").lean(),
        ]);
        if (!rawU6 || !rawU7) {
            fail("U6/U7 must resolve before the final ban-gate proof");
        }
        const u6 = rawU6;
        const u7 = rawU7;
        if (u6.role !== "creator" || u7.role !== "creator" || u6.status !== "active" || u6.governanceState !== "ACTIVE" || u6.userCooldownUntil || u6.creatorCooldownUntil || u7.status !== "active" || u7.governanceState !== "ACTIVE" || u7.creatorStatus !== "approved" || u7.userCooldownUntil || u7.creatorCooldownUntil) {
            fail("U6/U7 are not in the exact active Creator precondition; U6 was not banned");
        }
        const [u7UserProfile, u7CreatorProfile, services, u6Wallets] = await Promise.all([
            userProfile_model_1.UserProfile.findOne({ userId: u7._id }).select("profileStatus").lean(),
            creatorProfile_model_1.CreatorProfile.findOne({ userId: u7._id, status: "active" }).select("_id status slug creatorCooldownUntil").lean(),
            creatorService_model_1.CreatorService.find({ creatorId: u7._id, isActive: true }).sort({ createdAt: 1 }).lean(),
            wallet_model_1.Wallet.find({ userId: u6._id }).select("currency availableBalance reservedBalance lockedBalance currentBalance").lean(),
        ]);
        if (!u7UserProfile || u7UserProfile.profileStatus !== "verified" || !u7CreatorProfile || u7CreatorProfile.creatorCooldownUntil || !services.length) {
            fail("U7 is not a verified, active, non-cooled-down Creator with an active service; U6 was not banned");
        }
        const walletByCurrency = new Map(u6Wallets.filter((wallet) => Boolean(wallet.currency)).map((wallet) => [wallet.currency, wallet]));
        const candidates = [];
        for (const service of services) {
            if (!service.currency || !supportedCurrencies_1.SUPPORTED_CURRENCIES.includes(service.currency) || typeof service.price !== "number" || typeof service.durationMinutes !== "number")
                continue;
            const currency = service.currency;
            const serviceAmount = (0, creatorServicePrice_util_1.creatorServiceMajorToMinor)(service.price, currency);
            const pricing = marketplacePricing_service_1.marketplacePricingService.calculate({ serviceAmount, currency });
            candidates.push({ service, currency, wallet: walletByCurrency.get(currency), serviceAmount, customerFeeAmount: pricing.platformFeeAmount, grossFundingAmount: pricing.totalAmount });
        }
        const candidate = candidates.find(({ wallet, grossFundingAmount }) => wallet && wallet.availableBalance >= grossFundingAmount);
        if (!candidate || !candidate.wallet || !candidate.service.currency) {
            console.log(JSON.stringify({ finalBanGatePrecondition: { u7Services: candidates.map(({ service, serviceAmount, customerFeeAmount, grossFundingAmount }) => ({ serviceId: String(service._id), title: service.title, currency: service.currency, price: service.price, durationMinutes: service.durationMinutes, serviceAmount, customerFeeAmount, grossFundingAmount })), u6Wallets: u6Wallets.map((wallet) => ({ currency: wallet.currency, available: wallet.availableBalance, reserved: wallet.reservedBalance, locked: wallet.lockedBalance, current: wallet.currentBalance })) } }));
            fail("no active U7 service has a sufficiently funded matching U6 Wallet; U6 was not banned");
        }
        const { service, currency, wallet, serviceAmount, customerFeeAmount, grossFundingAmount } = candidate;
        const selectedWallet = wallet;
        const findAvailableSlot = async () => slot_model_1.Slot.findOne({ creatorId: u7._id, serviceId: service._id, status: "AVAILABLE", startTime: { $gt: new Date() } }).sort({ startTime: 1 }).lean();
        let slot = await findAvailableSlot();
        if (!slot) {
            const now = new Date();
            const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 9, 0, 0));
            const end = new Date(start.getTime() + service.durationMinutes * 60000);
            await u7Session.post("/api/v1/creator/availability", { serviceId: String(service._id), date: start.toISOString().slice(0, 10), startTime: start.toISOString().slice(11, 16), endTime: end.toISOString().slice(11, 16), timezone: "UTC" });
            slot = await findAvailableSlot();
        }
        if (!slot)
            fail("no valid future U7 slot could be established through the normal availability authority; U6 was not banned");
        const safeSlot = slot;
        const previewResponse = await u6Session.post("/api/v1/bookings/pricing-preview", { serviceId: String(service._id), slotIds: [String(safeSlot._id)] });
        const preview = isRecord(previewResponse) && isRecord(previewResponse.preview) ? previewResponse.preview : null;
        if (!preview || preview.currency !== currency || preview.grossFundingAmount !== grossFundingAmount || !isRecord(preview.walletFunding) || preview.walletFunding.sufficient !== true) {
            fail("U6 to U7 pricing-preview did not prove an otherwise valid outgoing booking path; U6 was not banned");
        }
        const idempotencyKey = "g6-final-ban-gate-u6-u7-v1";
        const identity = (0, bookingWalletReservationIdentity_util_1.deriveBookingRequestIdentity)({ userId: String(u6._id), serviceId: String(service._id), slotIds: [String(safeSlot._id)], method: paymentMethod_enum_1.PaymentMethod.WALLET, idempotencyKey });
        const preexistingAttempt = await booking_model_1.Booking.findOne({ userId: u6._id, bookingRequestKey: identity.bookingRequestKey }).select("_id").lean();
        if (preexistingAttempt)
            fail("the final ban-gate idempotency identity already has a Booking; U6 was not banned");
        const snapshotExistingBookings = async () => {
            const bookings = await booking_model_1.Booking.find({ $or: [{ userId: u6._id }, { creatorId: u6._id }] }).select("bookingReference status userId creatorId slotIds").sort({ createdAt: 1 }).lean();
            const rows = [];
            for (const booking of bookings) {
                const [payment, reservation, slots, releases] = await Promise.all([
                    payment_model_1.Payment.findOne({ bookingId: booking._id }).select("status").lean(),
                    bookingFundReservation_model_1.BookingFundReservation.findOne({ bookingId: booking._id }).select("status amount currency").lean(),
                    slot_model_1.Slot.find({ _id: { $in: booking.slotIds } }).select("status").lean(),
                    ledgerEntry_model_1.LedgerEntry.find({ bookingId: booking._id, source: "BOOKING_WALLET_RESERVATION_RELEASE" }).select("direction account amount currency").lean(),
                ]);
                rows.push({ reference: booking.bookingReference, participation: booking.userId.toString() === u6._id.toString() ? "CUSTOMER" : "CREATOR", status: booking.status, payment: payment?.status ?? null, reservation: reservation ? { status: reservation.status, amount: reservation.amount, currency: reservation.currency } : null, slots: slots.map((row) => row.status), releaseEntries: releases.map((entry) => ({ direction: entry.direction, account: entry.account, amount: entry.amount, currency: entry.currency })) });
            }
            return rows;
        };
        const existingBeforeBan = await snapshotExistingBookings();
        const reason = "G6 final runtime certification: banned Creator acting as customer";
        const dry = unwrapData(await admin.previewGovernanceAction({ key: "BAN_USER", target: { email: "dispose@6.com", id: String(u6._id) }, params: {}, reason }));
        const confirmationToken = getString(dry, "confirmationToken");
        if (!confirmationToken)
            fail("BAN_USER dry-run did not issue confirmation; U6 was not banned");
        const safeConfirmationToken = confirmationToken;
        const execution = unwrapData(await admin.executeConfirmedGovernanceAction({ key: "BAN_USER", target: { email: "dispose@6.com", id: String(u6._id) }, params: {}, reason, confirmationToken: safeConfirmationToken }));
        const existingAfterBan = await snapshotExistingBookings();
        const replay = unwrapData(await admin.executeConfirmedGovernanceAction({ key: "BAN_USER", target: { email: "dispose@6.com", id: String(u6._id) }, params: {}, reason, confirmationToken: safeConfirmationToken }));
        if (!isRecord(replay) || replay.replay !== true)
            fail("BAN_USER replay did not return replay=true");
        const existingAfterReplay = await snapshotExistingBookings();
        if (JSON.stringify(existingAfterBan) !== JSON.stringify(existingAfterReplay))
            fail("BAN_USER replay changed existing booking/financial consequences");
        const [u6Banned, banLogs, banAudits, walletBeforeAttempt, slotBeforeAttempt, authorizationLedgerBefore] = await Promise.all([
            User_1.default.findById(u6._id).select("status governanceState").lean(),
            adminActionLog_model_1.default.find({ actionKey: "BAN_USER", targetId: u6._id, status: "SUCCESS", reason }).lean(),
            auditLog_model_1.AuditLog.find({ action: "USER_BANNED", entityType: "USER", entityId: u6._id }).lean(),
            wallet_model_1.Wallet.findOne({ userId: u6._id, currency }).select("availableBalance reservedBalance lockedBalance currentBalance").lean(),
            slot_model_1.Slot.findById(safeSlot._id).select("status").lean(),
            ledgerEntry_model_1.LedgerEntry.countDocuments({ userId: u6._id, source: "BOOKING_WALLET_AUTHORIZATION", createdAt: { $gte: new Date() } }),
        ]);
        if (!u6Banned || u6Banned.status !== "banned" || u6Banned.governanceState !== "BANNED" || banLogs.length !== 1 || banAudits.length < 1 || !walletBeforeAttempt || slotBeforeAttempt?.status !== "AVAILABLE") {
            fail("BAN_USER postconditions or safe action-log/audit readback failed");
        }
        const safeU6Banned = u6Banned;
        const safeWalletBeforeAttempt = walletBeforeAttempt;
        const attemptStartedAt = new Date();
        let blockedError = "";
        try {
            await u6Session.post("/api/v1/bookings/request", { serviceId: String(service._id), slotIds: [String(safeSlot._id)], paymentMethod: "WALLET" }, { "Idempotency-Key": idempotencyKey });
        }
        catch (error) {
            blockedError = error instanceof Error ? error.message : "blocked";
        }
        const [walletAfterAttempt, slotAfterAttempt, attemptedBooking, authorizationLedgerAfter] = await Promise.all([
            wallet_model_1.Wallet.findOne({ userId: u6._id, currency }).select("availableBalance reservedBalance lockedBalance currentBalance").lean(),
            slot_model_1.Slot.findById(safeSlot._id).select("status").lean(),
            booking_model_1.Booking.findOne({ userId: u6._id, bookingRequestKey: identity.bookingRequestKey }).lean(),
            ledgerEntry_model_1.LedgerEntry.countDocuments({ userId: u6._id, source: "BOOKING_WALLET_AUTHORIZATION", createdAt: { $gte: attemptStartedAt } }),
        ]);
        if (!/HTTP 403/.test(blockedError) || !/ban/i.test(blockedError) || !walletAfterAttempt || safeWalletBeforeAttempt.availableBalance !== walletAfterAttempt.availableBalance || safeWalletBeforeAttempt.reservedBalance !== walletAfterAttempt.reservedBalance || safeWalletBeforeAttempt.lockedBalance !== walletAfterAttempt.lockedBalance || safeWalletBeforeAttempt.currentBalance !== walletAfterAttempt.currentBalance || slotAfterAttempt?.status !== "AVAILABLE" || attemptedBooking || authorizationLedgerAfter !== authorizationLedgerBefore) {
            fail(`final banned-Creator outgoing proof failed or left residue; error=${blockedError || "request unexpectedly succeeded"}`);
        }
        console.log(JSON.stringify({ finalBanGateCertification: { u7: { email: FINAL_BAN_GATE_COUNTERPARTY, role: u7.role, profileStatus: u7UserProfile.profileStatus, creatorProfile: u7CreatorProfile.status, service: { id: String(service._id), title: service.title, currency, price: service.price, durationMinutes: service.durationMinutes } }, u6PreBan: { email: u6.email, wallet: { currency, available: selectedWallet.availableBalance, reserved: selectedWallet.reservedBalance, locked: selectedWallet.lockedBalance, current: selectedWallet.currentBalance }, pricing: { serviceAmount, customerFeeAmount, grossFundingAmount }, previewValid: true }, ban: { dryRun: true, executed: isRecord(execution), replay: true, status: safeU6Banned.status, governanceState: safeU6Banned.governanceState, adminActionLogs: banLogs.length, auditLogs: banAudits.length }, blockedAttempt: { status: 403, error: blockedError, slotId: String(safeSlot._id), booking: "NONE", payment: "NONE", reservation: "NONE", walletUnchanged: true, authorizationLedgerDelta: authorizationLedgerAfter - authorizationLedgerBefore, slotStatus: slotAfterAttempt?.status ?? null }, existingU6BookingEffects: { before: existingBeforeBan, afterBan: existingAfterBan, replayUnchanged: true } } }));
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
const runFundU6Inr = async () => {
    const baseUrl = assertSafeRuntime();
    if (!process.env.G6_CREATOR6_PASSWORD || !process.env.G6_ADMIN_PASSWORD)
        throw new Error("G6 runtime safety check failed: G6_CREATOR6_PASSWORD and G6_ADMIN_PASSWORD are required");
    const [u6Session, admin] = await Promise.all([
        DisposableSession.login(baseUrl, "dispose@6.com", process.env.G6_CREATOR6_PASSWORD),
        G6AdminApi.login(baseUrl),
    ]);
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri)
        throw new Error("G6 runtime safety check failed: MONGODB_URI is required for U6 INR funding verification");
    await mongoose_1.default.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    try {
        const [u6, u4] = await Promise.all([User_1.default.findOne({ email: "dispose@6.com" }).select("email governanceState status creatorCooldownUntil").lean(), User_1.default.findOne({ email: "dispose@4.com" }).select("email").lean()]);
        if (!u6 || !u4 || u6.governanceState !== "ACTIVE" || u6.status !== "active")
            throw new Error("G6 runtime safety check failed: U6 must remain canonically ACTIVE for Wallet funding");
        const service = await creatorService_model_1.CreatorService.findOne({ creatorId: u4._id, isActive: true, currency: "INR" }).sort({ createdAt: 1 }).lean();
        if (!service)
            throw new Error("G6 runtime safety check failed: no active INR service exists for dispose@4.com");
        const serviceAmount = (0, creatorServicePrice_util_1.creatorServiceMajorToMinor)(service.price, "INR");
        const requiredAmount = marketplacePricing_service_1.marketplacePricingService.calculate({ serviceAmount, currency: "INR" }).totalAmount;
        const wallet = await wallet_model_1.Wallet.findOne({ userId: u6._id, currency: "INR" }).select("currency availableBalance reservedBalance lockedBalance currentBalance").lean();
        if (wallet && wallet.availableBalance >= requiredAmount) {
            console.log(JSON.stringify({ u6InrFunding: { result: "NO_FUNDING_REQUIRED", requiredAmount, wallet: { available: wallet.availableBalance, reserved: wallet.reservedBalance, locked: wallet.lockedBalance, current: wallet.currentBalance } } }));
            return;
        }
        const topUps = await walletTopUpRequest_model_1.WalletTopUpRequest.find({ userId: u6._id, currency: "INR" }).sort({ requestedAt: -1 }).lean();
        const completed = topUps.find((topUp) => topUp.status === "COMPLETED");
        if (completed)
            fail(`completed U6 INR top-up ${completed.topUpReference} does not have a sufficient Wallet projection`);
        const failed = topUps.find((topUp) => topUp.status === "FAILED" || topUp.status === "REJECTED");
        if (failed)
            fail(`existing U6 INR top-up ${failed.topUpReference} is ${failed.status}; do not create a duplicate without review`);
        let topUp = topUps.find((item) => ["PENDING", "APPROVED", "PROCESSING"].includes(item.status)) ?? null;
        const idempotencyKey = "g6-targeted-u6-inr-funding-v1";
        if (!topUp) {
            const created = unwrapData(await u6Session.post("/api/v1/wallet/top-up-requests", { amount: requiredAmount, currency: "INR" }, { "Idempotency-Key": idempotencyKey }));
            const reference = getString(created, "topUpReference");
            if (!reference)
                fail("top-up create did not return a safe reference");
            topUp = await walletTopUpRequest_model_1.WalletTopUpRequest.findOne({ userId: u6._id, topUpReference: reference }).lean();
        }
        if (!topUp)
            throw new Error("G6 runtime safety check failed: U6 INR top-up request could not be read back");
        if (topUp.amount !== requiredAmount)
            fail(`existing U6 INR top-up amount conflicts; required=${requiredAmount}; existing=${topUp.amount}`);
        if (topUp.status === "PENDING")
            await admin.patch(`/api/v1/admin/financial/wallet-top-up-requests/${topUp.topUpReference}/decision`, { decision: "APPROVE" });
        topUp = await walletTopUpRequest_model_1.WalletTopUpRequest.findById(topUp._id).lean();
        if (!topUp)
            throw new Error("G6 runtime safety check failed: U6 INR top-up disappeared after approval");
        let funding = await internalTopUpFunding_model_1.InternalTopUpFunding.findOne({ topUpRequestId: topUp._id }).lean();
        if (topUp.status === "APPROVED")
            await admin.post(`/api/v1/admin/financial/wallet-top-up-requests/${topUp.topUpReference}/start-processing`, { outcome: "SUCCESS" });
        funding = await internalTopUpFunding_model_1.InternalTopUpFunding.findOne({ topUpRequestId: topUp._id }).lean();
        if (!funding || funding.status !== "SUCCEEDED")
            throw new Error(`G6 runtime safety check failed: U6 INR provider funding is not SUCCEEDED for ${topUp.topUpReference}`);
        topUp = await walletTopUpRequest_model_1.WalletTopUpRequest.findById(topUp._id).lean();
        if (!topUp)
            throw new Error("G6 runtime safety check failed: U6 INR top-up disappeared before accounting");
        if (topUp.status !== "COMPLETED")
            await admin.post(`/api/v1/admin/financial/wallet-top-up-requests/${topUp.topUpReference}/complete-accounting`, {});
        const [finalTopUp, finalWallet, ledger] = await Promise.all([walletTopUpRequest_model_1.WalletTopUpRequest.findById(topUp._id).lean(), wallet_model_1.Wallet.findOne({ userId: u6._id, currency: "INR" }).select("currency availableBalance reservedBalance lockedBalance currentBalance").lean(), ledgerEntry_model_1.LedgerEntry.find({ topUpRequestId: topUp._id, source: "INTERNAL_TOP_UP_FUNDING" }).select("direction account amount currency transactionId").lean()]);
        if (!finalTopUp || finalTopUp.status !== "COMPLETED" || !finalWallet || finalWallet.availableBalance < requiredAmount || ledger.length !== 1 || !ledger.some((entry) => entry.direction === "CREDIT" && entry.account === "CASH" && entry.amount === requiredAmount && entry.currency === "INR"))
            throw new Error("G6 runtime safety check failed: U6 INR top-up accounting or Wallet projection integrity check failed");
        console.log(JSON.stringify({ u6InrFunding: { result: "COMPLETED", topUpReference: finalTopUp.topUpReference, requiredAmount, providerStatus: funding.status, wallet: { available: finalWallet.availableBalance, reserved: finalWallet.reservedBalance, locked: finalWallet.lockedBalance, current: finalWallet.currentBalance }, ledgerEntries: ledger.length } }));
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
const command = process.argv[2] ?? "discovery";
const runner = command === "discovery" ? runDiscovery : command === "setup" ? runSetup : command === "certify" ? runCertification : command === "certify-targeted" ? runTargetedCertification : command === "finish-remaining" ? runFinishRemainingCertification : command === "certify-final-ban-gate" ? runFinalBannedCreatorCustomerProof : command === "fund-u6-inr" ? runFundU6Inr : command === "inspect-b2" ? runB2Inspection : command === "enable-admin-actions" ? runEnableAdminActions : () => Promise.reject(new Error("G6 runtime safety check failed: supported commands are discovery, setup, certify, certify-targeted, finish-remaining, certify-final-ban-gate, fund-u6-inr, inspect-b2, and enable-admin-actions"));
runner().catch((error) => {
    const message = error instanceof Error ? error.message : "unknown G6 runner failure";
    // The runner intentionally emits only a bounded message; credentials/tokens are never included.
    console.error(message.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]"));
    process.exitCode = 1;
});
