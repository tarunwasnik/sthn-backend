"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRegressionTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const internalWalletConversionProviderRequest_model_1 = require("../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionProviderFixtures_1 = require("./fixtures/walletConversionProviderFixtures");
const registerRegressionTests = () => {
    (0, node_test_1.test)("phase10h no-money-movement preserves every frozen financial authority", async () => {
        const fixture = await (0, walletConversionProviderFixtures_1.createProviderFixture)();
        const frozen = await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)();
        await (0, walletConversionProviderFixtures_1.executeSuccess)(fixture);
        strict_1.default.deepEqual(await (0, walletConversionProviderFixtures_1.captureFrozenFinancialState)(), frozen);
        const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({
            conversionReference: fixture.created.conversionReference,
        }).orFail();
        strict_1.default.equal(request.status, "APPROVED");
        const approvalReplay = await fixture.decisionService.decide({
            adminUserId: fixture.actors.adminId.toString(),
            conversionReference: fixture.created.conversionReference,
            decision: "APPROVE",
        });
        strict_1.default.equal(approvalReplay.status, "APPROVED");
    });
    (0, node_test_1.test)("phase10h indexes preserve deterministic provider and audit authority", async () => {
        const providerIndexes = await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.collection.indexes();
        const requestIndexes = await walletConversionRequest_model_1.WalletConversionRequest.collection.indexes();
        const auditIndexes = await walletConversionAudit_model_1.WalletConversionAudit.collection.indexes();
        for (const field of ["providerRequestReference", "providerRequestKey",
            "conversionReference", "providerExecutionReference"]) {
            strict_1.default.ok(providerIndexes.some((index) => index.unique &&
                index.key[field] === 1), `missing unique ${field}`);
        }
        strict_1.default.ok(providerIndexes.some((index) => index.key.providerStatus === 1 &&
            index.key.createdAt === 1));
        strict_1.default.ok(requestIndexes.some((index) => index.key.providerRequestReference === 1));
        strict_1.default.ok(auditIndexes.some((index) => index.key.action === 1 &&
            index.key.completedAt === -1));
    });
};
exports.registerRegressionTests = registerRegressionTests;
