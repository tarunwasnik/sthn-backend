"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setPayoutDestinationActivation = exports.getPayoutDestination = exports.listPayoutDestinations = exports.createPayoutDestination = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const asyncHandler_1 = require("../middlewares/asyncHandler");
const PayoutDestinationError_1 = require("../errors/financial/PayoutDestinationError");
const payoutDestination_service_1 = require("../services/financial/payoutDestination.service");
const auditLog_service_1 = require("../services/auditLog.service");
const CREATE_FIELDS = new Set([
    "type",
    "accountHolderName",
    "accountNumber",
    "ifsc",
    "upiId",
    "idempotencyKey",
]);
function creatorIdFromRequest(req) {
    if (!req.user?.id) {
        throw new PayoutDestinationError_1.PayoutDestinationError("Authenticated creator is required.", "MISSING_PAYOUT_DESTINATION_CREATOR");
    }
    return req.user.id;
}
function requireObjectBody(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new PayoutDestinationError_1.PayoutDestinationError("Request body must be an object.", "INVALID_PAYOUT_DESTINATION_INPUT");
    }
    return body;
}
exports.createPayoutDestination = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = requireObjectBody(req.body);
    const unsupported = Object.keys(body).find((field) => !CREATE_FIELDS.has(field));
    if (unsupported) {
        throw new PayoutDestinationError_1.PayoutDestinationError(`Unsupported payout destination field: ${unsupported}.`, "UNSUPPORTED_PAYOUT_DESTINATION_FIELD");
    }
    const creatorId = creatorIdFromRequest(req);
    const result = await payoutDestination_service_1.payoutDestinationService.create({
        creatorId,
        type: body.type,
        accountHolderName: body.accountHolderName,
        accountNumber: body.accountNumber,
        ifsc: body.ifsc,
        upiId: body.upiId,
        idempotencyKey: body.idempotencyKey,
    });
    const response = payoutDestination_service_1.payoutDestinationService.serialize(result.destination);
    if (result.created) {
        await (0, auditLog_service_1.createAuditLog)({
            actorType: "CREATOR",
            actorId: new mongoose_1.default.Types.ObjectId(creatorId),
            action: "PAYOUT_DESTINATION_CREATED",
            entityType: "PAYOUT_DESTINATION",
            entityId: result.destination._id,
            after: {
                destinationReference: response.destinationReference,
                type: response.type,
                maskedIdentifier: response.maskedIdentifier,
                isActive: response.isActive,
            },
        });
    }
    res.status(result.created ? 201 : 200).json({ success: true, data: response });
});
exports.listPayoutDestinations = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const destinations = await payoutDestination_service_1.payoutDestinationService.list(creatorIdFromRequest(req));
    res.json({ success: true, data: destinations.map((destination) => payoutDestination_service_1.payoutDestinationService.serialize(destination)) });
});
exports.getPayoutDestination = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const destination = await payoutDestination_service_1.payoutDestinationService.get(creatorIdFromRequest(req), req.params.destinationReference);
    res.json({ success: true, data: payoutDestination_service_1.payoutDestinationService.serialize(destination) });
});
exports.setPayoutDestinationActivation = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = requireObjectBody(req.body);
    if (Object.keys(body).length !== 1 || typeof body.isActive !== "boolean") {
        throw new PayoutDestinationError_1.PayoutDestinationError("Activation request must contain only isActive.", "INVALID_PAYOUT_DESTINATION_ACTIVATION");
    }
    const creatorId = creatorIdFromRequest(req);
    const result = await payoutDestination_service_1.payoutDestinationService.setActivation(creatorId, req.params.destinationReference, body.isActive);
    const response = payoutDestination_service_1.payoutDestinationService.serialize(result.destination);
    if (result.changed) {
        await (0, auditLog_service_1.createAuditLog)({
            actorType: "CREATOR",
            actorId: new mongoose_1.default.Types.ObjectId(creatorId),
            action: body.isActive ? "PAYOUT_DESTINATION_REACTIVATED" : "PAYOUT_DESTINATION_DEACTIVATED",
            entityType: "PAYOUT_DESTINATION",
            entityId: result.destination._id,
            before: { isActive: !body.isActive },
            after: {
                destinationReference: response.destinationReference,
                type: response.type,
                maskedIdentifier: response.maskedIdentifier,
                isActive: response.isActive,
            },
        });
    }
    res.json({ success: true, data: response });
});
