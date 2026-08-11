"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMarketplaceConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const marketplaceFixtures_1 = require("./fixtures/marketplaceFixtures");
const registerMarketplaceConcurrencyTests = () => {
    (0, node_test_1.test)("phase10a ten concurrent complete-flow replays converge", async () => {
        const flow = await (0, marketplaceFixtures_1.createSuccessfulMarketplaceFlow)();
        try {
            const before = await (0, marketplaceFixtures_1.snapshotMarketplaceCounts)();
            const results = await Promise.all(Array.from({ length: 10 }, () => (0, marketplaceFixtures_1.replaySuccessfulMarketplaceFlow)(flow)));
            strict_1.default.deepEqual(await (0, marketplaceFixtures_1.snapshotMarketplaceCounts)(), before);
            strict_1.default.equal(new Set(results.map((item) => item.allocation.allocation.allocationReference)).size, 1);
            strict_1.default.equal(new Set(results.map((item) => item.settlement.settlement.settlementReference)).size, 1);
            strict_1.default.equal(new Set(results.map((item) => item.withdrawal.withdrawalReference)).size, 1);
            strict_1.default.ok(results.every((item) => item.reconciliation.classification === "HEALTHY_COMPLETED"));
        }
        finally {
            await flow.server.close();
        }
    });
};
exports.registerMarketplaceConcurrencyTests = registerMarketplaceConcurrencyTests;
