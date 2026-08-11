"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalPayment_model_1 = __importDefault(require("../../../models/internalProvider/internalPayment.model"));
const internalPayout_model_1 = __importDefault(require("../../../models/internalProvider/internalPayout.model"));
const internalTopUpFunding_model_1 = require("../../../models/internalTopUpFunding.model");
const payout_model_1 = require("../../../models/payout.model");
const refund_model_1 = require("../../../models/refund.model");
const withdrawal_model_1 = require("../../../models/withdrawal.model");
const bookingCreatorSettlementOperationalInspection_service_1 = require("../../../services/financial/bookingCreatorSettlementOperationalInspection.service");
const creatorWithdrawalRequestFixtures_1 = require("./fixtures/creatorWithdrawalRequestFixtures");
const registerWithdrawalRegressionTests = () => {
    (0, node_test_1.test)("phase9a authenticated endpoint reserves only and preserves Phase 8F integrity", async () => {
        const server = await (0, creatorWithdrawalRequestFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalRequestFixtures_1.createEligibleCreatorWithdrawalFixture)(server.baseUrl);
            const before = {
                payouts: await payout_model_1.Payout.countDocuments(),
                withdrawals: await withdrawal_model_1.Withdrawal.countDocuments(),
                internalPayments: await internalPayment_model_1.default.countDocuments(),
                internalPayouts: await internalPayout_model_1.default.countDocuments(),
                topUpFundings: await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(),
                refunds: await refund_model_1.Refund.countDocuments(),
            };
            const response = await (0, creatorWithdrawalRequestFixtures_1.postCreatorWithdrawal)(server.baseUrl, fixture.creatorToken, {
                amount: fixture.input.amount.amount,
                currency: fixture.input.amount.currency,
                destinationReference: fixture.input.destinationReference,
                idempotencyKey: fixture.input.idempotencyKey,
            });
            strict_1.default.equal(response.status, 201);
            strict_1.default.equal(response.body.data.status, "RESERVED");
            strict_1.default.equal("_id" in response.body.data, false);
            strict_1.default.equal(await payout_model_1.Payout.countDocuments(), before.payouts);
            strict_1.default.equal(await withdrawal_model_1.Withdrawal.countDocuments(), before.withdrawals);
            strict_1.default.equal(await internalPayment_model_1.default.countDocuments(), before.internalPayments);
            strict_1.default.equal(await internalPayout_model_1.default.countDocuments(), before.internalPayouts);
            strict_1.default.equal(await internalTopUpFunding_model_1.InternalTopUpFunding.countDocuments(), before.topUpFundings);
            strict_1.default.equal(await refund_model_1.Refund.countDocuments(), before.refunds);
            const inspection = await bookingCreatorSettlementOperationalInspection_service_1.bookingCreatorSettlementOperationalInspectionService.inspect(fixture.settlement.settlementReference);
            strict_1.default.equal(inspection.classification, "HEALTHY");
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalRegressionTests = registerWithdrawalRegressionTests;
