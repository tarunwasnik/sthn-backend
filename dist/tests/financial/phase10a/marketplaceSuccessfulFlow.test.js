"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMarketplaceSuccessfulFlowTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const marketplaceFixtures_1 = require("./fixtures/marketplaceFixtures");
const registerMarketplaceSuccessfulFlowTests = () => {
    (0, node_test_1.test)("phase10a executes the complete successful marketplace lifecycle", async () => {
        const flow = await (0, marketplaceFixtures_1.createSuccessfulMarketplaceFlow)();
        try {
            strict_1.default.deepEqual(flow.walletTimeline.customerAfterTopUp, { available: 2000, reserved: 0, locked: 0, total: 2000,
                version: 1 });
            strict_1.default.deepEqual(flow.walletTimeline.customerAfterReservation, { available: 950, reserved: 1050, locked: 0, total: 2000,
                version: 2 });
            strict_1.default.deepEqual(flow.walletTimeline.customerAfterCapture, { available: 950, reserved: 0, locked: 0, total: 950,
                version: 3 });
            strict_1.default.deepEqual(flow.walletTimeline.creatorBeforeSettlement, { available: 0, reserved: 0, locked: 0, total: 0, version: 0 });
            strict_1.default.deepEqual(flow.walletTimeline.creatorAfterSettlement, { available: 800, reserved: 0, locked: 0, total: 800, version: 1 });
            strict_1.default.deepEqual(flow.walletTimeline.creatorAfterWithdrawalReservation, { available: 0, reserved: 800, locked: 0, total: 800, version: 2 });
            strict_1.default.deepEqual(flow.walletTimeline.creatorAfterWithdrawal, { available: 0, reserved: 0, locked: 0, total: 0, version: 3 });
            strict_1.default.deepEqual(flow.lifecycle.booking, ["REQUESTED", "CONFIRMED", "COMPLETED"]);
            strict_1.default.deepEqual(flow.lifecycle.payment, ["AUTHORIZED", "CAPTURED"]);
            strict_1.default.deepEqual(flow.lifecycle.reservation, ["ACTIVE", "CAPTURED"]);
            strict_1.default.deepEqual(flow.lifecycle.provider, ["CREATED", "INITIALIZED", "PROCESSING", "SUCCEEDED"]);
            strict_1.default.deepEqual(flow.lifecycle.withdrawal, ["PENDING", "RESERVED", "COMPLETED"]);
            strict_1.default.equal(flow.allocation.status, "ALLOCATED");
            strict_1.default.equal(flow.settlement.status, "SETTLED");
            strict_1.default.equal(flow.reconciliation.classification, "HEALTHY_COMPLETED");
            strict_1.default.equal(flow.reconciliation.severity, "INFO");
            strict_1.default.deepEqual(flow.reconciliation.issueCodes, []);
            strict_1.default.equal(flow.reconciliation.retryCount, 0);
        }
        finally {
            await flow.server.close();
        }
    });
};
exports.registerMarketplaceSuccessfulFlowTests = registerMarketplaceSuccessfulFlowTests;
