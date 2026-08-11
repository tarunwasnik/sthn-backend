"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMarketplaceReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const marketplaceFixtures_1 = require("./fixtures/marketplaceFixtures");
const registerMarketplaceReplayTests = () => {
    (0, node_test_1.test)("phase10a sequential replay creates zero duplicate effects", async () => {
        const flow = await (0, marketplaceFixtures_1.createSuccessfulMarketplaceFlow)();
        try {
            const before = await (0, marketplaceFixtures_1.snapshotMarketplaceCounts)();
            const replay = await (0, marketplaceFixtures_1.replaySuccessfulMarketplaceFlow)(flow);
            strict_1.default.deepEqual(await (0, marketplaceFixtures_1.snapshotMarketplaceCounts)(), before);
            strict_1.default.equal(replay.capture.body.replay, true);
            strict_1.default.equal(replay.allocation.replay, true);
            strict_1.default.equal(replay.settlement.replay, true);
            strict_1.default.equal(replay.withdrawal.replay, true);
            strict_1.default.equal(replay.initialized.replay, true);
            strict_1.default.equal(replay.executed.replay, true);
            strict_1.default.equal(replay.finalized.replay, true);
            strict_1.default.equal(replay.reconciliation.classification, "HEALTHY_COMPLETED");
        }
        finally {
            await flow.server.close();
        }
    });
};
exports.registerMarketplaceReplayTests = registerMarketplaceReplayTests;
