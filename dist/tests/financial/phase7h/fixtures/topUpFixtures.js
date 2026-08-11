"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.establishProjectionStage = exports.establishLedgerStage = exports.reloadRequest = exports.completeFundedTopUp = exports.createFundedTopUp = exports.createActors = void 0;
const User_1 = __importDefault(require("../../../../models/User"));
const userProfile_model_1 = require("../../../../models/userProfile.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const walletTopUpRequest_model_1 = require("../../../../models/walletTopUpRequest.model");
const walletTopUpRequest_service_1 = require("../../../../services/financial/walletTopUpRequest.service");
const adminWalletTopUpDecision_service_1 = require("../../../../services/financial/adminWalletTopUpDecision.service");
const topUpFundingOrchestrator_service_1 = require("../../../../services/financial/topUpFundingOrchestrator.service");
const topUpAccountingOrchestrator_service_1 = require("../../../../services/financial/topUpAccountingOrchestrator.service");
const ledger_service_1 = require("../../../../services/financial/ledger.service");
const walletProjection_service_1 = require("../../../../services/wallet/walletProjection.service");
const walletProjectionOperation_repository_1 = require("../../../../repositories/wallet/walletProjectionOperation.repository");
const internalTopUpFunding_repository_1 = require("../../../../repositories/internalTopUpFunding.repository");
const walletTopUpDecision_enum_1 = require("../../../../enums/financial/walletTopUpDecision.enum");
const internalTopUpFundingOutcome_enum_1 = require("../../../../enums/financial/internalTopUpFundingOutcome.enum");
const internalTopUpFundingFailureCode_enum_1 = require("../../../../enums/financial/internalTopUpFundingFailureCode.enum");
const ledgerEntryType_enum_1 = require("../../../../enums/financial/ledgerEntryType.enum");
const ledgerSource_enum_1 = require("../../../../enums/financial/ledgerSource.enum");
const ledgerAccount_enum_1 = require("../../../../enums/financial/ledgerAccount.enum");
const topUpOperationalIdentity_util_1 = require("../../../../utils/financial/topUpOperationalIdentity.util");
let fixtureSequence = 0;
const createActors = async () => {
    fixtureSequence += 1;
    const suffix = fixtureSequence.toString().padStart(4, "0");
    const [user, admin, creator] = await User_1.default.create([
        { email: `phase7h-user-${suffix}@test.local`, role: "user", status: "active" },
        { email: `phase7h-admin-${suffix}@test.local`, role: "admin", status: "active" },
        { email: `phase7h-creator-${suffix}@test.local`, role: "creator", status: "active" },
    ]);
    await userProfile_model_1.UserProfile.create({
        userId: user._id,
        username: `phase7h_user_${suffix}`,
        dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
        interests: ["finance"],
        bio: "Phase 7H verified test user",
        avatar: "https://test.local/avatar",
        cover: "https://test.local/cover",
        profilePhotos: ["https://test.local/1", "https://test.local/2"],
        profileStatus: "verified",
    });
    const wallet = await wallet_model_1.Wallet.create({ userId: user._id, currency: "INR" });
    return {
        userId: user._id,
        adminId: admin._id,
        creatorId: creator._id,
        wallet,
    };
};
exports.createActors = createActors;
const createFundedTopUp = async (actors, amount, outcome = internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.SUCCESS) => {
    fixtureSequence += 1;
    const requestDto = await walletTopUpRequest_service_1.walletTopUpRequestService.create(actors.userId.toString(), {
        amount,
        currency: "INR",
        idempotencyKey: `phase7h-top-up-${fixtureSequence}`,
    });
    await adminWalletTopUpDecision_service_1.adminWalletTopUpDecisionService.decide({
        adminUserId: actors.adminId.toString(),
        topUpReference: requestDto.topUpReference,
        decision: walletTopUpDecision_enum_1.WalletTopUpDecision.APPROVE,
    });
    await topUpFundingOrchestrator_service_1.topUpFundingOrchestratorService.start({
        topUpReference: requestDto.topUpReference,
        outcome,
        ...(outcome === internalTopUpFundingOutcome_enum_1.InternalTopUpFundingOutcome.FAILURE ? {
            failureCode: internalTopUpFundingFailureCode_enum_1.InternalTopUpFundingFailureCode.SIMULATED_DECLINE,
            failureReason: "Bounded Phase 7H provider failure",
        } : {}),
    });
    const request = await walletTopUpRequest_model_1.WalletTopUpRequest.findOne({
        topUpReference: requestDto.topUpReference,
    }).select("+providerFundingId +ledgerEntryId +walletProjectionOperationId +failureFinalizedBy");
    if (!request)
        throw new Error("Top-up fixture request was not persisted.");
    const funding = await internalTopUpFunding_repository_1.internalTopUpFundingRepository.findByTopUpRequestId(request._id);
    if (!funding)
        throw new Error("Top-up fixture funding was not persisted.");
    return { request, funding };
};
exports.createFundedTopUp = createFundedTopUp;
const completeFundedTopUp = async (topUpReference) => topUpAccountingOrchestrator_service_1.topUpAccountingOrchestratorService.complete(topUpReference);
exports.completeFundedTopUp = completeFundedTopUp;
const reloadRequest = async (topUpReference) => {
    const request = await walletTopUpRequest_model_1.WalletTopUpRequest.findOne({ topUpReference })
        .select("+providerFundingId +ledgerEntryId +walletProjectionOperationId +failureFinalizedBy");
    if (!request)
        throw new Error("Top-up request was not found.");
    return request;
};
exports.reloadRequest = reloadRequest;
const establishLedgerStage = async (request, funding) => {
    const identity = (0, topUpOperationalIdentity_util_1.deriveTopUpOperationalAccountingIdentity)(request, funding);
    const ledger = await ledger_service_1.ledgerService.createCredit({
        type: ledgerEntryType_enum_1.LedgerEntryType.WALLET_TOP_UP,
        source: ledgerSource_enum_1.LedgerSource.INTERNAL_TOP_UP_FUNDING,
        account: ledgerAccount_enum_1.LedgerAccount.CASH,
        money: { amount: request.amount, currency: request.currency },
        transactionId: identity.transactionId,
        userId: request.userId.toString(),
        idempotencyKey: identity.transactionId,
        postingKey: identity.postingKey,
        description: "Wallet top-up credit",
        metadata: {
            topUpReference: request.topUpReference,
            providerFundingReference: funding.fundingReference,
        },
    });
    return { ledger, identity };
};
exports.establishLedgerStage = establishLedgerStage;
const establishProjectionStage = async (request, funding) => {
    const { ledger, identity } = await (0, exports.establishLedgerStage)(request, funding);
    await walletProjection_service_1.walletProjectionService.applyProjectionMutation({
        userId: request.userId,
        currency: request.currency,
        operationKey: identity.operationKey,
        deltas: { availableBalance: request.amount },
        ledgerEntryIds: [ledger._id],
    });
    const operation = await walletProjectionOperation_repository_1.walletProjectionOperationRepository.findByOperationKey(identity.operationKey);
    if (!operation)
        throw new Error("Projection fixture operation was not persisted.");
    return { ledger, operation, identity };
};
exports.establishProjectionStage = establishProjectionStage;
