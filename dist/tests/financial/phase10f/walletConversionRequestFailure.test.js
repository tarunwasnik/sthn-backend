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
const walletConversionRequestFixtures_1 = require("./fixtures/walletConversionRequestFixtures");
const registerFailureTests = () => {
    for (const point of ["AFTER_SOURCE_WALLET_VALIDATION",
        "AFTER_SNAPSHOT_RESOLUTION", "AFTER_TARGET_AMOUNT_CALCULATION",
        "AFTER_REQUEST_CREATION", "BEFORE_AUDIT", "BEFORE_COMMIT"]) {
        (0, node_test_1.test)(`phase10f rollback: ${point} leaves no request or money effect`, async () => {
            const fixture = await (0, walletConversionRequestFixtures_1.createConversionFixture)({
                failureInjector: (actual) => {
                    if (actual === point)
                        throw new Error(`Injected ${point}`);
                },
            });
            const before = await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).lean();
            await strict_1.default.rejects(() => fixture.service.create(fixture.actors.userId.toString(), (0, walletConversionRequestFixtures_1.requestInput)(`phase10f-${point}`)));
            strict_1.default.equal(await walletConversionRequest_model_1.WalletConversionRequest.countDocuments({}), 0);
            strict_1.default.equal(await walletConversionAudit_model_1.WalletConversionAudit.countDocuments({}), 0);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({}), 0);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({}), 0);
            strict_1.default.deepEqual(await wallet_model_1.Wallet.findById(fixture.actors.wallet._id).lean(), before);
            strict_1.default.equal(await wallet_model_1.Wallet.countDocuments({ userId: fixture.actors.userId,
                currency: "USD" }), 0);
        });
    }
};
exports.registerFailureTests = registerFailureTests;
