"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletConversionAudit_model_1 = require("../../../models/walletConversionAudit.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const walletConversionDecisionFixtures_1 = require("./fixtures/walletConversionDecisionFixtures");
const registerFailureTests = () => {
    for (const point of ["AFTER_REQUEST_VALIDATION",
        "AFTER_SNAPSHOT_VALIDATION", "AFTER_SOURCE_WALLET_PRECHECK",
        "AFTER_GUARDED_TRANSITION", "BEFORE_AUDIT", "AFTER_AUDIT",
        "BEFORE_COMMIT"]) {
        (0, node_test_1.test)(`phase10g rollback: ${point} leaves no partial decision`, async () => {
            const fixture = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)({
                failureInjector: (actual) => {
                    if (actual === point)
                        throw new Error(`Injected ${point}`);
                },
            });
            const noMoneyBefore = await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)();
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.request.sourceWalletId).lean();
            await strict_1.default.rejects(() => (0, walletConversionDecisionFixtures_1.approve)(fixture));
            const request = await walletConversionRequest_model_1.WalletConversionRequest.findOne({})
                .select("+decidedBy");
            strict_1.default.equal(request?.status, "PENDING");
            strict_1.default.equal(request?.decidedAt, undefined);
            strict_1.default.equal(request?.decidedBy, undefined);
            strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({ action: {
                    $in: ["WALLET_CONVERSION_APPROVED", "WALLET_CONVERSION_REJECTED"],
                } }), 0);
            strict_1.default.deepEqual(await wallet_model_1.Wallet.findById(fixture.request.sourceWalletId).lean(), walletBefore);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
            strict_1.default.deepEqual(await (0, walletConversionDecisionFixtures_1.captureNoMoneyState)(), noMoneyBefore);
        });
    }
};
exports.registerFailureTests = registerFailureTests;
