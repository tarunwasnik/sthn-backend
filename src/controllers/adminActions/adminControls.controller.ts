//backend/src/controllers/adminActions/adminControls.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";
import { adminResponse } from "../../utils/adminResponse";
import { AdminControl } from "../../models/adminControl.model";
import AdminActionLog from "../../models/adminActionLog.model";
import { evaluateAdminControls } from "../../utils/adminControlEvaluator";

/**
 * ---------------------------------------------
 * GET /admin/actions/controls/active
 * ---------------------------------------------
 */
export const getActiveControls = adminAsyncHandler(
  async (_req: Request, res: Response) => {
    const now = new Date();

    const controls = await AdminControl.find({
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    }).sort({ createdAt: -1 });

    res.json(adminResponse({ data: controls }));
  }
);

/**
 * ---------------------------------------------
 * GET /admin/actions/controls/history
 * ---------------------------------------------
 */
export const getControlHistory = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const { scope, createdBy, from, to } = req.query;

    const filter: any = {};

    if (scope) filter.scope = scope;

    if (createdBy) {
      if (!mongoose.Types.ObjectId.isValid(createdBy as string)) {
        throw new Error("Invalid createdBy id");
      }
      filter.createdBy = new mongoose.Types.ObjectId(createdBy as string);
    }

    if (from || to) {
      filter.createdAt = {};

      if (from) {
        const d = new Date(from as string);
        if (Number.isNaN(d.getTime())) throw new Error("Invalid from date");
        filter.createdAt.$gte = d;
      }

      if (to) {
        const d = new Date(to as string);
        if (Number.isNaN(d.getTime())) throw new Error("Invalid to date");
        filter.createdAt.$lte = d;
      }
    }

    const controls = await AdminControl.find(filter).sort({ createdAt: -1 });

    res.json(adminResponse({ data: controls }));
  }
);

/**
 * ---------------------------------------------
 * GET /admin/actions/controls/:id
 * ---------------------------------------------
 */
export const getControlById = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid control id");
    }

    const control = await AdminControl.findById(id);

    if (!control) {
      throw new Error("Control not found");
    }

    res.json(adminResponse({ data: control }));
  }
);

/**
 * ---------------------------------------------
 * POST /admin/actions/controls/preview
 * ---------------------------------------------
 *
 * Phase 30 – Option B
 * Live control effectiveness preview.
 *
 * Read-only.
 * Uses the same evaluator as dispatcher.
 */
export const previewControlDecision = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const { actionKey, riskLevel, dryRun } = req.body;

    if (!actionKey) {
      throw new Error("actionKey is required");
    }

    if (
      !riskLevel ||
      !["low", "medium", "high", "critical"].includes(riskLevel)
    ) {
      throw new Error("Invalid riskLevel");
    }

    const activeControls = await AdminControl.find({});

    const decision = evaluateAdminControls(activeControls, {
      actionKey,
      riskLevel,
      dryRun: !!dryRun,
    });

    res.json(
      adminResponse({
        data: decision,
      })
    );
  }
);

/**
 * ---------------------------------------------
 * POST /admin/actions/controls
 * ---------------------------------------------
 */
