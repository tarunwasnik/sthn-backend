"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const fxRateSnapshot_service_1 = require("../../../services/financial/fxRateSnapshot.service");
const fxRateSnapshotFixtures_1 = require("./fixtures/fxRateSnapshotFixtures");
const registerReplayTests = () => {
    (0, node_test_1.test)("phase10e replay returns one snapshot across normal, forced, and service reload calls", async () => {
        const { actors, provider, service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const first = await service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor);
        const reloadedService = new fxRateSnapshot_service_1.FxRateSnapshotService(provider, {
            config: fxRateSnapshotFixtures_1.fxConfig, now: fxRateSnapshotFixtures_1.fixedClock,
        });
        const settled = await Promise.all([
            service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor),
            service.refresh("INR", "USD", true, (0, fxRateSnapshotFixtures_1.adminActor)(actors)),
            reloadedService.getCurrent("INR", "USD"),
            reloadedService.refresh("INR", "USD", true, (0, fxRateSnapshotFixtures_1.adminActor)(actors)),
        ]);
        strict_1.default.ok(settled.every((item) => item.snapshotReference === first.snapshotReference));
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 1);
    });
};
exports.registerReplayTests = registerReplayTests;
