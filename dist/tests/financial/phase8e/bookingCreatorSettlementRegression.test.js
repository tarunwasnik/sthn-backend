"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookingCreatorSettlementRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const ledgerSource_enum_1 = require("../../../enums/financial/ledgerSource.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const bookingCreatorSettlement_model_1 = require("../../../models/bookingCreatorSettlement.model");
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const payout_model_1 = require("../../../models/payout.model");
const refund_model_1 = require("../../../models/refund.model");
const settlement_model_1 = require("../../../models/settlement.model");
const withdrawal_model_1 = require("../../../models/withdrawal.model");
const bookingCreatorSettlement_service_1 = require("../../../services/financial/bookingCreatorSettlement.service");
const bookingCreatorSettlementFixtures_1 = require("./fixtures/bookingCreatorSettlementFixtures");
const registerBookingCreatorSettlementRegressionTests = () => {
    (0, node_test_1.test)("phase8e settlement does not enter provider, top-up, payout, withdrawal, refund, or legacy settlement domains", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            const beforeTopUps = await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments();
            await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString());
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments({
                paymentId: fixture.payment._id,
            }), 0);
            strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(), beforeTopUps);
            strict_1.default.equal(await settlement_model_1.Settlement.countDocuments({
                bookingId: fixture.booking._id,
            }), 0);
            strict_1.default.equal(await payout_model_1.Payout.countDocuments(), 0);
            strict_1.default.equal(await withdrawal_model_1.Withdrawal.countDocuments(), 0);
            strict_1.default.equal(await refund_model_1.Refund.countDocuments({
                paymentId: fixture.payment._id,
            }), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: fixture.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
                account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_ESCROW,
            }), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                bookingId: fixture.booking._id,
                source: ledgerSource_enum_1.LedgerSource.BOOKING_CREATOR_WALLET_SETTLEMENT,
                account: ledgerAccount_enum_1.LedgerAccount.PLATFORM_COMMISSION_PAYABLE,
            }), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase8e settlement authority indexes exist in MongoDB", async () => {
        const indexes = await bookingCreatorSettlement_model_1.BookingCreatorSettlement.collection.indexes();
        for (const field of [
            "settlementReference",
            "settlementKey",
            "allocationId",
            "bookingId",
            "paymentId",
            "reservationId",
            "settlementTransactionId",
            "settlementProjectionOperationReference",
        ]) {
            const index = indexes.find((candidate) => candidate.key[field] === 1);
            strict_1.default.ok(index, `${field} index is missing`);
            strict_1.default.equal(index.unique, true);
        }
        strict_1.default.ok(indexes.find((candidate) => candidate.key.status === 1 && candidate.key.settledAt === -1));
        strict_1.default.ok(indexes.find((candidate) => candidate.key.creatorId === 1 && candidate.key.settledAt === -1));
        strict_1.default.ok(indexes.find((candidate) => candidate.key.creatorUserId === 1 && candidate.key.settledAt === -1));
        strict_1.default.ok(indexes.find((candidate) => candidate.key.creatorWalletId === 1 && candidate.key.settledAt === -1));
    });
    (0, node_test_1.test)("phase8e exact replay rejects missing success audit", async () => {
        const server = await (0, bookingCreatorSettlementFixtures_1.startSettlementHttpServer)();
        try {
            const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(server.baseUrl);
            const settled = await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString());
            await auditLog_model_1.AuditLog.deleteOne({
                action: auditAction_enum_1.AuditAction.BOOKING_CREATOR_WALLET_SETTLED,
                "financialContext.primaryReference": settled.settlement.settlementReference,
            });
            await strict_1.default.rejects(bookingCreatorSettlement_service_1.bookingCreatorSettlementService.validateReplay(fixture.booking._id.toString()), (error) => {
                strict_1.default.equal(error?.code, "BOOKING_CREATOR_SETTLEMENT_INTEGRITY_ERROR");
                return true;
            });
        }
        finally {
            await server.close();
        }
    });
};
exports.registerBookingCreatorSettlementRegressionTests = registerBookingCreatorSettlementRegressionTests;
