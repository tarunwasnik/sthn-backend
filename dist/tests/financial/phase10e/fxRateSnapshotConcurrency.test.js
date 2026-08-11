"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const fxRateAudit_model_1 = require("../../../models/fxRateAudit.model");
const fxRateSnapshotFixtures_1 = require("./fixtures/fxRateSnapshotFixtures");
const allFulfilled = (items) => items.filter((item) => item.status === "fulfilled").length;
const registerConcurrencyTests = () => {
    (0, node_test_1.test)("phase10e concurrency: ten normal empty-cache lookups converge on one immutable snapshot", async () => {
        const { service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor)));
        strict_1.default.equal(allFulfilled(settled), 10);
        const references = settled.filter((item) => item.status === "fulfilled").map((item) => item.value.snapshotReference);
        strict_1.default.equal(new Set(references).size, 1);
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 1);
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({ status: "ACTIVE" }), 1);
        strict_1.default.equal(await fxRateAudit_model_1.FxRateAudit.countDocuments({
            action: "FX_RATE_SNAPSHOT_CREATED",
        }), 1);
    });
    (0, node_test_1.test)("phase10e concurrency: ten identical forced refreshes converge", async () => {
        const { actors, service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const settled = await Promise.allSettled(Array.from({ length: 10 }, () => service.refresh("INR", "USD", true, (0, fxRateSnapshotFixtures_1.adminActor)(actors))));
        strict_1.default.equal(allFulfilled(settled), 10);
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 1);
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({ status: "ACTIVE" }), 1);
    });
    (0, node_test_1.test)("phase10e concurrency: current lookups remain available while a new refresh commits", async () => {
        const { actors, provider, service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const first = await service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor);
        (0, fxRateSnapshotFixtures_1.setRate)(provider, "INR", "USD", "0.011700", "2026-08-03T00:00:00.000Z", "20260803-V2");
        provider.delayMs = 80;
        const refresh = service.refresh("INR", "USD", true, (0, fxRateSnapshotFixtures_1.adminActor)(actors));
        const reads = await Promise.all(Array.from({ length: 5 }, () => service.getCurrent("INR", "USD")));
        strict_1.default.ok(reads.every((item) => item.snapshotReference === first.snapshotReference));
        const second = await refresh;
        strict_1.default.notEqual(second.snapshotReference, first.snapshotReference);
        strict_1.default.equal((await service.getCurrent("INR", "USD")).snapshotReference, second.snapshotReference);
    });
    (0, node_test_1.test)("phase10e concurrency: old/new effective-date race leaves newest current and both historical", async () => {
        const { actors, provider, service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        provider.enqueueRate({
            rate: "0.011500",
            effectiveDate: new Date("2026-08-02T00:00:00.000Z"),
            providerReference: "DAILY-INR-USD-20260802-V1",
        });
        provider.enqueueRate({
            rate: "0.011700",
            effectiveDate: new Date("2026-08-03T00:00:00.000Z"),
            providerReference: "DAILY-INR-USD-20260803-V2",
        });
        const oldRefresh = service.refresh("INR", "USD", true, (0, fxRateSnapshotFixtures_1.adminActor)(actors));
        const newRefresh = service.refresh("INR", "USD", true, (0, fxRateSnapshotFixtures_1.adminActor)(actors));
        const settled = await Promise.allSettled([oldRefresh, newRefresh]);
        strict_1.default.equal(allFulfilled(settled), 2);
        const snapshots = await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({}).sort({ effectiveDate: 1 });
        strict_1.default.equal(snapshots.length, 2);
        strict_1.default.deepEqual(snapshots.map((item) => item.status), ["SUPERSEDED", "ACTIVE"]);
        strict_1.default.equal(snapshots[1].effectiveDate.toISOString().slice(0, 10), "2026-08-03");
    });
};
exports.registerConcurrencyTests = registerConcurrencyTests;
