"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const fxRateAudit_model_1 = require("../../../models/fxRateAudit.model");
const fxRateSnapshotFixtures_1 = require("./fixtures/fxRateSnapshotFixtures");
const registerFailureTests = () => {
    for (const point of ["AFTER_PROVIDER_VALIDATION", "AFTER_SNAPSHOT_CREATION",
        "BEFORE_AUDIT", "BEFORE_COMMIT"]) {
        (0, node_test_1.test)(`phase10e rollback: ${point} leaves no successful snapshot authority`, async () => {
            const fixture = await (0, fxRateSnapshotFixtures_1.createFxFixture)({
                failureInjector: (actual) => {
                    if (actual === point)
                        throw new Error(`INJECT_${point}`);
                },
            });
            await strict_1.default.rejects(() => fixture.service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor));
            strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 0);
            strict_1.default.equal(await fxRateAudit_model_1.FxRateAudit.countDocuments({
                result: { $ne: "FAILED" },
            }), 0);
        });
    }
    (0, node_test_1.test)("phase10e rollback: supersession interruption preserves prior ACTIVE snapshot", async () => {
        const firstFixture = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const first = await firstFixture.service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor);
        (0, fxRateSnapshotFixtures_1.setRate)(firstFixture.provider, "INR", "USD", "0.011700", "2026-08-03T00:00:00.000Z", "20260803-V2");
        const failing = new firstFixture.service.constructor(firstFixture.provider, {
            config: {
                providerName: "DETERMINISTIC_FX",
                baseUrl: "https://unused.test/fx",
                timeoutMs: 1000,
                maxAgeMs: 72 * 60 * 60 * 1000,
                snapshotValidityMs: 24 * 60 * 60 * 1000,
                requestEnabled: true,
            },
            now: () => new Date("2026-08-02T12:00:00.000Z"),
            failureInjector: (point) => {
                if (point === "AFTER_SUPERSESSION")
                    throw new Error("ABORT_SUPERSESSION");
            },
        });
        const fallback = await failing.refresh("INR", "USD", true, fxRateSnapshotFixtures_1.systemActor);
        strict_1.default.equal(fallback.snapshotReference, first.snapshotReference);
        strict_1.default.equal(fallback.cachedFallback, true);
        const snapshots = await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({});
        strict_1.default.equal(snapshots.length, 1);
        strict_1.default.equal(snapshots[0].snapshotReference, first.snapshotReference);
        strict_1.default.equal(snapshots[0].status, "ACTIVE");
    });
};
exports.registerFailureTests = registerFailureTests;
