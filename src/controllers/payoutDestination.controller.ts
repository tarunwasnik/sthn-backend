import { Request, Response } from "express";
import mongoose from "mongoose";

import { asyncHandler } from "../middlewares/asyncHandler";
import { PayoutDestinationError } from "../errors/financial/PayoutDestinationError";
import { payoutDestinationService } from "../services/financial/payoutDestination.service";
import { createAuditLog } from "../services/auditLog.service";

const CREATE_FIELDS = new Set([
  "type",
  "accountHolderName",
  "accountNumber",
  "ifsc",
  "upiId",
  "idempotencyKey",
]);

function creatorIdFromRequest(req: Request): string {
  if (!req.user?.id) {
    throw new PayoutDestinationError("Authenticated creator is required.", "MISSING_PAYOUT_DESTINATION_CREATOR");
  }
  return req.user.id;
}

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PayoutDestinationError("Request body must be an object.", "INVALID_PAYOUT_DESTINATION_INPUT");
  }
  return body as Record<string, unknown>;
}

export const createPayoutDestination = asyncHandler(
  async (req: Request, res: Response) => {
    const body = requireObjectBody(req.body);
    const unsupported = Object.keys(body).find((field) => !CREATE_FIELDS.has(field));
    if (unsupported) {
      throw new PayoutDestinationError(`Unsupported payout destination field: ${unsupported}.`, "UNSUPPORTED_PAYOUT_DESTINATION_FIELD");
    }

    const creatorId = creatorIdFromRequest(req);
    const result = await payoutDestinationService.create({
      creatorId,
      type: body.type,
      accountHolderName: body.accountHolderName,
      accountNumber: body.accountNumber,
      ifsc: body.ifsc,
      upiId: body.upiId,
      idempotencyKey: body.idempotencyKey,
    });
    const response = payoutDestinationService.serialize(result.destination);

    if (result.created) {
      await createAuditLog({
        actorType: "CREATOR",
        actorId: new mongoose.Types.ObjectId(creatorId),
        action: "PAYOUT_DESTINATION_CREATED",
        entityType: "PAYOUT_DESTINATION",
        entityId: result.destination._id as mongoose.Types.ObjectId,
        after: {
          destinationReference: response.destinationReference,
          type: response.type,
          maskedIdentifier: response.maskedIdentifier,
          isActive: response.isActive,
        },
      });
    }

    res.status(result.created ? 201 : 200).json({ success: true, data: response });
  },
);

export const listPayoutDestinations = asyncHandler(
  async (req: Request, res: Response) => {
    const destinations = await payoutDestinationService.list(creatorIdFromRequest(req));
    res.json({ success: true, data: destinations.map((destination) => payoutDestinationService.serialize(destination)) });
  },
);

export const getPayoutDestination = asyncHandler(
  async (req: Request, res: Response) => {
    const destination = await payoutDestinationService.get(
      creatorIdFromRequest(req),
      req.params.destinationReference,
    );
    res.json({ success: true, data: payoutDestinationService.serialize(destination) });
  },
);

export const setPayoutDestinationActivation = asyncHandler(
  async (req: Request, res: Response) => {
    const body = requireObjectBody(req.body);
    if (Object.keys(body).length !== 1 || typeof body.isActive !== "boolean") {
      throw new PayoutDestinationError("Activation request must contain only isActive.", "INVALID_PAYOUT_DESTINATION_ACTIVATION");
    }

    const creatorId = creatorIdFromRequest(req);
    const result = await payoutDestinationService.setActivation(
      creatorId,
      req.params.destinationReference,
      body.isActive,
    );
    const response = payoutDestinationService.serialize(result.destination);

    if (result.changed) {
      await createAuditLog({
        actorType: "CREATOR",
        actorId: new mongoose.Types.ObjectId(creatorId),
        action: body.isActive ? "PAYOUT_DESTINATION_REACTIVATED" : "PAYOUT_DESTINATION_DEACTIVATED",
        entityType: "PAYOUT_DESTINATION",
        entityId: result.destination._id as mongoose.Types.ObjectId,
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
  },
);
