"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPayoutDestinationVerificationDecision = void 0;
const asyncHandler_1 = require("../../middlewares/asyncHandler");
const payoutDestinationVerificationAction_enum_1 = require("../../enums/financial/payoutDestinationVerificationAction.enum");
const PayoutDestinationError_1 = require("../../errors/financial/PayoutDestinationError");
const payoutDestinationVerification_service_1 = require("../../services/financial/payoutDestinationVerification.service");
const ALLOWED_FIELDS = new Set([
    "action",
    "rejectionCode",
    "rejectionReason",
    "note",
]);
exports.applyPayoutDestinationVerificationDecision = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!req.user?.id) {
        throw new PayoutDestinationError_1.PayoutDestinationError("Authenticated admin actor is required.", "MISSING_PAYOUT_DESTINATION_VERIFICATION_ACTOR");
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        throw new PayoutDestinationError_1.PayoutDestinationError("Verification request body must be an object.", "INVALID_PAYOUT_DESTINATION_VERIFICATION_INPUT");
    }
    const body = req.body;
    const unsupported = Object.keys(body).find((field) => !ALLOWED_FIELDS.has(field));
    if (unsupported) {
        throw new PayoutDestinationError_1.PayoutDestinationError(`Unsupported payout destination verification field: ${unsupported}.`, "UNSUPPORTED_PAYOUT_DESTINATION_VERIFICATION_FIELD");
    }
    const { action, rejectionCode, rejectionReason, note } = body;
    for (const [field, value] of Object.entries({ rejectionCode, rejectionReason, note })) {
        if (value !== undefined && typeof value !== "string") {
            throw new PayoutDestinationError_1.PayoutDestinationError(`Invalid ${field}.`, "INVALID_PAYOUT_DESTINATION_VERIFICATION_INPUT");
        }
    }
    if (typeof action !== "string" ||
        !Object.values(payoutDestinationVerificationAction_enum_1.PayoutDestinationVerificationAction).includes(action)) {
        throw new PayoutDestinationError_1.PayoutDestinationError("Invalid payout destination verification action.", "INVALID_PAYOUT_DESTINATION_VERIFICATION_ACTION");
    }
    const result = await payoutDestinationVerification_service_1.payoutDestinationVerificationService.applyDecision({
        destinationReference: req.params.destinationReference,
        action: action,
        adminActorId: req.user.id,
        rejectionCode: typeof rejectionCode === "string" ? rejectionCode : undefined,
        rejectionReason: typeof rejectionReason === "string" ? rejectionReason : undefined,
        note: typeof note === "string" ? note : undefined,
    });
    const isVerify = action === payoutDestinationVerificationAction_enum_1.PayoutDestinationVerificationAction.VERIFY;
    res.json({
        success: true,
        message: result.idempotent
            ? isVerify
                ? "Payout destination was already verified."
                : "Payout destination was already rejected."
            : isVerify
                ? "Payout destination verified successfully."
                : "Payout destination rejected successfully.",
        data: {
            ...payoutDestinationVerification_service_1.payoutDestinationVerificationService.serializeForAdmin(result.destination),
            idempotent: result.idempotent,
        },
    });
});
