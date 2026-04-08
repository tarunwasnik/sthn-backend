import { Request, Response, NextFunction } from "express";
import {
  ControlPlaneScope,
  ControlPlaneEnforcement,
} from "../types/controlPlane.types";

/**
 * Validate payload for creating a control plane rule
 */
export function validateCreateControl(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const {
    scope,
    target,
    enforcement,
    reason,
    expiresAt,
  } = req.body;

  if (!Object.values(ControlPlaneScope).includes(scope)) {
    return res.status(400).json({ error: "Invalid control scope" });
  }

  if (!Object.values(ControlPlaneEnforcement).includes(enforcement)) {
    return res.status(400).json({ error: "Invalid enforcement type" });
  }

  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return res.status(400).json({ error: "Reason is required" });
  }

  if (reason.length > 1024) {
    return res.status(400).json({ error: "Reason exceeds maximum length" });
  }

  if (
    (scope === ControlPlaneScope.GLOBAL ||
      scope === ControlPlaneScope.EMERGENCY) &&
    target != null
  ) {
    return res.status(400).json({
      error: `${scope} controls must not define a target`,
    });
  }

  if (scope === ControlPlaneScope.ACTION) {
    if (!target || typeof target !== "string" || target.trim().length === 0) {
      return res.status(400).json({
        error: "ACTION controls must define a valid target",
      });
    }
  }

  if (expiresAt !== undefined && expiresAt !== null) {
    const expiry = new Date(expiresAt);

    if (Number.isNaN(expiry.getTime())) {
      return res.status(400).json({ error: "Invalid expiresAt value" });
    }

    if (expiry.getTime() <= Date.now()) {
      return res.status(400).json({
        error: "expiresAt must be in the future",
      });
    }
  }

  next();
}
