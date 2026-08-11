//backend/src/controllers/admin/providerSimulator.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";

import { providerSimulatorService } from "../../services/providerSimulator/providerSimulator.service";

import { ProviderPayoutSimulationAction } from "../../constants/internalProvider";

import { ProviderSimulatorError } from "../../errors/internalProvider/ProviderSimulatorError";

import { createAuditLog } from "../../services/auditLog.service";

import { asyncHandler } from "../../middlewares/asyncHandler";

/* -------------------------------------------------------------------------- */
/* Verify Payment                                                             */
/* -------------------------------------------------------------------------- */

export const verifyPayment = asyncHandler(
  async (req: Request, res: Response) => {
    const { paymentId } = req.params;

    const result =
      await providerSimulatorService.simulateVerification(paymentId);

    res.json({
      success: true,
      message: "Payment verification simulated successfully.",
      data: result,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* Payment Status                                                             */
/* -------------------------------------------------------------------------- */

export const getPaymentStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { paymentId } = req.params;

    const result = await providerSimulatorService.simulateStatus(paymentId);

    res.json({
      success: true,
      data: result,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* Refund                                                                     */
/* -------------------------------------------------------------------------- */

export const refundPayment = asyncHandler(
  async (req: Request, res: Response) => {
    const { paymentId } = req.params;

    const { amount, reason } = req.body;

    const result = await providerSimulatorService.simulateRefund(
      paymentId,
      Number(amount),
      reason,
    );

    res.json({
      success: true,
      message: "Refund simulated successfully.",
      data: result,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* Webhook                                                                    */
/* -------------------------------------------------------------------------- */

export const simulateWebhook = asyncHandler(
  async (req: Request, res: Response) => {
    const { paymentId } = req.params;

    const result = await providerSimulatorService.simulateWebhook(
      paymentId,
      req.body,
    );

    res.json({
      success: true,
      message: "Webhook simulated successfully.",
      data: result,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* Payout Status                                                               */
/* -------------------------------------------------------------------------- */

const PAYOUT_SIMULATION_FIELDS = new Set([
  "action",
  "failureCode",
  "failureReason",
  "note",
]);

export const simulatePayoutStatus = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      throw new ProviderSimulatorError(
        "Payout simulation body must be an object.",
        "INVALID_PROVIDER_PAYOUT_SIMULATION_INPUT",
      );
    }

    const body = req.body as Record<string, unknown>;
    const unsupportedField = Object.keys(body).find(
      (field) => !PAYOUT_SIMULATION_FIELDS.has(field),
    );

    if (unsupportedField) {
      throw new ProviderSimulatorError(
        `Unsupported payout simulation field: ${unsupportedField}.`,
        "UNSUPPORTED_PROVIDER_PAYOUT_SIMULATION_FIELD",
      );
    }

    const { providerPayoutId } = req.params;
    const { action, failureCode, failureReason, note } = body;

    for (const [field, value] of Object.entries({
      failureCode,
      failureReason,
      note,
    })) {
      if (value !== undefined && typeof value !== "string") {
        throw new ProviderSimulatorError(
          `Invalid ${field}.`,
          "INVALID_PROVIDER_PAYOUT_SIMULATION_INPUT",
        );
      }
    }

    if (!req.user?.id) {
      throw new ProviderSimulatorError(
        "Authenticated admin actor is required.",
        "MISSING_ADMIN_ACTOR",
      );
    }

    if (
      typeof action !== "string" ||
      !Object.values(ProviderPayoutSimulationAction).includes(
        action as ProviderPayoutSimulationAction,
      )
    ) {
      throw new ProviderSimulatorError(
        "Invalid provider payout simulation action.",
        "INVALID_PROVIDER_PAYOUT_SIMULATION_ACTION",
      );
    }

    const result = await providerSimulatorService.simulatePayout({
      providerPayoutId,
      action: action as ProviderPayoutSimulationAction,
      adminId: req.user.id,
      failureCode: typeof failureCode === "string" ? failureCode.trim() : undefined,
      failureReason:
        typeof failureReason === "string" ? failureReason.trim() : undefined,
      note: typeof note === "string" ? note.trim() : undefined,
    });

    const { payout, previousStatus, idempotent } = result;

    await createAuditLog({
      actorType: "ADMIN",
      actorId: new mongoose.Types.ObjectId(req.user.id),
      action: "INTERNAL_PROVIDER_PAYOUT_SIMULATED",
      entityType: "INTERNAL_PROVIDER_PAYOUT",
      entityId: payout._id as mongoose.Types.ObjectId,
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
  },
);
