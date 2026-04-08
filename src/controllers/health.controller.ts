//backend/src/controllers/health.controller.ts

import { Request, Response } from "express";

export async function healthCheck(_req: Request, res: Response) {
  res.json({
    status: "ok",
    uptime: process.uptime(),
  });
}

export async function readinessCheck(_req: Request, res: Response) {
  res.json({
    ready: true,
    timestamp: new Date().toISOString(),
  });
}
