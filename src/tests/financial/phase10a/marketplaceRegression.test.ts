import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditAction } from "../../../enums/financial/auditAction.enum";
import { AuditLog } from "../../../models/auditLog.model";
import { Booking } from "../../../models/booking.model";
import { BookingCreatorSettlement } from
  "../../../models/bookingCreatorSettlement.model";
import { BookingEscrowAllocation } from
  "../../../models/bookingEscrowAllocation.model";
import { BookingFundReservation } from
  "../../../models/bookingFundReservation.model";
import { CreatorWithdrawalRepairOperation } from
  "../../../models/creatorWithdrawalRepairOperation.model";
import { CreatorWithdrawalRetryAttempt } from
  "../../../models/creatorWithdrawalRetryAttempt.model";
import { InternalTopUpFunding } from
  "../../../models/internalTopUpFunding.model";
import InternalPaymentModel from
  "../../../models/internalProvider/internalPayment.model";
import { InternalWithdrawalProviderRequest } from
  "../../../models/internalProvider/internalWithdrawalProviderRequest.model";
import { Payment } from "../../../models/payment.model";
import { Payout } from "../../../models/payout.model";
import { Refund } from "../../../models/refund.model";
import { Settlement } from "../../../models/settlement.model";
import { WalletTopUpRequest } from
  "../../../models/walletTopUpRequest.model";
import { Withdrawal } from "../../../models/withdrawal.model";
import { createSuccessfulMarketplaceFlow } from
  "./fixtures/marketplaceFixtures";

export const registerMarketplaceRegressionTests = () => {
  test("phase10a preserves domain isolation and has no operational alerts", async () => {
    const flow = await createSuccessfulMarketplaceFlow();
    try {
      assert.equal(await WalletTopUpRequest.countDocuments({ status: "COMPLETED" }), 1);
      assert.equal(await InternalTopUpFunding.countDocuments({ status: "SUCCEEDED" }), 1);
      assert.equal(await Booking.countDocuments({ status: "COMPLETED" }), 1);
      assert.equal(await Payment.countDocuments({ method: "WALLET",
        status: "CAPTURED" }), 1);
      assert.equal(await BookingFundReservation.countDocuments({
        status: "CAPTURED" }), 1);
      assert.equal(await BookingEscrowAllocation.countDocuments({
        status: "ALLOCATED" }), 1);
      assert.equal(await BookingCreatorSettlement.countDocuments({
        status: "SETTLED" }), 1);
      assert.equal(await InternalWithdrawalProviderRequest.countDocuments({
        providerStatus: "SUCCEEDED" }), 1);
      assert.equal(flow.reconciliation.classification, "HEALTHY_COMPLETED");
      assert.equal(flow.reconciliation.severity, "INFO");
      assert.deepEqual(flow.reconciliation.issueCodes, []);
      assert.equal(await CreatorWithdrawalRetryAttempt.countDocuments(), 0);
      assert.equal(await CreatorWithdrawalRepairOperation.countDocuments(), 0);
      assert.equal(await AuditLog.countDocuments({ action: { $in: [
        AuditAction.CREATOR_WITHDRAWAL_FINALIZATION_RETRIED,
        AuditAction.CREATOR_WITHDRAWAL_METADATA_REPAIRED,
      ] } }), 0);
      assert.equal(await InternalPaymentModel.countDocuments(), 0);
      assert.equal(await Settlement.countDocuments(), 0);
      assert.equal(await Payout.countDocuments(), 0);
      assert.equal(await Withdrawal.countDocuments(), 0);
      assert.equal(await Refund.countDocuments(), 0);
    } finally { await flow.server.close(); }
  });
};
