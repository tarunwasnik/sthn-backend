"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWalletConversionDecisionService = exports.AdminWalletConversionDecisionService = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const walletConversionAuditAction_enum_1 = require("../../enums/financial/walletConversionAuditAction.enum");
const walletConversionDecision_enum_1 = require("../../enums/financial/walletConversionDecision.enum");
const walletConversionRejectionCode_enum_1 = require("../../enums/financial/walletConversionRejectionCode.enum");
const walletConversionRequestStatus_enum_1 = require("../../enums/financial/walletConversionRequestStatus.enum");
const WalletConversionRequestError_1 = require("../../errors/financial/WalletConversionRequestError");
const walletConversionAudit_repository_1 = require("../../repositories/walletConversionAudit.repository");
const walletConversionRequest_repository_1 = require("../../repositories/walletConversionRequest.repository");
const idempotency_util_1 = require("../../utils/financial/idempotency.util");
const reference_util_1 = require("../../utils/financial/reference.util");
const walletConversionRequest_response_dto_1 = require("../../dtos/wallet/walletConversionRequest.response.dto");
const currencyMetadata_service_1 = require("./currencyMetadata.service");
const walletConversionRequest_service_1 = require("./walletConversionRequest.service");
class AdminWalletConversionDecisionService {
    isApprovedAuthorityStatus(status) {
        return [walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED,
            walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED,
            walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.FAILED].includes(status);
    }
    constructor(requestService = walletConversionRequest_service_1.walletConversionRequestService, options = {}) {
        this.requestService = requestService;
        this.options = options;
        this.now = options.now ?? (() => new Date());
    }
    async inject(point) {
        await this.options.failureInjector?.(point);
    }
    page(value, fallback) {
        if (value === undefined)
            return fallback;
        const parsed = typeof value === "string" ? Number(value) : value;
        if (!Number.isSafeInteger(parsed) || parsed < 1) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Pagination is invalid.", "WALLET_CONVERSION_INVALID_PAGINATION", 422);
        }
        return parsed;
    }
    actor(value) {
        if (!mongoose_1.Types.ObjectId.isValid(value)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Admin identity is invalid.", "WALLET_CONVERSION_INTEGRITY_ERROR", 401);
        }
        return new mongoose_1.Types.ObjectId(value);
    }
    normalize(input) {
        if (!(0, reference_util_1.hasReferenceType)(input.conversionReference, "WALLET_CONVERSION")) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion reference is invalid.", "WALLET_CONVERSION_REQUEST_NOT_FOUND", 404);
        }
        if (!Object.values(walletConversionDecision_enum_1.WalletConversionDecision).includes(input.decision)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion decision is invalid.", "WALLET_CONVERSION_INVALID_DECISION", 422);
        }
        const decision = input.decision;
        if (decision === walletConversionDecision_enum_1.WalletConversionDecision.APPROVE &&
            (input.rejectionCode !== undefined || input.rejectionReason !== undefined)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Rejection data is not permitted for approval.", "WALLET_CONVERSION_REJECTION_DATA_NOT_ALLOWED", 422);
        }
        const rejectionCode = input.rejectionCode;
        if (decision === walletConversionDecision_enum_1.WalletConversionDecision.REJECT &&
            !Object.values(walletConversionRejectionCode_enum_1.WalletConversionRejectionCode).includes(rejectionCode)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Rejection code is required.", "WALLET_CONVERSION_REJECTION_CODE_REQUIRED", 422);
        }
        let rejectionReason;
        if (input.rejectionReason !== undefined) {
            if (typeof input.rejectionReason !== "string" ||
                !(rejectionReason = input.rejectionReason.trim()) ||
                rejectionReason.length > 500) {
                throw new WalletConversionRequestError_1.WalletConversionRequestError("Rejection reason is invalid.", "WALLET_CONVERSION_INVALID_REJECTION_REASON", 422);
            }
        }
        return { decision, rejectionCode, rejectionReason };
    }
    assertDecisionMetadata(request) {
        if (!(request.decidedAt instanceof Date) ||
            Number.isNaN(request.decidedAt.valueOf()) || !request.decidedBy) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Decision metadata is incomplete.", "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
        }
        if (this.isApprovedAuthorityStatus(request.status) &&
            (request.rejectionCode !== undefined ||
                request.rejectionReason !== undefined)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Approval metadata is inconsistent.", "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
        }
        if (request.status === walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.REJECTED &&
            !request.rejectionCode) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Rejection metadata is incomplete.", "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
        }
    }
    assertPendingMetadata(request) {
        if (request.decidedAt || request.decidedBy || request.rejectionCode ||
            request.rejectionReason !== undefined) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Pending decision metadata is invalid.", "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
        }
    }
    async validateAuthority(request, requireApprovalEligibility) {
        try {
            return await this.requestService.validateStoredAuthority(request, {
                checkSourceBalance: requireApprovalEligibility,
                requireSnapshotEligible: requireApprovalEligibility,
            });
        }
        catch (error) {
            if (error instanceof WalletConversionRequestError_1.WalletConversionRequestError) {
                if (error.code === "WALLET_CONVERSION_FX_SNAPSHOT_NOT_FOUND") {
                    throw new WalletConversionRequestError_1.WalletConversionRequestError("Bound FX snapshot was not found.", "WALLET_CONVERSION_SNAPSHOT_NOT_FOUND", 404, error);
                }
                if (error.code === "WALLET_CONVERSION_FX_SNAPSHOT_EXPIRED") {
                    throw new WalletConversionRequestError_1.WalletConversionRequestError("Bound FX snapshot is expired.", "WALLET_CONVERSION_SNAPSHOT_EXPIRED", 409, error);
                }
                if (error.code === "WALLET_CONVERSION_FX_SNAPSHOT_CONFLICT") {
                    throw new WalletConversionRequestError_1.WalletConversionRequestError("Bound FX snapshot conflicts.", "WALLET_CONVERSION_SNAPSHOT_CONFLICT", 409, error);
                }
                if (["WALLET_CONVERSION_SOURCE_WALLET_OWNERSHIP_CONFLICT",
                    "WALLET_CONVERSION_SOURCE_WALLET_CURRENCY_CONFLICT"].includes(error.code)) {
                    throw new WalletConversionRequestError_1.WalletConversionRequestError("Source Wallet conflicts.", "WALLET_CONVERSION_SOURCE_WALLET_CONFLICT", 409, error);
                }
            }
            throw error;
        }
    }
    async terminal(request, actor, normalized) {
        const approvedAuthority = this.isApprovedAuthorityStatus(request.status);
        if (!approvedAuthority &&
            request.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.REJECTED) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion status is invalid.", "WALLET_CONVERSION_INVALID_STATUS", 409);
        }
        await this.validateAuthority(request, false);
        this.assertDecisionMetadata(request);
        const action = approvedAuthority
            ? walletConversionAuditAction_enum_1.WalletConversionAuditAction.APPROVED
            : walletConversionAuditAction_enum_1.WalletConversionAuditAction.REJECTED;
        const persistedDecision = approvedAuthority
            ? walletConversionDecision_enum_1.WalletConversionDecision.APPROVE
            : walletConversionDecision_enum_1.WalletConversionDecision.REJECT;
        const audit = await walletConversionAudit_repository_1.walletConversionAuditRepository.findByAuditKey((0, idempotency_util_1.createIdempotencyFingerprint)(action, request.conversionKey));
        if (!audit || audit.action !== action ||
            audit.conversionReference !== request.conversionReference ||
            audit.sourceCurrency !== request.sourceCurrency ||
            audit.targetCurrency !== request.targetCurrency ||
            audit.sourceAmount !== request.sourceAmount ||
            audit.targetAmount !== request.targetAmount ||
            audit.fxSnapshotReference !== request.fxSnapshotReference ||
            audit.fxEffectiveDate.getTime() !== request.fxEffectiveDate.getTime() ||
            audit.requestedAt.getTime() !== request.requestedAt.getTime() ||
            audit.decision !== persistedDecision ||
            audit.rejectionCode !== request.rejectionCode ||
            !audit.adminActorId?.equals(request.decidedBy) ||
            audit.decidedAt?.getTime() !== request.decidedAt.getTime()) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Decision audit authority conflicts.", "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
        }
        if (!request.decidedBy.equals(actor)) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Decision actor conflicts.", "WALLET_CONVERSION_DECISION_CONFLICT", 409);
        }
        if (approvedAuthority &&
            normalized.decision === walletConversionDecision_enum_1.WalletConversionDecision.APPROVE) {
            return (0, walletConversionRequest_response_dto_1.toWalletConversionRequestResponseDto)(request);
        }
        if (request.status === walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.REJECTED &&
            normalized.decision === walletConversionDecision_enum_1.WalletConversionDecision.REJECT &&
            request.rejectionCode === normalized.rejectionCode &&
            (request.rejectionReason ?? undefined) === normalized.rejectionReason) {
            return (0, walletConversionRequest_response_dto_1.toWalletConversionRequestResponseDto)(request);
        }
        throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion decision conflicts with committed authority.", "WALLET_CONVERSION_DECISION_CONFLICT", 409);
    }
    async decide(input) {
        const actor = this.actor(input.adminUserId);
        const normalized = this.normalize(input);
        const current = await walletConversionRequest_repository_1.walletConversionRequestRepository.findByReference(input.conversionReference);
        if (!current) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion request was not found.", "WALLET_CONVERSION_REQUEST_NOT_FOUND", 404);
        }
        if (current.status !== walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.PENDING) {
            return this.terminal(current, actor, normalized);
        }
        this.assertPendingMetadata(current);
        await this.validateAuthority(current, normalized.decision === walletConversionDecision_enum_1.WalletConversionDecision.APPROVE);
        await this.inject("AFTER_REQUEST_VALIDATION");
        await this.inject("AFTER_SNAPSHOT_VALIDATION");
        if (normalized.decision === walletConversionDecision_enum_1.WalletConversionDecision.APPROVE) {
            await this.inject("AFTER_SOURCE_WALLET_PRECHECK");
        }
        const decidedAt = this.now();
        const session = await mongoose_1.default.startSession();
        let updated = null;
        try {
            await session.withTransaction(async () => {
                updated = normalized.decision === walletConversionDecision_enum_1.WalletConversionDecision.APPROVE
                    ? await walletConversionRequest_repository_1.walletConversionRequestRepository.approvePending({
                        conversionReference: input.conversionReference,
                        decidedBy: actor, decidedAt, session,
                    })
                    : await walletConversionRequest_repository_1.walletConversionRequestRepository.rejectPending({
                        conversionReference: input.conversionReference,
                        decidedBy: actor, decidedAt,
                        rejectionCode: normalized.rejectionCode,
                        rejectionReason: normalized.rejectionReason, session,
                    });
                if (!updated)
                    return;
                await this.inject("AFTER_GUARDED_TRANSITION");
                await this.inject("BEFORE_AUDIT");
                const action = normalized.decision === walletConversionDecision_enum_1.WalletConversionDecision.APPROVE
                    ? walletConversionAuditAction_enum_1.WalletConversionAuditAction.APPROVED
                    : walletConversionAuditAction_enum_1.WalletConversionAuditAction.REJECTED;
                await walletConversionAudit_repository_1.walletConversionAuditRepository.createOnce({
                    auditKey: (0, idempotency_util_1.createIdempotencyFingerprint)(action, current.conversionKey),
                    action, conversionReference: current.conversionReference,
                    sourceCurrency: current.sourceCurrency,
                    targetCurrency: current.targetCurrency,
                    sourceAmount: current.sourceAmount,
                    targetAmount: current.targetAmount,
                    fxSnapshotReference: current.fxSnapshotReference,
                    fxEffectiveDate: current.fxEffectiveDate,
                    requestedAt: current.requestedAt,
                    decision: normalized.decision,
                    rejectionCode: normalized.rejectionCode,
                    adminActorId: actor, decidedAt,
                }, session);
                await this.inject("AFTER_AUDIT");
                await this.inject("BEFORE_COMMIT");
            });
        }
        finally {
            await session.endSession();
        }
        if (updated)
            return (0, walletConversionRequest_response_dto_1.toWalletConversionRequestResponseDto)(updated);
        const winner = await walletConversionRequest_repository_1.walletConversionRequestRepository.findByReference(input.conversionReference);
        if (!winner) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion request was not found.", "WALLET_CONVERSION_REQUEST_NOT_FOUND", 404);
        }
        return this.terminal(winner, actor, normalized);
    }
    async list(adminUserId, query) {
        this.actor(adminUserId);
        const page = this.page(query.page, 1);
        const limit = Math.min(this.page(query.limit, 20), 100);
        let status = walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.PENDING;
        if (query.status !== undefined) {
            if (!Object.values(walletConversionRequestStatus_enum_1.WalletConversionRequestStatus).includes(query.status)) {
                throw new WalletConversionRequestError_1.WalletConversionRequestError("Status filter is invalid.", "WALLET_CONVERSION_INVALID_STATUS", 422);
            }
            status = query.status;
        }
        const currency = (value, label) => {
            if (value === undefined)
                return undefined;
            try {
                return currencyMetadata_service_1.currencyMetadataService.normalize(String(value));
            }
            catch {
                throw new WalletConversionRequestError_1.WalletConversionRequestError(`${label} currency is invalid.`, label === "source" ? "WALLET_CONVERSION_INVALID_SOURCE_CURRENCY" :
                    "WALLET_CONVERSION_INVALID_TARGET_CURRENCY", 422);
            }
        };
        const date = (value) => {
            if (value === undefined)
                return undefined;
            const parsed = new Date(String(value));
            if (Number.isNaN(parsed.valueOf())) {
                throw new WalletConversionRequestError_1.WalletConversionRequestError("Requested date is invalid.", "WALLET_CONVERSION_INVALID_PAGINATION", 422);
            }
            return parsed;
        };
        const items = await walletConversionRequest_repository_1.walletConversionRequestRepository.listForAdmin({
            status,
            sourceCurrency: currency(query.sourceCurrency, "source"),
            targetCurrency: currency(query.targetCurrency, "target"),
            conversionReference: query.conversionReference === undefined ? undefined :
                String(query.conversionReference),
            requestedFrom: date(query.requestedFrom),
            requestedTo: date(query.requestedTo),
        }, page, limit);
        return items.map(walletConversionRequest_response_dto_1.toWalletConversionRequestResponseDto);
    }
    async get(adminUserId, conversionReference) {
        this.actor(adminUserId);
        const request = await walletConversionRequest_repository_1.walletConversionRequestRepository.findByReference(conversionReference);
        if (!request) {
            throw new WalletConversionRequestError_1.WalletConversionRequestError("Conversion request was not found.", "WALLET_CONVERSION_REQUEST_NOT_FOUND", 404);
        }
        return (0, walletConversionRequest_response_dto_1.toWalletConversionRequestResponseDto)(request);
    }
}
exports.AdminWalletConversionDecisionService = AdminWalletConversionDecisionService;
exports.adminWalletConversionDecisionService = new AdminWalletConversionDecisionService();
