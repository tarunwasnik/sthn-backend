"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const internalWalletConversionProviderRequest_model_1 = require("../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionOperationalInspection_service_1 = require("../../../services/financial/walletConversionOperationalInspection.service");
const walletConversionOperationalFixtures_1 = require("./fixtures/walletConversionOperationalFixtures");
const walletConversionDecisionFixtures_1 = require("../phase10g/fixtures/walletConversionDecisionFixtures");
const registerRegressionTests = () => {
    (0, node_test_1.test)("phase10j missing request is bounded", async () => {
        await strict_1.default.rejects(() => walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService.inspect("WCV-00000000000000000000"), (error) => error.code ===
            "WALLET_CONVERSION_OPERATIONAL_REQUEST_NOT_FOUND");
    });
    (0, node_test_1.test)("phase10j classifies an invalid snapshot", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.collection.updateOne({
            snapshotReference: fixture.request.fxSnapshotReference,
        }, { $set: { status: "INVALIDATED" } });
        const result = await walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService.inspect(fixture.conversionReference);
        strict_1.default.equal(result.classification, "CORRUPTED_SNAPSHOT");
    });
    (0, node_test_1.test)("phase10j classifies corrupted Ledger without repairing it", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        const entry = await ledgerEntry_model_1.LedgerEntry.findOne({
            "metadata.conversionReference": fixture.conversionReference,
        }).orFail();
        await ledgerEntry_model_1.LedgerEntry.collection.updateOne({ _id: entry._id }, { $inc: { amount: 1 } });
        const result = await walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService.inspect(fixture.conversionReference);
        strict_1.default.equal(result.classification, "CORRUPTED_LEDGER");
    });
    (0, node_test_1.test)("phase10j classifies corrupted projection without repairing it", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        const projection = await walletProjectionOperation_model_1.WalletProjectionOperation.findOne({
            userId: fixture.request.userId,
        }).orFail();
        await walletProjectionOperation_model_1.WalletProjectionOperation.collection.updateOne({ _id: projection._id }, { $inc: { "deltas.availableBalance": 1 } });
        const result = await walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService.inspect(fixture.conversionReference);
        strict_1.default.equal(result.classification, "CORRUPTED_PROJECTION");
    });
    (0, node_test_1.test)("phase10j classifies corrupted Provider authority", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.collection.updateOne({
            conversionReference: fixture.conversionReference,
        }, { $set: { responseCode: "CORRUPTED" } });
        const result = await walletConversionOperationalInspection_service_1.walletConversionOperationalInspectionService.inspect(fixture.conversionReference);
        strict_1.default.equal(result.classification, "CORRUPTED_PROVIDER");
    });
    (0, node_test_1.test)("phase10j Admin route enforces authorization and safe DTO", async () => {
        const fixture = await (0, walletConversionOperationalFixtures_1.createHealthyOperationalFixture)();
        const server = await (0, walletConversionDecisionFixtures_1.startDecisionServer)();
        const url = `${server.baseUrl}/api/v1/admin/financial/` +
            `wallet-conversion-requests/${fixture.conversionReference}/reconciliation`;
        try {
            const send = (token) => fetch(url, { headers: token
                    ? { authorization: `Bearer ${token}` } : {} });
            strict_1.default.equal((await send()).status, 401);
            strict_1.default.equal((await send((0, walletConversionDecisionFixtures_1.authToken)(fixture.actors.userId))).status, 403);
            strict_1.default.equal((await send((0, walletConversionDecisionFixtures_1.authToken)(fixture.actors.creatorId))).status, 403);
            const accepted = await send((0, walletConversionDecisionFixtures_1.authToken)(fixture.actors.adminId));
            const body = await accepted.json();
            strict_1.default.equal(accepted.status, 200);
            strict_1.default.deepEqual(Object.keys(body.data).sort(), ["classification",
                "conversionReference", "issues", "repairPerformed", "retryPerformed",
                "severity"].sort());
        }
        finally {
            await server.close();
        }
    });
};
exports.registerRegressionTests = registerRegressionTests;
