"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalFailureTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const creatorWithdrawalRequest_service_1 = require("../../../services/financial/creatorWithdrawalRequest.service");
const database_1 = require("../phase7h/helpers/database");
const creatorWithdrawalRequestFixtures_1 = require("./fixtures/creatorWithdrawalRequestFixtures");
const registerWithdrawalFailureTests = () => {
    (0, node_test_1.test)("phase9a every injected reservation interruption rolls back completely", async () => {
        const stages = [
            "AFTER_AUTHORITY",
            "AFTER_LEDGER",
            "AFTER_PROJECTION",
            "BEFORE_RESERVED_TRANSITION",
            "BEFORE_AUDIT",
            "BEFORE_COMMIT",
        ];
        for (const stage of stages) {
            const server = await (0, creatorWithdrawalRequestFixtures_1.startCreatorWithdrawalHttpServer)();
            try {
                const fixture = await (0, creatorWithdrawalRequestFixtures_1.createEligibleCreatorWithdrawalFixture)(server.baseUrl);
                const walletBefore = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
                const service = new creatorWithdrawalRequest_service_1.CreatorWithdrawalRequestService((current) => {
                    if (current === stage)
                        throw new Error(`PHASE9A_${stage}`);
                });
                await strict_1.default.rejects(service.request(fixture.input));
                strict_1.default.equal(await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments(), 0);
                strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                    type: "CREATOR_WITHDRAWAL_RESERVED",
                }), 0);
                strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                    operationKey: { $regex: "^creator-withdrawal-reservation:CWR-" },
                }), 0);
                strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                    action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
                }), 0);
                const walletAfter = await wallet_model_1.Wallet.findById(fixture.creatorWallet._id).orFail();
                strict_1.default.deepEqual([
                    walletAfter.currentBalance,
                    walletAfter.availableBalance,
                    walletAfter.reservedBalance,
                    walletAfter.lockedBalance,
                    walletAfter.projectionVersion,
                ], [
                    walletBefore.currentBalance,
                    walletBefore.availableBalance,
                    walletBefore.reservedBalance,
                    walletBefore.lockedBalance,
                    walletBefore.projectionVersion,
                ]);
            }
            finally {
                await server.close();
                await (0, database_1.clearPhase7HDatabase)();
            }
        }
    });
};
exports.registerWithdrawalFailureTests = registerWithdrawalFailureTests;
