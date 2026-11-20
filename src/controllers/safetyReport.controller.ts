import { Request, Response } from "express"; import { catchAsync } from "../utils/catchAsync"; import { decideSafetyReport, getAdminSafetyReport, getMySafetyReport, listAdminSafetyReports, listMySafetyReports, submitSafetyReport } from "../services/safety/safetyReport.service";
export const createSafetyReport = catchAsync(async (req:Request,res:Response)=>res.status(201).json({ report: await submitSafetyReport(req.user!.id, req.body ?? {}) }));
export const listSafetyReports = catchAsync(async (req:Request,res:Response)=>res.json(await listMySafetyReports(req.user!.id, req.query)));
export const getSafetyReport = catchAsync(async (req:Request,res:Response)=>res.json({ report: await getMySafetyReport(req.user!.id, req.params.reportId) }));
export const adminListSafetyReports = catchAsync(async (req:Request,res:Response)=>res.json(await listAdminSafetyReports(req.query)));
export const adminGetSafetyReport = catchAsync(async (req:Request,res:Response)=>res.json({ report: await getAdminSafetyReport(req.params.reportId) }));
export const adminDecideSafetyReport = catchAsync(async (req:Request,res:Response)=>res.json({ report: await decideSafetyReport(req.user!.id, req.params.reportId, req.body ?? {}) }));
