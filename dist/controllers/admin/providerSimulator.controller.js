"use strict";
//backend/src/controllers/admin/providerSimulator.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulatePayoutStatus = exports.simulateWebhook = exports.refundPayment = exports.getPaymentStatus = exports.verifyPayment = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const providerSimulator_service_1 = require("../../services/providerSimulator/providerSimulator.service");
const internalProvider_1 = require("../../constants/internalProvider");
const ProviderSimulatorError_1 = require("../../errors/internalProvider/ProviderSimulatorError");
const auditLog_service_1 = require("../../services/auditLog.service");
const asyncHandler_1 = require("../../middlewares/asyncHandler");
/* -------------------------------------------------------------------------- */
/* Verify Payment                                                             */
/* -------------------------------------------------------------------------- */
exports.verifyPayment = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { paymentId } = req.params;
    const result = await providerSimulator_service_1.providerSimulatorService.simulateVerification(paymentId);
    res.json({
        success: true,
        message: "Payment verification simulated successfully.",
        data: result,
    });
});
/* -------------------------------------------------------------------------- */
/* Payment Status                                                             */
/* -------------------------------------------------------------------------- */
exports.getPaymentStatus = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { paymentId } = req.params;
    const result = await providerSimulator_service_1.providerSimulatorService.simulateStatus(paymentId);
    res.json({
        success: true,
        data: result,
    });
});
/* -------------------------------------------------------------------------- */
/* Refund                                                                     */
/* -------------------------------------------------------------------------- */
exports.refundPayment = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { paymentId } = req.params;
    const { amount, reason } = req.body;
    const result = await providerSimulator_service_1.providerSimulatorService.simulateRefund(paymentId, Number(amount), reason);
    res.json({
        success: true,
        message: "Refund simulated successfully.",
        data: result,
    });
});
/* -------------------------------------------------------------------------- */
/* Webhook                                                                    */
/* -------------------------------------------------------------------------- */
exports.simulateWebhook = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { paymentId } = req.params;
    const result = await providerSimulator_service_1.providerSimulatorService.simulateWebhook(paymentId, req.body);
    res.json({
        success: true,
        message: "Webhook simulated successfully.",
        data: result,
    });
});
/* -------------------------------------------------------------------------- */
/* Payout Status                                                               */
/* -------------------------------------------------------------------------- */
const PAYOUT_SIMULATION_FIELDS = new Set([
    "action",
    "failureCode",
    "failureReason",
    "note",
]);
exports.simulatePayoutStatus = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        throw new ProviderSimulatorError_1.ProviderSimulatorError("Payout simulation body must be an object.", "INVALID_PROVIDER_PAYOUT_SIMULATION_INPUT");
    }
    const body = req.body;
    const unsupportedField = Object.keys(body).find((field) => !PAYOUT_SIMULATION_FIELDS.has(field));
    if (unsupportedField) {
        throw new ProviderSimulatorError_1.ProviderSimulatorError(`Unsupported payout simulation field: ${unsupportedField}.`, "UNSUPPORTED_PROVIDER_PAYOUT_SIMULATION_FIELD");
    }
    const { providerPayoutId } = req.params;
    const { action, failureCode, failureReason, note } = body;
    for (const [field, value] of Object.entries({
        failureCode,
        failureReason,
        note,
    })) {
        if (value !== undefined && typeof value !== "string") {
            throw new ProviderSimulatorError_1.ProviderSimulatorError(`Invalid ${field}.`, "INVALID_PROVIDER_PAYOUT_SIMULATION_INPUT");
        }
    }
    if (!req.user?.id) {
        throw new ProviderSimulatorError_1.ProviderSimulatorError("Authenticated admin actor is required.", "MISSING_ADMIN_ACTOR");
    }
    if (typeof action !== "string" ||
        !Object.values(internalProvider_1.ProviderPayoutSimulationAction).includes(action)) {
        throw new ProviderSimulatorError_1.ProviderSimulatorError("Invalid provider payout simulation action.", "INVALID_PROVIDER_PAYOUT_SIMULATION_ACTION");
    }
    const result = await providerSimulator_service_1.providerSimulatorService.simulatePayout({
        providerPayoutId,
        action: action,
        adminId: req.user.id,
        failureCode: typeof failureCode === "string" ? failureCode.trim() : undefined,
        failureReason: typeof failureReason === "string" ? failureReason.trim() : undefined,
        note: typeof note === "string" ? note.trim() : undefined,
    });
    const { payout, previousStatus, idempotent } = result;
    await (0, auditLog_service_1.createAuditLog)({
        actorType: "ADMIN",
        actorId: new mongoose_1.default.Types.ObjectId(req.user.id),
        action: "INTERNAL_PROVIDER_PAYOUT_SIMULATED",
        entityType: "INTERNAL_PROVIDER_PAYOUT",
        entityId: payout._id,
        before: { status: previousStatus },
        after: {
            providerPayoutId: payout.providerPayoutId,
            status: payout.status,
            action,
            idempotent,
            providerTransactionId: payout.providerTransactionId,
            failureCode: payout.failureCode,
            failureReason: payout.failureMessage,
            simulatedAt: payout.simulatedAt,
        },
    });
    res.json({
        success: true,
        message: idempotent
            ? "Provider payout simulation action was already applied."
            : "Provider payout status simulated successfully.",
        data: {
            providerPayoutId: payout.providerPayoutId,
            providerPayoutReference: payout.providerReference ?? undefined,
            financialPayoutId: payout.payoutId.toString(),
            previousStatus,
            status: payout.status,
            action,
            providerTransactionId: payout.providerTransactionId ?? undefined,
            processingAt: payout.processingAt ?? undefined,
            paidAt: payout.paidAt ?? undefined,
            failedAt: payout.failedAt ?? undefined,
            cancelledAt: payout.cancelledAt ?? undefined,
            expiredAt: payout.expiredAt ?? undefined,
            failureCode: payout.failureCode ?? undefined,
            failureReason: payout.failureMessage ?? undefined,
            simulated: payout.simulated,
            simulatedAt: payout.simulatedAt ?? undefined,
            createdAt: payout.createdAt,
            updatedAt: payout.updatedAt,
            idempotent,
        },
    });
});
