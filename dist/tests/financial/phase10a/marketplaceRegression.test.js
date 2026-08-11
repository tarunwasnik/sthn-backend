"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMarketplaceRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const booking_model_1 = require("../../../models/booking.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const bookingEscrowAllocation_model_1 = require("../../../models/bookingEscrowAllocation.model");
const bookingFundReservation_model_1 = require("../../../models/bookingFundReservation.model");
const creatorWithdrawalRepairOperation_model_1 = require("../../../models/creatorWithdrawalRepairOperation.model");
const creatorWithdrawalRetryAttempt_model_1 = require("../../../models/creatorWithdrawalRetryAttempt.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const payment_model_1 = require("../../../models/payment.model");
const payout_model_1 = require("../../../models/payout.model");
const refund_model_1 = require("../../../models/refund.model");
const settlement_model_1 = require("../../../models/settlement.model");
const walletTopUpRequest_model_1 = require("../../../models/walletTopUpRequest.model");
const withdrawal_model_1 = require("../../../models/withdrawal.model");
const marketplaceFixtures_1 = require("./fixtures/marketplaceFixtures");
const registerMarketplaceRegressionTests = () => {
    (0, node_test_1.test)("phase10a preserves domain isolation and has no operational alerts", async () => {
        const flow = await (0, marketplaceFixtures_1.createSuccessfulMarketplaceFlow)();
        try {
            strict_1.default.equal(await walletTopUpRequest_model_1.WalletTopUpRequest.countDocuments({ status: "COMPLETED" }), 1);
            strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments({ status: "SUCCEEDED" }), 1);
            strict_1.default.equal(await booking_model_1.Booking.countDocuments({ status: "COMPLETED" }), 1);
            strict_1.default.equal(await payment_model_1.Payment.countDocuments({ method: "WALLET",
                status: "CAPTURED" }), 1);
            strict_1.default.equal(await bookingFundReservation_model_1.BookingFundReservation.countDocuments({
                status: "CAPTURED"
            }), 1);
            strict_1.default.equal(await bookingEscrowAllocation_model_1.BookingEscrowAllocation.countDocuments({
                status: "ALLOCATED"
            }), 1);
            strict_1.default.equal(await bookingCreatorSettlement_model_1.BookingCreatorSettlement.countDocuments({
                status: "SETTLED"
            }), 1);
            strict_1.default.equal(await internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.countDocuments({
                providerStatus: "SUCCEEDED"
            }), 1);
            strict_1.default.equal(flow.reconciliation.classification, "HEALTHY_COMPLETED");
            strict_1.default.equal(flow.reconciliation.severity, "INFO");
            strict_1.default.deepEqual(flow.reconciliation.issueCodes, []);
            strict_1.default.equal(await creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt.countDocuments(), 0);
            strict_1.default.equal(await creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.countDocuments(), 0);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({ action: { $in: [
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_FINALIZATION_RETRIED,
                        auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_METADATA_REPAIRED,
                    ] } }), 0);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments(), 0);
            strict_1.default.equal(await settlement_model_1.Settlement.countDocuments(), 0);
            strict_1.default.equal(await payout_model_1.Payout.countDocuments(), 0);
            strict_1.default.equal(await withdrawal_model_1.Withdrawal.countDocuments(), 0);
            strict_1.default.equal(await refund_model_1.Refund.countDocuments(), 0);
        }
        finally {
            await flow.server.close();
        }
    });
};
exports.registerMarketplaceRegressionTests = registerMarketplaceRegressionTests;