export const createControl = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const adminId = req.user!.id;
    const { scope, mode, actionKey, appliesTo, expiresAt, reason } = req.body;

    const now = new Date();

    const allowedScopes = ["GLOBAL", "ACTION", "EMERGENCY"];

    if (!allowedScopes.includes(scope)) {
      throw new Error("Invalid control scope");
    }

    if (!mode) throw new Error("mode is required");

    if (!reason || typeof reason !== "string" || !reason.trim()) {
      throw new Error("reason is required");
    }

    if (scope === "GLOBAL") {
      if (actionKey || appliesTo) {
        throw new Error(
          "GLOBAL controls must not define actionKey or appliesTo"
        );
      }
    }

    if (scope === "ACTION") {
      if (!actionKey) {
        throw new Error("actionKey is required for ACTION scope");
      }
      if (appliesTo) {
        throw new Error("ACTION controls must not define appliesTo");
      }
    }

    if (scope === "EMERGENCY") {
      if (!appliesTo) {
        throw new Error("appliesTo is required for EMERGENCY scope");
      }
      if (actionKey) {
        throw new Error("EMERGENCY controls must not define actionKey");
      }
      if (!expiresAt) {
        throw new Error("EMERGENCY controls must define expiresAt");
      }
    }

    let parsedExpiresAt: Date | undefined;

    if (expiresAt) {
      parsedExpiresAt = new Date(expiresAt);

      if (Number.isNaN(parsedExpiresAt.getTime())) {
        throw new Error("expiresAt is invalid");
      }

      if (parsedExpiresAt <= now) {
        throw new Error("expiresAt must be in the future");
      }

      const MAX_CONTROL_TTL_DAYS = 7;
      const maxExpiry = new Date(
        now.getTime() + MAX_CONTROL_TTL_DAYS * 24 * 60 * 60 * 1000
      );

      if (parsedExpiresAt > maxExpiry) {
        throw new Error(
          `expiresAt exceeds maximum allowed TTL of ${MAX_CONTROL_TTL_DAYS} days`
        );
      }
    }

    if (scope === "EMERGENCY") {
      const existing = await AdminControl.findOne({
        scope: "EMERGENCY",
        appliesTo,
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
      });

      if (existing) {
        throw new Error(
          "An active emergency control already exists for this scope"
        );
      }
    }

    let control;

    try {
      control = await AdminControl.create({
        scope,
        mode,
        actionKey,
        appliesTo,
        expiresAt: parsedExpiresAt,
        reason: reason.trim(),
        createdBy: adminId,
      });

      await AdminActionLog.create({
        adminId: new mongoose.Types.ObjectId(adminId),
        actionKey: "ADMIN_CONTROL_CREATE",
        actionLabel: "Create admin control",
        actionVersion: 1,
        targetType: "AdminControl",
        targetId: control._id,
        params: {
          scope,
          mode,
          actionKey,
          appliesTo,
          expiresAt: parsedExpiresAt,
        },
        reason: reason.trim(),
        status: "SUCCESS",
        result: { controlId: control._id },
      });
    } catch (err: any) {
      await AdminActionLog.create({
        adminId: new mongoose.Types.ObjectId(adminId),
        actionKey: "ADMIN_CONTROL_CREATE",
        actionLabel: "Create admin control",
        actionVersion: 1,
        targetType: "AdminControl",
        targetId: new mongoose.Types.ObjectId(adminId),
        params: {
          scope,
          mode,
          actionKey,
          appliesTo,
          expiresAt: parsedExpiresAt,
          targetCreated: false,
        },
        reason: reason?.toString?.() || "",
        status: "FAILED",
        error: {
          message: err.message,
          stack: err.stack,
        },
      });

      throw err;
    }

    res.json(adminResponse({ data: control }));
  }
);

/**
 * ---------------------------------------------
 * POST /admin/actions/controls/:id/expire
 * ---------------------------------------------
 */
export const expireControl = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const adminId = req.user!.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid control id");
    }

    const now = new Date();

    let control;

    try {
      control = await AdminControl.findOneAndUpdate(
        {
          _id: id,
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
        },
        {
          $set: { expiresAt: now },
        },
        { new: true }
      );

      if (!control) {
        throw new Error("Control already expired or does not exist");
      }

      await AdminActionLog.create({
        adminId: new mongoose.Types.ObjectId(adminId),
        actionKey: "ADMIN_CONTROL_EXPIRE",
        actionLabel: "Expire admin control",
        actionVersion: 1,
        targetType: "AdminControl",
        targetId: new mongoose.Types.ObjectId(id),
        params: {},
        reason: "Expired via admin UX",
        status: "SUCCESS",
        result: { expiredAt: now },
      });
    } catch (err: any) {
      await AdminActionLog.create({
        adminId: new mongoose.Types.ObjectId(adminId),
        actionKey: "ADMIN_CONTROL_EXPIRE",
        actionLabel: "Expire admin control",
        actionVersion: 1,
        targetType: "AdminControl",
        targetId: new mongoose.Types.ObjectId(id),
        params: {},
        reason: "Expired via admin UX",
        status: "FAILED",
        error: {
          message: err.message,
          stack: err.stack,
        },
      });

      throw err;
    }

    res.json(adminResponse({ data: control }));
  }
);