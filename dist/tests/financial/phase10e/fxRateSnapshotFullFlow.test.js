"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFullFlowTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const fxRateAudit_model_1 = require("../../../models/fxRateAudit.model");
const fxRateSnapshotFixtures_1 = require("./fixtures/fxRateSnapshotFixtures");
const registerFullFlowTests = () => {
    (0, node_test_1.test)("phase10e full flow stores, reads, reuses, and supersedes immutable INR to USD snapshots", async () => {
        const { actors, provider, service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const first = await service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor);
        strict_1.default.equal(first.provider, "DETERMINISTIC_FX");
        strict_1.default.equal(first.rate, "0.0115");
        strict_1.default.equal(first.inverseRate, "86.95652173913");
        strict_1.default.equal(first.effectiveDate, "2026-08-02");
        strict_1.default.equal(first.isCurrent, true);
        strict_1.default.equal(first.baseMinorUnits, 2);
        strict_1.default.equal(first.quoteMinorUnits, 2);
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 1);
        const current = await service.getCurrent("INR", "USD");
        const normalReplay = await service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor);
        const forcedReplay = await service.refresh("INR", "USD", true, (0, fxRateSnapshotFixtures_1.adminActor)(actors));
        strict_1.default.equal(current.snapshotReference, first.snapshotReference);
        strict_1.default.equal(normalReplay.snapshotReference, first.snapshotReference);
        strict_1.default.equal(forcedReplay.snapshotReference, first.snapshotReference);
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 1);
        const immutableBefore = await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.findOne({
            snapshotReference: first.snapshotReference,
        }).select("+snapshotKey +responseFingerprint +snapshotFingerprint").lean();
        (0, fxRateSnapshotFixtures_1.setRate)(provider, "INR", "USD", "0.011700", "2026-08-03T00:00:00.000Z", "20260803-V2");
        const second = await service.refresh("INR", "USD", true, (0, fxRateSnapshotFixtures_1.adminActor)(actors));
        strict_1.default.notEqual(second.snapshotReference, first.snapshotReference);
        const history = await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.find({
            provider: "DETERMINISTIC_FX", baseCurrency: "INR", quoteCurrency: "USD",
        }).select("+snapshotKey +responseFingerprint +snapshotFingerprint")
            .sort({ effectiveDate: 1 }).lean();
        strict_1.default.equal(history.length, 2);
        strict_1.default.deepEqual(history.map((item) => item.status), ["SUPERSEDED", "ACTIVE"]);
        const { status: _status, supersededAt: _at, supersededByReference: _by, updatedAt: _updated, ...oldImmutable } = history[0];
        const { status: _beforeStatus, supersededAt: _beforeAt, supersededByReference: _beforeBy, updatedAt: _beforeUpdated, ...beforeImmutable } = immutableBefore;
        strict_1.default.deepEqual(oldImmutable, beforeImmutable);
        strict_1.default.equal(await fxRateAudit_model_1.FxRateAudit.countDocuments({
            action: "FX_RATE_SNAPSHOT_CREATED",
        }), 2);
        strict_1.default.equal(await fxRateAudit_model_1.FxRateAudit.countDocuments({
            action: "FX_RATE_SNAPSHOT_SUPERSEDED",
        }), 1);
    });
    (0, node_test_1.test)("phase10e pairs preserve explicit direction and zero-minor-unit metadata", async () => {
        const { service } = await (0, fxRateSnapshotFixtures_1.createFxFixture)();
        const rates = await Promise.all([
            service.lookupOrRefresh("INR", "USD", fxRateSnapshotFixtures_1.systemActor),
            service.lookupOrRefresh("USD", "INR", fxRateSnapshotFixtures_1.systemActor),
            service.lookupOrRefresh("INR", "EUR", fxRateSnapshotFixtures_1.systemActor),
            service.lookupOrRefresh("INR", "JPY", fxRateSnapshotFixtures_1.systemActor),
        ]);
        strict_1.default.deepEqual(rates.map((rate) => `${rate.baseCurrency}:${rate.quoteCurrency}`), ["INR:USD", "USD:INR", "INR:EUR", "INR:JPY"]);
        strict_1.default.equal(rates[3].quoteMinorUnits, 0);
        strict_1.default.equal(await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.countDocuments({}), 4);
    });
};
exports.registerFullFlowTests = registerFullFlowTests;
