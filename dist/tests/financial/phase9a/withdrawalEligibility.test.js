"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithdrawalEligibilityTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const creatorProfile_model_1 = require("../../../models/creatorProfile.model");
const auditLog_model_1 = require("../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const payoutDestination_model_1 = require("../../../models/payoutDestination.model");
const wallet_model_1 = require("../../../models/wallet.model");
const creatorWithdrawalRequest_service_1 = require("../../../services/financial/creatorWithdrawalRequest.service");
const creatorWithdrawalRequestFixtures_1 = require("./fixtures/creatorWithdrawalRequestFixtures");
const registerWithdrawalEligibilityTests = () => {
    (0, node_test_1.test)("phase9a endpoint derives ownership and rejects unauthenticated or client identity fields", async () => {
        const server = await (0, creatorWithdrawalRequestFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalRequestFixtures_1.createEligibleCreatorWithdrawalFixture)(server.baseUrl);
            const body = {
                amount: fixture.input.amount.amount,
                currency: fixture.input.amount.currency,
                destinationReference: fixture.input.destinationReference,
                idempotencyKey: fixture.input.idempotencyKey,
            };
            strict_1.default.equal((await (0, creatorWithdrawalRequestFixtures_1.postCreatorWithdrawal)(server.baseUrl, undefined, body)).status, 401);
            strict_1.default.equal((await (0, creatorWithdrawalRequestFixtures_1.postCreatorWithdrawal)(server.baseUrl, fixture.creatorToken, { ...body, walletId: fixture.creatorWallet._id.toString() })).status, 400);
            strict_1.default.equal(await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments(), 0);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase9a enforces balance, active Creator, Wallet lock, and one active withdrawal", async () => {
        const server = await (0, creatorWithdrawalRequestFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const insufficient = await (0, creatorWithdrawalRequestFixtures_1.createEligibleCreatorWithdrawalFixture)(server.baseUrl);
            await strict_1.default.rejects(creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request({
                ...insufficient.input,
                amount: { amount: 901, currency: "INR" },
            }));
            await creatorProfile_model_1.CreatorProfile.updateOne({ userId: insufficient.fixture.actors.creatorId }, { $set: { status: "inactive" } });
            await strict_1.default.rejects(creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(insufficient.input));
            await creatorProfile_model_1.CreatorProfile.updateOne({ userId: insufficient.fixture.actors.creatorId }, { $set: { status: "active" } });
            await wallet_model_1.Wallet.updateOne({ _id: insufficient.creatorWallet._id }, {
                $inc: {
                    availableBalance: -1,
                    lockedBalance: 1,
                },
            });
            await strict_1.default.rejects(creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(insufficient.input));
            await wallet_model_1.Wallet.updateOne({ _id: insufficient.creatorWallet._id }, {
                $inc: {
                    availableBalance: 1,
                    lockedBalance: -1,
                },
            });
            await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(insufficient.input);
            await strict_1.default.rejects(creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request({
                ...insufficient.input,
                idempotencyKey: `${insufficient.input.idempotencyKey}-second`,
            }));
            strict_1.default.equal(await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments(), 1);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("phase9a rejects inactive destination, currency mismatch, and unhealthy settlement integrity", async () => {
        const server = await (0, creatorWithdrawalRequestFixtures_1.startCreatorWithdrawalHttpServer)();
        try {
            const fixture = await (0, creatorWithdrawalRequestFixtures_1.createEligibleCreatorWithdrawalFixture)(server.baseUrl);
            await payoutDestination_model_1.PayoutDestination.updateOne({ _id: fixture.destination._id }, { $set: { isActive: false } });
            await strict_1.default.rejects(creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(fixture.input), (error) => error instanceof Error &&
                "code" in error &&
                error.code === "CREATOR_WITHDRAWAL_DESTINATION_MISSING");
            await payoutDestination_model_1.PayoutDestination.updateOne({ _id: fixture.destination._id }, { $set: { isActive: true } });
            await strict_1.default.rejects(creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request({
                ...fixture.input,
                amount: { amount: 300, currency: "USD" },
            }), (error) => error instanceof Error &&
                "code" in error &&
                error.code === "CREATOR_WITHDRAWAL_CURRENCY_MISMATCH");
            await auditLog_model_1.AuditLog.deleteOne({
                action: "BOOKING_CREATOR_WALLET_SETTLED",
                entityId: fixture.settlement._id,
            });
            await strict_1.default.rejects(creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request(fixture.input), (error) => error instanceof Error &&
                "code" in error &&
                error.code === "CREATOR_WITHDRAWAL_INTEGRITY_CONFLICT");
            strict_1.default.equal(await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.countDocuments(), 0);
        }
        finally {
            await server.close();
        }
    });
};
exports.registerWithdrawalEligibilityTests = registerWithdrawalEligibilityTests;
