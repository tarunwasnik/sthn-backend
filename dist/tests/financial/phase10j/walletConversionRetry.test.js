"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRetryTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionRetryAttempt_model_1 = require("../../../models/walletConversionRetryAttempt.model");
const walletConversionRetry_service_1 = require("../../../services/financial/walletConversionRetry.service");
const walletConversionOperationalFixtures_1 = require("./fixtures/walletConversionOperationalFixtures");
const registerRetryTests = () => {
    (0, node_test_1.test)("phase10j retry completes metadata only after financial proof", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        await (0, walletConversionOperationalFixtures_1.makeReplayRequired)(fixture.conversionReference);
        const before = await (0, walletConversionOperationalFixtures_1.captureFinancialState)(fixture.conversionReference);
        const reconciled = await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
        strict_1.default.equal(reconciled.classification, "REPLAY_REQUIRED");
        strict_1.default.deepEqual(reconciled.allowedActions, ["RETRY"]);
        const result = await walletConversionRetry_service_1.walletConversionRetryService.retry(fixture.conversionReference, fixture.adminId);
        strict_1.default.equal(result.classification, "HEALTHY");
        strict_1.default.equal(result.retryPerformed, true);
        strict_1.default.equal((await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: fixture.conversionReference
        }).orFail()).status, "COMPLETED");
        strict_1.default.equal(await walletConversionRetryAttempt_model_1.WalletConversionRetryAttempt.countDocuments({}), 1);
        strict_1.default.deepEqual(await (0, walletConversionOperationalFixtures_1.captureFinancialState)(fixture.conversionReference), before);
        strict_1.default.equal((await walletConversionRetry_service_1.walletConversionRetryService.validateReplay(fixture.conversionReference)).retryPerformed, true);
    });
    (0, node_test_1.test)("phase10j ten retry attempts produce one retry authority", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        await (0, walletConversionOperationalFixtures_1.makeReplayRequired)(fixture.conversionReference);
        await fixture.service.reconcile(fixture.conversionReference, fixture.adminId);
        const results = await Promise.all(Array.from({ length: 10 }, () => walletConversionRetry_service_1.walletConversionRetryService.retry(fixture.conversionReference, fixture.adminId)));
        strict_1.default.ok(results.every((value) => value.retryPerformed));
        strict_1.default.equal(await walletConversionRetryAttempt_model_1.WalletConversionRetryAttempt.countDocuments({}), 1);
    });
};
exports.registerRetryTests = registerRetryTests;
