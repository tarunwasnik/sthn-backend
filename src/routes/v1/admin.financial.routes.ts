import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { authorizeRoles } from "../../middlewares/authorize.middleware";
import { adminFinancialController as c } from "../../controllers/adminFinancial.controller";
import { adminWalletTopUpRequestController as topUps } from "../../controllers/adminWalletTopUpRequest.controller";
import { decideWalletTopUpRequest } from "../../controllers/adminWalletTopUpDecision.controller";
import { startWalletTopUpProcessing } from "../../controllers/adminWalletTopUpFunding.controller";
import { completeWalletTopUpAccounting } from "../../controllers/adminWalletTopUpAccounting.controller";
import { adminWalletTopUpReconciliationController as reconciliation } from "../../controllers/adminWalletTopUpReconciliation.controller";
import { adminCreatorWithdrawalOperationalController as withdrawalOperations } from "../../controllers/adminCreatorWithdrawalOperational.controller";
import { fxRateSnapshotController as fxRates } from "../../controllers/fxRateSnapshot.controller";
import { adminWalletConversionDecisionController as conversions } from
  "../../controllers/adminWalletConversionDecision.controller";
import { adminWalletConversionProviderExecutionController as
  conversionProvider } from
  "../../controllers/adminWalletConversionProviderExecution.controller";
import { adminWalletConversionAccountingController as conversionAccounting } from
  "../../controllers/adminWalletConversionAccounting.controller";
import { adminWalletConversionOperationalController as conversionOperations } from
  "../../controllers/adminWalletConversionOperational.controller";
import { adminBookingEscrowController as bookingEscrow } from "../../controllers/adminBookingEscrow.controller";
import { adminPlatformRevenueController as platformRevenue } from "../../controllers/adminPlatformRevenue.controller";
const router = Router(); router.use(protect, authorizeRoles("admin"));
router.get("/overview", c.overview);
router.get("/payments", c.listPayments); router.get("/payments/:paymentReference/financial-detail", c.paymentFinancialDetail); router.get("/payments/:paymentReference", c.payment); router.post("/payments/:paymentReference/sync", c.syncPayment);
router.get("/refunds", c.listRefunds); router.get("/refunds/:refundReference", c.refund); router.post("/refunds/:refundReference/sync", c.syncRefund);
router.get("/settlements", c.listSettlements); router.get("/settlements/:settlementReference", c.settlement); router.post("/settlements/:settlementReference/recheck", c.recheckSettlement);
router.get("/creator-balances", c.listBalances); router.get("/creator-balances/:creatorId", c.balance);
router.get("/withdrawals", c.listWithdrawals); router.get("/withdrawals/:withdrawalReference", c.withdrawal); router.post("/withdrawals/:withdrawalReference/process", c.processWithdrawal); router.post("/withdrawals/:withdrawalReference/sync", c.syncWithdrawal);
router.get("/payouts", c.listPayouts); router.get("/payouts/:payoutReference", c.payout); router.post("/payouts/:payoutReference/sync", c.syncPayout);
router.get("/wallet-top-up-requests", topUps.list.bind(topUps)); router.get("/wallet-top-up-requests/:topUpReference", topUps.get.bind(topUps));
router.patch("/wallet-top-up-requests/:topUpReference/decision", decideWalletTopUpRequest);
router.post("/wallet-top-up-requests/:topUpReference/start-processing", startWalletTopUpProcessing);
router.post("/wallet-top-up-requests/:topUpReference/complete-accounting", completeWalletTopUpAccounting);
router.get("/wallet-top-up-requests/:topUpReference/reconciliation", reconciliation.inspect.bind(reconciliation));
router.get("/wallet-top-up-reconciliations", reconciliation.list.bind(reconciliation));
router.post("/wallet-top-up-requests/:topUpReference/finalize-provider-failure", reconciliation.finalizeProviderFailure.bind(reconciliation));
router.post("/wallet-top-up-reconciliations/:reconciliationReference/retry", reconciliation.retry.bind(reconciliation));
router.post("/wallet-top-up-reconciliations/:reconciliationReference/repair", reconciliation.repair.bind(reconciliation));
router.patch("/wallet-top-up-reconciliations/:reconciliationReference/status", reconciliation.updateStatus.bind(reconciliation));
router.get("/creator-withdrawals/:withdrawalReference/reconciliation", withdrawalOperations.inspect.bind(withdrawalOperations));
router.get("/creator-withdrawal-reconciliations", withdrawalOperations.list.bind(withdrawalOperations));
router.post("/creator-withdrawal-reconciliations/:reconciliationReference/retry", withdrawalOperations.retry.bind(withdrawalOperations));
router.post("/creator-withdrawal-reconciliations/:reconciliationReference/repair", withdrawalOperations.repair.bind(withdrawalOperations));
router.patch("/creator-withdrawal-reconciliations/:reconciliationReference/status", withdrawalOperations.updateStatus.bind(withdrawalOperations));
router.get("/fx-rates", fxRates.list.bind(fxRates));
router.post("/fx-rates/refresh", fxRates.refresh.bind(fxRates));
router.get("/platform-revenue", platformRevenue.summary);
router.get("/platform-revenue/entries", platformRevenue.entries);
router.get("/booking-escrow", bookingEscrow.list.bind(bookingEscrow));
router.get("/booking-escrow/:bookingReference", bookingEscrow.get.bind(bookingEscrow));
router.post("/booking-escrow/:bookingReference/release", bookingEscrow.release.bind(bookingEscrow));
router.get("/wallet-conversion-requests",
  conversions.list.bind(conversions));
router.get("/wallet-conversion-requests/:conversionReference",
  conversions.get.bind(conversions));
router.patch("/wallet-conversion-requests/:conversionReference/decision",
  conversions.decide.bind(conversions));
router.post("/wallet-conversion-requests/:conversionReference/execute-provider",
  conversionProvider.execute.bind(conversionProvider));
router.post("/wallet-conversion-requests/:conversionReference/complete-accounting",
  conversionAccounting.complete.bind(conversionAccounting));
router.get("/wallet-conversion-requests/:conversionReference/reconciliation",
  conversionOperations.reconcile.bind(conversionOperations));
router.post("/wallet-conversion-reconciliations/:reconciliationReference/retry",
  conversionOperations.retry.bind(conversionOperations));
router.post("/wallet-conversion-reconciliations/:reconciliationReference/repair",
  conversionOperations.repair.bind(conversionOperations));
export default router;
