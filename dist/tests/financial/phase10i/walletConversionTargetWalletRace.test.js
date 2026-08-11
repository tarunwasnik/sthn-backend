"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTargetWalletRaceTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionAccounting_service_1 = require("../../../services/financial/walletConversionAccounting.service");
const walletConversionProviderExecution_service_1 = require("../../../services/financial/walletConversionProviderExecution.service");
const walletConversionDecisionFixtures_1 = require("../phase10g/fixtures/walletConversionDecisionFixtures");
const walletConversionAccountingFixtures_1 = require("./fixtures/walletConversionAccountingFixtures");
const registerTargetWalletRaceTests = () => {
    (0, node_test_1.test)("phase10i target-Wallet race creates exactly one currency Wallet", { timeout: 120000 }, async () => {
        const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        const references = [fixture.created.conversionReference];
        for (let index = 0; index < 9; index += 1) {
            const created = await fixture.service.create(fixture.actors.userId.toString(), {
                sourceCurrency: "INR", targetCurrency: "USD",
                sourceAmount: 100000, idempotencyKey: (0, walletConversionAccountingFixtures_1.uniqueKey)("phase10i-race"),
            });
            references.push(created.conversionReference);
        }
        await (0, walletConversionDecisionFixtures_1.approve)(fixture);
        for (const reference of references.slice(1)) {
            await fixture.decisionService.decide({
                adminUserId: fixture.actors.adminId.toString(),
                conversionReference: reference, decision: "APPROVE",
            });
        }
        const provider = new walletConversionProviderExecution_service_1.WalletConversionProviderExecutionService(fixture.requestService);
        for (const reference of references) {
            await provider.execute({
                adminUserId: fixture.actors.adminId.toString(),
                conversionReference: reference, outcome: "SUCCESS",
            });
        }
        strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: fixture.actors.userId,
            currency: "USD" }), 0);
        const accounting = new walletConversionAccounting_service_1.WalletConversionAccountingService();
        const results = await Promise.all(references.map((reference) => accounting.account(reference)));
        strict_1.default.ok(results.every((result) => result.status === "COMPLETED"));
        strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: fixture.actors.userId,
            currency: "USD" }), 1);
        strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
            type: "WALLET_CONVERSION_COMPLETED"
        }), 20);
        strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
            operationKey: /^wallet-conversion-accounting:/
        }), 20);
        strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({
            action: "WALLET_CONVERSION_COMPLETED"
        }), 10);
    });
};
exports.registerTargetWalletRaceTests = registerTargetWalletRaceTests;
