import { Request, Response } from "express";

import { asyncHandler } from "../../middlewares/asyncHandler";
import { PayoutDestinationVerificationAction } from "../../enums/financial/payoutDestinationVerificationAction.enum";
import { PayoutDestinationError } from "../../errors/financial/PayoutDestinationError";
import { payoutDestinationVerificationService } from "../../services/financial/payoutDestinationVerification.service";

const ALLOWED_FIELDS = new Set([
  "action",
  "rejectionCode",
  "rejectionReason",
  "note",
]);

export const applyPayoutDestinationVerificationDecision = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user?.id) {
      throw new PayoutDestinationError(
        "Authenticated admin actor is required.",
        "MISSING_PAYOUT_DESTINATION_VERIFICATION_ACTOR",
      );
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      throw new PayoutDestinationError(
        "Verification request body must be an object.",
        "INVALID_PAYOUT_DESTINATION_VERIFICATION_INPUT",
      );
    }

    const body = req.body as Record<string, unknown>;
    const unsupported = Object.keys(body).find((field) => !ALLOWED_FIELDS.has(field));
    if (unsupported) {
      throw new PayoutDestinationError(
        `Unsupported payout destination verification field: ${unsupported}.`,
        "UNSUPPORTED_PAYOUT_DESTINATION_VERIFICATION_FIELD",
      );
    }

    const { action, rejectionCode, rejectionReason, note } = body;
    for (const [field, value] of Object.entries({ rejectionCode, rejectionReason, note })) {
      if (value !== undefined && typeof value !== "string") {
        throw new PayoutDestinationError(
          `Invalid ${field}.`,
          "INVALID_PAYOUT_DESTINATION_VERIFICATION_INPUT",
        );
      }
    }
    if (
      typeof action !== "string" ||
      !Object.values(PayoutDestinationVerificationAction).includes(
        action as PayoutDestinationVerificationAction,
      )
    ) {
      throw new PayoutDestinationError(
        "Invalid payout destination verification action.",
        "INVALID_PAYOUT_DESTINATION_VERIFICATION_ACTION",
      );
    }

    const result = await payoutDestinationVerificationService.applyDecision({
      destinationReference: req.params.destinationReference,
      action: action as PayoutDestinationVerificationAction,
      adminActorId: req.user.id,
      rejectionCode: typeof rejectionCode === "string" ? rejectionCode : undefined,
      rejectionReason: typeof rejectionReason === "string" ? rejectionReason : undefined,
      note: typeof note === "string" ? note : undefined,
    });

    const isVerify = action === PayoutDestinationVerificationAction.VERIFY;
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
        ...payoutDestinationVerificationService.serializeForAdmin(
          result.destination,
        ),
        idempotent: result.idempotent,
      },
    });
  },
);
