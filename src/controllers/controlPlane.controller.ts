//backend/src/controllers/controlPlane.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import { ControlPlaneRepository } from "../services/controlPlane/controlPlane.repository";
import { ControlPlaneService } from "../services/controlPlane/controlPlane.service";
import { AuditLog } from "../models/auditLog.model";

export class ControlPlaneController {
  /**
   * List active controls
   */
  static async listActiveControls(req: Request, res: Response) {
    const controls = await ControlPlaneService.listActiveControls();
    res.status(200).json({ data: controls });
  }

  /**
   * Create a control plane rule
   */
  static async createControl(req: Request, res: Response) {
    const {
      scope,
      target,
      enforcement,
      reason,
      expiresAt,
    } = req.body;

    const admin = (req as any).admin;
    const isDryRun = req.headers["x-dry-run"] === "true";

    if (!admin) {
      return res.status(401).json({ error: "Admin context missing" });
    }

    if (isDryRun) {
      return res.status(200).json({
        dryRun: true,
        preview: {
          scope,
          target: target ?? null,
          enforcement,
          reason,
          expiresAt,
        },
      });
    }

    const control = await ControlPlaneRepository.createControl({
      scope,
      target: target ?? null,
      enforcement,
      reason,
      expiresAt,
      isActive: true,
      createdBy: {
        adminId: admin.id,
        email: admin.email,
      },
    });

    await AuditLog.create({
      actorId: new mongoose.Types.ObjectId(admin.id),
      actorType: "ADMIN",
      action: "CONTROL_PLANE_CREATE",
      entityType: "CONTROL_PLANE",
      entityId: new mongoose.Types.ObjectId(control.id),
      after: {
        scope,
        target: target ?? null,
        enforcement,
        reason,
        expiresAt,
        isActive: true,
      },
    });

    res.status(201).json({ data: control });
  }

  /**
   * Deactivate a control plane rule
   */
  static async deactivateControl(req: Request, res: Response) {
    const { controlId } = req.params;
    const admin = (req as any).admin;

    if (!admin) {
      return res.status(401).json({ error: "Admin context missing" });
    }

    await ControlPlaneRepository.deactivateControl(controlId);

    await AuditLog.create({
      actorId: new mongoose.Types.ObjectId(admin.id),
      actorType: "ADMIN",
      action: "CONTROL_PLANE_DEACTIVATE",
      entityType: "CONTROL_PLANE",
      entityId: new mongoose.Types.ObjectId(controlId),
      before: {
        isActive: true,
      },
      after: {
        isActive: false,
      },
    });

    res.status(200).json({ success: true });
  }
}
