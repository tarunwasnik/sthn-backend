import { NextFunction, Request, Response } from "express";
import { platformRevenueService } from "../services/financial/platformRevenue.service";
export const adminPlatformRevenueController = {
  summary: async (_req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await platformRevenueService.summary() }); } catch (error) { next(error); } },
  entries: async (req: Request, res: Response, next: NextFunction) => { try { res.json({ success: true, data: await platformRevenueService.entries(req.query as Record<string, unknown>) }); } catch (error) { next(error); } },
};
