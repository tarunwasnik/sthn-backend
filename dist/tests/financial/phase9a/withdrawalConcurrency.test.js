"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalConcurrencyTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const creatorWithdrawalRequest_service_1 = require("../../../services/financial/creatorWithdrawalRequest.service");
const creatorWithdrawalRequestFixtures_1 = require("./fixtures/creatorWithdrawalRequestFixtures");
const registerWithdrawalConcurrencyTests = () => {
    (0, node_test_1.test)("phase9a ten identical requests converge on one reservation winner", async () => {
        const server = await (0, creatorWithdrawalRequestFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalRequestFixtures_1.createEligibleCreatorWithdrawalFixture)(server.baseUrl);
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(fixture.input)));
            strict_1.default.ok(attempts.every((attempt) => attempt.status === "fulfilled"), attempts.map((attempt) => attempt.status === "fulfilled"
                ? "fulfilled" : String(attempt.reason)).join(" | "));
            const references = attempts.map((attempt) => attempt.status === "fulfilled"
                ? attempt.value.withdrawalReference
                : "rejected");
            strict_1.default.equal(new Set(references).size, 1);
            strict_1.default.equal(await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments(), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                type: "CREATOR_WITHDRAWAL_RESERVED",
            }), 2);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                operationKey: { $regex: "^creator-withdrawal-reservation:CWR-" },
            }), 1);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
            }), 1);
            const walletAfter = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.equal(walletAfter.availableBalance, walletBefore.availableBalance - fixture.input.amount.amount);
            strict_1.default.equal(walletAfter.reservedBalance, walletBefore.reservedBalance + fixture.input.amount.amount);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalConcurrencyTests = registerWithdrawalConcurrencyTests;
