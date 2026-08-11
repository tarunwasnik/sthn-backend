"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSettledOperationalFixture = exports.startOperationalHttpServer = void 0;
const bookingCreatorSettlement_model_1 = require("../../../../models/bookingCreatorSettlement.model");
const bookingCreatorSettlement_service_1 = require("../../../../services/financial/bookingCreatorSettlement.service");
const bookingCreatorSettlementFixtures_1 = require("../../phase8e/fixtures/bookingCreatorSettlementFixtures");
exports.startOperationalHttpServer = bookingCreatorSettlementFixtures_1.startSettlementHttpServer;
const createSettledOperationalFixture = async (baseUrl) => {
    const fixture = await (0, bookingCreatorSettlementFixtures_1.createAllocatedCreatorSettlementFixture)(baseUrl);
    await bookingCreatorSettlement_service_1.bookingCreatorSettlementService.settle(fixture.booking._id.toString());
    const settlement = await bookingCreatorSettlement_model_1.BookingCreatorSettlement.findOne({
        bookingId: fixture.booking._id,
    }).select("+settlementKey +captureTransactionId +allocationTransactionId " +
        "+settlementTransactionId +settlementFingerprint " +
        "+settlementProjectionOperationReference +settlementLedgerEntryIds").orFail();
    return { ...fixture, settlement };
};
exports.createSettledOperationalFixture = createSettledOperationalFixture;
