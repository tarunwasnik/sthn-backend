"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalReservationTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const ledgerAccount_enum_1 = require("../../../enums/financial/ledgerAccount.enum");
const moneyDirection_enum_1 = require("../../../enums/financial/moneyDirection.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const creatorWithdrawalRequest_service_1 = require("../../../services/financial/creatorWithdrawalRequest.service");
const creatorWithdrawalRequestFixtures_1 = require("./fixtures/creatorWithdrawalRequestFixtures");
const registerWithdrawalReservationTests = () => {
    (0, node_test_1.test)("phase9a reserves Creator Wallet funds with one balanced Ledger transaction", async () => {
        const server = await (0, creatorWithdrawalRequestFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalRequestFixtures_1.createEligibleCreatorWithdrawalFixture)(server.baseUrl);
            const walletBefore = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            const result = await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(fixture.input);
            strict_1.default.equal(result.status, "RESERVED");
            strict_1.default.equal(result.amount, 300);
            strict_1.default.equal(result.reservedAmount, 300);
            strict_1.default.equal(result.replay, false);
            strict_1.default.equal(await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments(), 1);
            const entries = await ledgerEntry_model_1.LedgerEntry.find({
                transactionId: `creator-withdrawal-reservation:${result.withdrawalReference}`,
            });
            strict_1.default.equal(entries.length, 2);
            strict_1.default.ok(entries.some((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT &&
                entry.account === ledgerAccount_enum_1.LedgerAccount.WALLET_AVAILABLE));
            strict_1.default.ok(entries.some((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT &&
                entry.account === ledgerAccount_enum_1.LedgerAccount.WITHDRAWAL_RESERVED));
            strict_1.default.equal(entries.filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.DEBIT)
                .reduce((sum, entry) => sum + entry.amount, 0), entries.filter((entry) => entry.direction === moneyDirection_enum_1.MoneyDirection.CREDIT)
                .reduce((sum, entry) => sum + entry.amount, 0));
            const projection = await walletProjectionOperation_model_1.WalletProjectionOperation.findOne({
                operationReference: result.projectionReference,
            }).orFail();
            strict_1.default.deepEqual({
                availableBalance: projection.deltas.availableBalance,
                reservedBalance: projection.deltas.reservedBalance,
                lockedBalance: projection.deltas.lockedBalance,
            }, {
                availableBalance: -300,
                reservedBalance: 300,
                lockedBalance: 0,
            });
            const walletAfter = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
            strict_1.default.equal(walletAfter.currentBalance, walletBefore.currentBalance);
            strict_1.default.equal(walletAfter.availableBalance, walletBefore.availableBalance - 300);
            strict_1.default.equal(walletAfter.reservedBalance, walletBefore.reservedBalance + 300);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalReservationTests = registerWithdrawalReservationTests;
