"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalReplayTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const auditAction_enum_1 = require("../../../enums/financial/auditAction.enum");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const ledgerEntry_model_1 = require("../../../models/ledgerEntry.model");
const walletProjectionOperation_model_1 = require("../../../models/walletProjectionOperation.model");
const creatorWithdrawalRequest_service_1 = require("../../../services/financial/creatorWithdrawalRequest.service");
const creatorWithdrawalRequestFixtures_1 = require("./fixtures/creatorWithdrawalRequestFixtures");
const registerWithdrawalReplayTests = () => {
    (0, node_test_1.test)("phase9a sequential, reloaded, and validation replay preserve one reservation", async () => {
        const server = await (0, creatorWithdrawalRequestFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalRequestFixtures_1.createEligibleCreatorWithdrawalFixture)(server.baseUrl);
            const first = await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(fixture.input);
            const second = await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(fixture.input);
            const validated = await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.validateReplay(first.withdrawalReference);
            strict_1.default.equal(first.withdrawalReference, second.withdrawalReference);
            strict_1.default.equal(first.withdrawalReference, validated.withdrawalReference);
            strict_1.default.equal(await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments(), 1);
            strict_1.default.equal(await ledgerEntry_model_1.LedgerEntry.countDocuments({
                transactionId: `creator-withdrawal-reservation:${first.withdrawalReference}`,
            }), 2);
            strict_1.default.equal(await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments({
                operationReference: first.projectionReference,
            }), 1);
            strict_1.default.equal(await auditLog_model_1.AuditLog.countDocuments({
                action: auditAction_enum_1.AuditAction.CREATOR_WITHDRAWAL_REQUESTED,
            }), 1);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase9a reused request key with different immutable intent fails closed", async () => {
        const server = await (0, creatorWithdrawalRequestFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalRequestFixtures_1.createEligibleCreatorWithdrawalFixture)(server.baseUrl);
            await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(fixture.input);
            await strict_1.default.rejects(creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request({
                ...fixture.input,
                amount: { amount: 301, currency: "INR" },
            }), (error) => error instanceof Error &&
                "code" in error &&
                error.code === "CREATOR_WITHDRAWAL_REPLAY_CONFLICT");
            strict_1.default.equal(await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments(), 1);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalReplayTests = registerWithdrawalReplayTests;
