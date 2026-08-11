"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIntegrityTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const exchangeRateSnapshot_model_1 = require("../../../models/exchangeRateSnapshot.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWalletConversionProviderRequest_model_1 = require("../../../models/internalProvider/internalWalletConversionProviderRequest.model");
const walletConversionRequest_model_1 = require("../../../models/walletConversionRequest.model");
const walletConversionProviderExecution_service_1 = require("../../../services/financial/walletConversionProviderExecution.service");
const walletConversionDecisionFixtures_1 = require("../phase10g/fixtures/walletConversionDecisionFixtures");
const walletConversionProviderFixtures_1 = require("./fixtures/walletConversionProviderFixtures");
const code = (expected) => (error) => error.code === expected;
const registerIntegrityTests = () => {
    (0, node_test_1.test)("phase10h integrity permits only APPROVED conversion requests", async () => {
        const pending = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await strict_1.default.rejects(() => walletConversionProviderExecution_service_1.walletConversionProviderExecutionService.execute({
            adminUserId: pending.actors.adminId.toString(),
            conversionReference: pending.created.conversionReference,
            outcome: "SUCCESS",
        }), code("WALLET_CONVERSION_PROVIDER_REQUEST_NOT_APPROVED"));
        const rejected = await (0, walletConversionDecisionFixtures_1.createDecisionFixture)();
        await (0, walletConversionDecisionFixtures_1.reject)(rejected);
        await strict_1.default.rejects(() => walletConversionProviderExecution_service_1.walletConversionProviderExecutionService.execute({
            adminUserId: rejected.actors.adminId.toString(),
            conversionReference: rejected.created.conversionReference,
            outcome: "SUCCESS",
        }), code("WALLET_CONVERSION_PROVIDER_REQUEST_NOT_APPROVED"));
        strict_1.default.equal(await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.countDocuments({}), 0);
    });
    (0, node_test_1.test)("phase10h integrity rejects corrupted request and snapshot authority", async () => {
        const request = await (0, walletConversionProviderFixtures_1.createProviderFixture)();
        await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({
            conversionReference: request.created.conversionReference,
        }, { $set: { requestFingerprint: "corrupted" } });
        await strict_1.default.rejects(() => (0, walletConversionProviderFixtures_1.executeSuccess)(request), code("WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT"));
        const snapshot = await (0, walletConversionProviderFixtures_1.createProviderFixture)();
        await exchangeRateSnapshot_model_1.ExchangeRateSnapshot.collection.updateOne({
            snapshotReference: snapshot.request.fxSnapshotReference,
        }, { $set: { status: "INVALIDATED" } });
        await strict_1.default.rejects(() => (0, walletConversionProviderFixtures_1.executeSuccess)(snapshot), code("WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT"));
    });
    (0, node_test_1.test)("phase10h integrity rejects corrupted provider identity, events, and synchronization", async () => {
        const identity = await (0, walletConversionProviderFixtures_1.createProviderFixture)({
            failureInjector: (stage) => {
                if (stage === "AFTER_AUTHORITY")
                    throw new Error("stop");
            },
        });
        await strict_1.default.rejects(() => (0, walletConversionProviderFixtures_1.executeSuccess)(identity));
        await internalWalletConversionProviderRequest_model_1.InternalWalletConversionProviderRequest.collection.updateOne({
            conversionReference: identity.created.conversionReference,
        }, { $set: { providerFingerprint: "0".repeat(64) } });
        const cleanService = new identity.service.constructor(identity.requestService);
        await strict_1.default.rejects(() => cleanService.execute({
            adminUserId: identity.actors.adminId.toString(),
            conversionReference: identity.created.conversionReference,
            outcome: "SUCCESS",
        }), code("WALLET_CONVERSION_PROVIDER_IDENTITY_CONFLICT"));
        const events = await (0, walletConversionProviderFixtures_1.createProviderFixture)();
        await (0, walletConversionProviderFixtures_1.executeSuccess)(events);
        await internalProviderEvent_model_1.default.deleteOne({
            entityType: "WALLET_CONVERSION_PROVIDER_REQUEST",
            eventType: "CONVERSION_PROVIDER_PROCESSING",
        });
        await strict_1.default.rejects(() => events.service.validateReplay(events.created.conversionReference), code("WALLET_CONVERSION_PROVIDER_EVENT_CONFLICT"));
        const sync = await (0, walletConversionProviderFixtures_1.createProviderFixture)();
        await (0, walletConversionProviderFixtures_1.executeSuccess)(sync);
        await walletConversionRequest_model_1.WalletConversionRequest.collection.updateOne({
            conversionReference: sync.created.conversionReference,
        }, { $set: { providerStatus: "FAILED" } });
        await strict_1.default.rejects(() => sync.service.validateReplay(sync.created.conversionReference), code("WALLET_CONVERSION_PROVIDER_SYNCHRONIZATION_CONFLICT"));
    });
    (0, node_test_1.test)("phase10h Admin route enforces authorization and strict execution input", async () => {
        const fixture = await (0, walletConversionProviderFixtures_1.createProviderFixture)();
        const original = walletConversionProviderExecution_service_1.walletConversionProviderExecutionService.execute;
        walletConversionProviderExecution_service_1.walletConversionProviderExecutionService.execute =
            fixture.service.execute.bind(fixture.service);
        const server = await (0, walletConversionProviderFixtures_1.startDecisionServer)();
        const url = `${server.baseUrl}/api/v1/admin/financial/` +
            `wallet-conversion-requests/${fixture.created.conversionReference}/` +
            "execute-provider";
        const send = (token, body) => fetch(url, {
            method: "POST", headers: { "content-type": "application/json",
                ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body),
        });
        try {
            strict_1.default.equal((await send(undefined, { outcome: "SUCCESS" })).status, 401);
            strict_1.default.equal((await send((0, walletConversionProviderFixtures_1.authToken)(fixture.actors.userId), { outcome: "SUCCESS" })).status, 403);
            strict_1.default.equal((await send((0, walletConversionProviderFixtures_1.authToken)(fixture.actors.creatorId), { outcome: "SUCCESS" })).status, 403);
            for (const field of ["adminId", "userId", "sourceAmount",
                "targetAmount", "providerReference", "snapshotReference", "status",
                "processingAt", "completedAt", "payload"]) {
                strict_1.default.equal((await send((0, walletConversionProviderFixtures_1.authToken)(fixture.actors.adminId), { outcome: "SUCCESS", [field]: "forbidden" })).status, 400);
            }
            const accepted = await send((0, walletConversionProviderFixtures_1.authToken)(fixture.actors.adminId), { outcome: "SUCCESS" });
            strict_1.default.equal(accepted.status, 200);
            const body = await accepted.json();
            strict_1.default.ok(!Object.keys(body.data).some((key) => /(^|_)id$|fingerprint|key|payload|secret/i.test(key)));
        }
        finally {
            walletConversionProviderExecution_service_1.walletConversionProviderExecutionService.execute = original;
            await server.close();
        }
    });
};
exports.registerIntegrityTests = registerIntegrityTests;
