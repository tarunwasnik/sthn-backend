"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postCreatorWithdrawal = exports.createEligibleCreatorWithdrawalFixture = exports.startCreatorWithdrawalHttpServer = void 0;
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const admin_routes_1 = __importDefault(require("../../../../routes/v1/admin.routes"));
const booking_routes_1 = __importDefault(require("../../../../routes/v1/booking.routes"));
const creatorCancelBooking_routes_1 = __importDefault(require("../../../../routes/v1/creatorCancelBooking.routes"));
const creatorBookingDecision_routes_1 = __importDefault(require("../../../../routes/v1/creatorBookingDecision.routes"));
const withdrawal_routes_1 = __importDefault(require("../../../../routes/v1/withdrawal.routes"));
const errorHandler_1 = require("../../../../middlewares/errorHandler");
const notFound_1 = require("../../../../middlewares/notFound");
const payoutDestinationType_enum_1 = require("../../../../enums/financial/payoutDestinationType.enum");
const payoutDestinationVerificationStatus_enum_1 = require("../../../../enums/financial/payoutDestinationVerificationStatus.enum");
const payoutDestination_model_1 = require("../../../../models/payoutDestination.model");
const reference_util_1 = require("../../../../utils/financial/reference.util");
const bookingCreatorSettlementOperationalFixtures_1 = require("../../phase8f/fixtures/bookingCreatorSettlementOperationalFixtures");
let phase9aSequence = 0;
const startCreatorWithdrawalHttpServer = async () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use("/api/v1/bookings", booking_routes_1.default);
    app.use("/api/v1/bookings/creator", creatorCancelBooking_routes_1.default);
    app.use("/api/v1/creator", creatorBookingDecision_routes_1.default);
    app.use("/api/v1/admin", admin_routes_1.default);
    app.use("/api/v1/withdrawals", withdrawal_routes_1.default);
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    const server = node_http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Phase 9A test server did not bind.");
    }
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
};
exports.startCreatorWithdrawalHttpServer = startCreatorWithdrawalHttpServer;
const createEligibleCreatorWithdrawalFixture = async (baseUrl) => {
    phase9aSequence += 1;
    const settled = await (0, bookingCreatorSettlementOperationalFixtures_1.createSettledOperationalFixture)(baseUrl);
    const destination = await payoutDestination_model_1.PayoutDestination.create({
        destinationReference: (0, reference_util_1.generateFinancialReference)("PAYOUT_DESTINATION"),
        creatorId: settled.fixture.actors.creatorId,
        type: payoutDestinationType_enum_1.PayoutDestinationType.BANK_ACCOUNT,
        verificationStatus: payoutDestinationVerificationStatus_enum_1.PayoutDestinationVerificationStatus.VERIFIED,
        isActive: true,
        idempotencyKey: `phase9a-destination-${phase9aSequence}`,
        destinationFingerprint: `phase9a-destination-fingerprint-${phase9aSequence}`,
        requestFingerprint: `phase9a-request-fingerprint-${phase9aSequence}`,
        encryptedPayload: {
            version: 1,
            ciphertext: "phase9a-fixture",
            iv: "phase9a-fixture",
            authTag: "phase9a-fixture",
        },
        maskedIdentifier: "••••1234",
        accountNumberLast4: "1234",
        ifscDisplay: "TEST0123456",
        verifiedAt: new Date(),
    });
    return {
        ...settled,
        destination,
        input: {
            authenticatedUserId: settled.fixture.actors.creatorId.toString(),
            amount: { amount: 300, currency: "INR" },
            destinationReference: destination.destinationReference,
            idempotencyKey: `phase9a-withdrawal-${phase9aSequence}`,
        },
    };
};
exports.createEligibleCreatorWithdrawalFixture = createEligibleCreatorWithdrawalFixture;
const postCreatorWithdrawal = async (baseUrl, creatorToken, body) => {
    const response = await fetch(`${baseUrl}/api/v1/withdrawals`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(creatorToken
                ? { authorization: `Bearer ${creatorToken}` }
                : {}),
        },
        body: JSON.stringify(body),
    });
    return {
        status: response.status,
        body: await response.json(),
    };
};
exports.postCreatorWithdrawal = postCreatorWithdrawal;
