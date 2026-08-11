import { Request, Response } from "express";
import mongoose from "mongoose";
import { adminFinancialService } from "../services/admin/adminFinancial.service";
import { adminObjectId, adminReference, parseAdminCreatorBalanceListQuery, parseAdminPayoutListQuery, parseAdminPaymentListQuery, parseAdminRefundListQuery, parseAdminSettlementListQuery, parseAdminWithdrawalListQuery } from "../validators/adminFinancial.validator";
import { creatorBalanceDto, overviewDto, paginatedDto, paymentDto, payoutDto, refundDto, settlementDto, withdrawalDto } from "../dtos/adminFinancial.dto";

const safe = (value: any) => value ? JSON.parse(JSON.stringify(value, (key, item) => /providerPayload|encrypted|accountNumber|ifsc|upi|token|secret/i.test(key) ? undefined : item)) : value;
const send = (res: Response, data: unknown) => res.json({ success: true, data: safe(data) });
export const adminFinancialController = {
  listPayments: async (req: Request,res: Response) => send(res, paginatedDto(await adminFinancialService.getPayments(parseAdminPaymentListQuery(req.query)), paymentDto)),
  listRefunds: async (req: Request,res: Response) => send(res, paginatedDto(await adminFinancialService.getRefunds(parseAdminRefundListQuery(req.query)), refundDto)),
  listSettlements: async (req: Request,res: Response) => send(res, paginatedDto(await adminFinancialService.getSettlements(parseAdminSettlementListQuery(req.query)), settlementDto)),
  listBalances: async (req: Request,res: Response) => send(res, paginatedDto(await adminFinancialService.getCreatorBalances(parseAdminCreatorBalanceListQuery(req.query)), creatorBalanceDto)),
  listWithdrawals: async (req: Request,res: Response) => send(res, paginatedDto(await adminFinancialService.getWithdrawals(parseAdminWithdrawalListQuery(req.query)), withdrawalDto)),
  listPayouts: async (req: Request,res: Response) => send(res, paginatedDto(await adminFinancialService.getPayouts(parseAdminPayoutListQuery(req.query)), payoutDto)),
  overview: async (_req: Request,res: Response) => send(res, overviewDto(await adminFinancialService.getOverview())),
  payment: async (req: Request,res: Response) => send(res, paymentDto(await adminFinancialService.getPayment(adminReference(req.params.paymentReference)))),
  refund: async (req: Request,res: Response) => send(res, refundDto(await adminFinancialService.getRefund(adminReference(req.params.refundReference)))),
  settlement: async (req: Request,res: Response) => send(res, settlementDto(await adminFinancialService.getSettlement(adminReference(req.params.settlementReference)))),
  withdrawal: async (req: Request,res: Response) => send(res, withdrawalDto(await adminFinancialService.getWithdrawal(adminReference(req.params.withdrawalReference)))),
  payout: async (req: Request,res: Response) => send(res, payoutDto(await adminFinancialService.getPayout(adminReference(req.params.payoutReference)))),
  balance: async (req: Request,res: Response) => send(res, creatorBalanceDto(await adminFinancialService.getCreatorBalance(adminObjectId(req.params.creatorId,"creatorId")))),
  syncPayment: async (req: Request,res: Response) => { const x:any=await adminFinancialService.syncPayment(adminReference(req.params.paymentReference), req.user!.id); send(res,{operation:"PAYMENT_SYNC",resourceReference:req.params.paymentReference,result:x.result ?? "EXECUTED",resource:paymentDto(x.payment)}); },
  syncRefund: async (req: Request,res: Response) => { const x:any=await adminFinancialService.syncRefund(adminReference(req.params.refundReference), req.user!.id); send(res,{operation:"REFUND_SYNC",resourceReference:req.params.refundReference,result:"NO_SYNCHRONIZATION_ACTION_AVAILABLE",resource:refundDto(x.refund)}); },
  recheckSettlement: async (req: Request,res: Response) => { const x:any=await adminFinancialService.recheckSettlement(adminReference(req.params.settlementReference), req.user!.id); send(res,{operation:"SETTLEMENT_RECHECK",resourceReference:req.params.settlementReference,result:x.result ?? "EXECUTED",resource:settlementDto(x.settlement)}); },
  processWithdrawal: async (req: Request,res: Response) => { const x:any=await adminFinancialService.processWithdrawal(adminReference(req.params.withdrawalReference), req.user!.id); send(res,{operation:"WITHDRAWAL_PROCESS",resourceReference:req.params.withdrawalReference,result:x.result ?? "EXECUTED",resource:withdrawalDto(x.withdrawal)}); },
  syncWithdrawal: async (req: Request,res: Response) => { const x:any=await adminFinancialService.synchronizeWithdrawal(adminReference(req.params.withdrawalReference), req.user!.id); send(res,{operation:"WITHDRAWAL_SYNC",resourceReference:req.params.withdrawalReference,result:x.result ?? "EXECUTED",resource:withdrawalDto(x.withdrawal)}); },
  syncPayout: async (req: Request,res: Response) => { const x:any=await adminFinancialService.syncPayout(adminReference(req.params.payoutReference), req.user!.id); send(res,{operation:"PAYOUT_SYNC",resourceReference:req.params.payoutReference,result:x.result ?? "EXECUTED",resource:payoutDto(x.payout)}); },
};
