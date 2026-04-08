//backend/src/controlllers/controlPlaneFeatureFlags.controller.ts

import { Request, Response } from "express";
import { FeatureFlagService } from "../services/controlPlane/featureFlag.service";

export const listFeatureFlags = async (req: Request, res: Response) => {
  const flags = await FeatureFlagService.getAll();
  res.json({ success: true, data: flags });
};

export const createFeatureFlag = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const flag = await FeatureFlagService.create(req.body, adminId);
  res.status(201).json({ success: true, data: flag });
};

export const updateFeatureFlag = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const { flagId } = req.params;

  const flag = await FeatureFlagService.update(flagId, req.body, adminId);
  res.json({ success: true, data: flag });
};

export const toggleFeatureFlag = async (req: Request, res: Response) => {
  const adminId = req.user!.id;
  const { flagId } = req.params;
  const { enabled } = req.body;

  const flag = await FeatureFlagService.toggle(flagId, enabled, adminId);
  res.json({ success: true, data: flag });
};

export const deleteFeatureFlag = async (req: Request, res: Response) => {
  const { flagId } = req.params;
  await FeatureFlagService.remove(flagId);
  res.json({ success: true });
};
