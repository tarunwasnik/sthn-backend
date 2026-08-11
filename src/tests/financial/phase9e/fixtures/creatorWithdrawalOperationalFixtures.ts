import jwt from "jsonwebtoken";
import http from "node:http";
import express from "express";

import { WithdrawalProviderExecutionOutcome } from
  "../../../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { AuditLog } from "../../../../models/auditLog.model";
import { CreatorWithdrawalRequest } from
  "../../../../models/creatorWithdrawalRequest.model";
import { LedgerEntry } from "../../../../models/ledgerEntry.model";
import { Wallet } from "../../../../models/wallet.model";
import { WalletProjectionOperation } from
  "../../../../models/walletProjectionOperation.model";
import { creatorWithdrawalFinalizationService } from
  "../../../../services/financial/creatorWithdrawalFinalization.service";
import adminRoutes from "../../../../routes/v1/admin.routes";
import adminFinancialRoutes from "../../../../routes/v1/admin.financial.routes";
import bookingRoutes from "../../../../routes/v1/booking.routes";
import creatorCancelRoutes from
  "../../../../routes/v1/creatorCancelBooking.routes";
import creatorDecisionRoutes from
  "../../../../routes/v1/creatorBookingDecision.routes";
import withdrawalRoutes from "../../../../routes/v1/withdrawal.routes";
import { errorHandler } from "../../../../middlewares/errorHandler";
import { notFound } from "../../../../middlewares/notFound";
import {
  createTerminalWithdrawalFixture,
} from "../../phase9d/fixtures/creatorWithdrawalFinalizationFixtures";
import { createInitializedWithdrawalProviderFixture } from
  "../../phase9c/fixtures/withdrawalProviderExecutionFixtures";

export const startCreatorWithdrawalHttpServer = async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/bookings", bookingRoutes);
  app.use("/api/v1/bookings/creator", creatorCancelRoutes);
  app.use("/api/v1/creator", creatorDecisionRoutes);
  app.use("/api/v1/admin/financial", adminFinancialRoutes);
  app.use("/api/v1/admin", adminRoutes);
  app.use("/api/v1/withdrawals", withdrawalRoutes);
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error(
    "Phase 9E test server did not bind.",
  );
  return { baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())) };
};

export const createPendingFinalizationFixture = (
  baseUrl: string,
  outcome: WithdrawalProviderExecutionOutcome,
) => createTerminalWithdrawalFixture(baseUrl, outcome);

export const createHealthyWithdrawalFixture = async (
  baseUrl: string,
  outcome: WithdrawalProviderExecutionOutcome,
) => {
  const fixture = await createPendingFinalizationFixture(baseUrl, outcome);
  const finalization = await creatorWithdrawalFinalizationService.finalize(
    fixture.withdrawal.withdrawalReference,
  );
  return { ...fixture, finalization };
};

export { createInitializedWithdrawalProviderFixture };

export const adminToken = (id: string) => jwt.sign(
  { id, role: "admin" }, process.env.JWT_SECRET!, { expiresIn: "1h" },
);

export const snapshotWithdrawalOperationalMoney = async (
  withdrawalReference: string,
  walletId: unknown,
) => {
  const wallet = await Wallet.findById(walletId).orFail();
  const withdrawal = await CreatorWithdrawalRequest.findOne({
    withdrawalReference,
  }).orFail();
  return {
    wallet: {
      currentBalance: wallet.currentBalance,
      availableBalance: wallet.availableBalance,
      reservedBalance: wallet.reservedBalance,
      lockedBalance: wallet.lockedBalance,
      projectionVersion: wallet.projectionVersion,
    },
    withdrawal: { status: withdrawal.status, amount: withdrawal.amount,
      currency: withdrawal.currency, version: withdrawal.version },
    ledgerCount: await LedgerEntry.countDocuments(),
    projectionCount: await WalletProjectionOperation.countDocuments(),
    terminalAuditCount: await AuditLog.countDocuments({
      action: { $in: ["CREATOR_WITHDRAWAL_COMPLETED",
        "CREATOR_WITHDRAWAL_FAILED"] },
    }),
  };
};
