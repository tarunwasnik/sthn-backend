import mongoose, { Types } from "mongoose";

import { SupportedCurrency } from
  "../../constants/financial/supportedCurrencies";
import { WalletConversionAuditAction } from
  "../../enums/financial/walletConversionAuditAction.enum";
import { WalletConversionDecision } from
  "../../enums/financial/walletConversionDecision.enum";
import { WalletConversionRejectionCode } from
  "../../enums/financial/walletConversionRejectionCode.enum";
import { WalletConversionRequestStatus } from
  "../../enums/financial/walletConversionRequestStatus.enum";
import { WalletConversionRequestError } from
  "../../errors/financial/WalletConversionRequestError";
import { WalletConversionRequestDocument } from
  "../../models/walletConversionRequest.model";
import { walletConversionAuditRepository } from
  "../../repositories/walletConversionAudit.repository";
import { walletConversionRequestRepository } from
  "../../repositories/walletConversionRequest.repository";
import { createIdempotencyFingerprint } from
  "../../utils/financial/idempotency.util";
import { hasReferenceType } from "../../utils/financial/reference.util";
import { toWalletConversionRequestResponseDto } from
  "../../dtos/wallet/walletConversionRequest.response.dto";
import { currencyMetadataService } from "./currencyMetadata.service";
import { WalletConversionRequestService, walletConversionRequestService } from
  "./walletConversionRequest.service";

export type WalletConversionDecisionFailurePoint =
  | "AFTER_REQUEST_VALIDATION"
  | "AFTER_SNAPSHOT_VALIDATION"
  | "AFTER_SOURCE_WALLET_PRECHECK"
  | "AFTER_GUARDED_TRANSITION"
  | "BEFORE_AUDIT"
  | "AFTER_AUDIT"
  | "BEFORE_COMMIT";

interface DecisionInput {
  adminUserId: string;
  conversionReference: string;
  decision: unknown;
  rejectionCode?: unknown;
  rejectionReason?: unknown;
}

interface ServiceOptions {
  now?: () => Date;
  failureInjector?: (point: WalletConversionDecisionFailurePoint) =>
    void | Promise<void>;
}

export class AdminWalletConversionDecisionService {
  private isApprovedAuthorityStatus(status: WalletConversionRequestStatus) {
    return [WalletConversionRequestStatus.APPROVED,
      WalletConversionRequestStatus.COMPLETED,
      WalletConversionRequestStatus.FAILED].includes(status);
  }

  private readonly now: () => Date;

  constructor(
    private readonly requestService: WalletConversionRequestService =
      walletConversionRequestService,
    private readonly options: ServiceOptions = {},
  ) { this.now = options.now ?? (() => new Date()); }

  private async inject(point: WalletConversionDecisionFailurePoint) {
    await this.options.failureInjector?.(point);
  }

  private page(value: unknown, fallback: number) {
    if (value === undefined) return fallback;
    const parsed = typeof value === "string" ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || (parsed as number) < 1) {
      throw new WalletConversionRequestError("Pagination is invalid.",
        "WALLET_CONVERSION_INVALID_PAGINATION", 422);
    }
    return parsed as number;
  }

  private actor(value: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new WalletConversionRequestError("Admin identity is invalid.",
        "WALLET_CONVERSION_INTEGRITY_ERROR", 401);
    }
    return new Types.ObjectId(value);
  }

  private normalize(input: DecisionInput) {
    if (!hasReferenceType(input.conversionReference, "WALLET_CONVERSION")) {
      throw new WalletConversionRequestError("Conversion reference is invalid.",
        "WALLET_CONVERSION_REQUEST_NOT_FOUND", 404);
    }
    if (!Object.values(WalletConversionDecision).includes(
      input.decision as WalletConversionDecision)) {
      throw new WalletConversionRequestError("Conversion decision is invalid.",
        "WALLET_CONVERSION_INVALID_DECISION", 422);
    }
    const decision = input.decision as WalletConversionDecision;
    if (decision === WalletConversionDecision.APPROVE &&
      (input.rejectionCode !== undefined || input.rejectionReason !== undefined)) {
      throw new WalletConversionRequestError(
        "Rejection data is not permitted for approval.",
        "WALLET_CONVERSION_REJECTION_DATA_NOT_ALLOWED", 422,
      );
    }
    const rejectionCode = input.rejectionCode as
      WalletConversionRejectionCode | undefined;
    if (decision === WalletConversionDecision.REJECT &&
      !Object.values(WalletConversionRejectionCode).includes(
        rejectionCode as WalletConversionRejectionCode)) {
      throw new WalletConversionRequestError("Rejection code is required.",
        "WALLET_CONVERSION_REJECTION_CODE_REQUIRED", 422);
    }
    let rejectionReason: string | undefined;
    if (input.rejectionReason !== undefined) {
      if (typeof input.rejectionReason !== "string" ||
        !(rejectionReason = input.rejectionReason.trim()) ||
        rejectionReason.length > 500) {
        throw new WalletConversionRequestError("Rejection reason is invalid.",
          "WALLET_CONVERSION_INVALID_REJECTION_REASON", 422);
      }
    }
    return { decision, rejectionCode, rejectionReason };
  }

  private assertDecisionMetadata(request: WalletConversionRequestDocument) {
    if (!(request.decidedAt instanceof Date) ||
      Number.isNaN(request.decidedAt.valueOf()) || !request.decidedBy) {
      throw new WalletConversionRequestError("Decision metadata is incomplete.",
        "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
    }
    if (this.isApprovedAuthorityStatus(request.status) &&
      (request.rejectionCode !== undefined ||
        request.rejectionReason !== undefined)) {
      throw new WalletConversionRequestError("Approval metadata is inconsistent.",
        "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
    }
    if (request.status === WalletConversionRequestStatus.REJECTED &&
      !request.rejectionCode) {
      throw new WalletConversionRequestError("Rejection metadata is incomplete.",
        "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
    }
  }

  private assertPendingMetadata(request: WalletConversionRequestDocument) {
    if (request.decidedAt || request.decidedBy || request.rejectionCode ||
      request.rejectionReason !== undefined) {
      throw new WalletConversionRequestError("Pending decision metadata is invalid.",
        "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
    }
  }

  private async validateAuthority(request: WalletConversionRequestDocument,
    requireApprovalEligibility: boolean) {
    try {
      return await this.requestService.validateStoredAuthority(request, {
        checkSourceBalance: requireApprovalEligibility,
        requireSnapshotEligible: requireApprovalEligibility,
      });
    } catch (error: any) {
      if (error instanceof WalletConversionRequestError) {
        if (error.code === "WALLET_CONVERSION_FX_SNAPSHOT_NOT_FOUND") {
          throw new WalletConversionRequestError("Bound FX snapshot was not found.",
            "WALLET_CONVERSION_SNAPSHOT_NOT_FOUND", 404, error);
        }
        if (error.code === "WALLET_CONVERSION_FX_SNAPSHOT_EXPIRED") {
          throw new WalletConversionRequestError("Bound FX snapshot is expired.",
            "WALLET_CONVERSION_SNAPSHOT_EXPIRED", 409, error);
        }
        if (error.code === "WALLET_CONVERSION_FX_SNAPSHOT_CONFLICT") {
          throw new WalletConversionRequestError("Bound FX snapshot conflicts.",
            "WALLET_CONVERSION_SNAPSHOT_CONFLICT", 409, error);
        }
        if (["WALLET_CONVERSION_SOURCE_WALLET_OWNERSHIP_CONFLICT",
          "WALLET_CONVERSION_SOURCE_WALLET_CURRENCY_CONFLICT"].includes(
          error.code)) {
          throw new WalletConversionRequestError("Source Wallet conflicts.",
            "WALLET_CONVERSION_SOURCE_WALLET_CONFLICT", 409, error);
        }
      }
      throw error;
    }
  }

  private async terminal(request: WalletConversionRequestDocument,
    actor: Types.ObjectId, normalized: ReturnType<
      AdminWalletConversionDecisionService["normalize"]>) {
    const approvedAuthority = this.isApprovedAuthorityStatus(request.status);
    if (!approvedAuthority &&
      request.status !== WalletConversionRequestStatus.REJECTED) {
      throw new WalletConversionRequestError("Conversion status is invalid.",
        "WALLET_CONVERSION_INVALID_STATUS", 409);
    }
    await this.validateAuthority(request, false);
    this.assertDecisionMetadata(request);
    const action = approvedAuthority
      ? WalletConversionAuditAction.APPROVED
      : WalletConversionAuditAction.REJECTED;
    const persistedDecision = approvedAuthority
      ? WalletConversionDecision.APPROVE
      : WalletConversionDecision.REJECT;
    const audit = await walletConversionAuditRepository.findByAuditKey(
      createIdempotencyFingerprint(action, request.conversionKey),
    );
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
      !audit.adminActorId?.equals(request.decidedBy!) ||
      audit.decidedAt?.getTime() !== request.decidedAt!.getTime()) {
      throw new WalletConversionRequestError("Decision audit authority conflicts.",
        "WALLET_CONVERSION_INTEGRITY_ERROR", 500);
    }
    if (!request.decidedBy!.equals(actor)) {
      throw new WalletConversionRequestError("Decision actor conflicts.",
        "WALLET_CONVERSION_DECISION_CONFLICT", 409);
    }
    if (approvedAuthority &&
      normalized.decision === WalletConversionDecision.APPROVE) {
      return toWalletConversionRequestResponseDto(request);
    }
    if (request.status === WalletConversionRequestStatus.REJECTED &&
      normalized.decision === WalletConversionDecision.REJECT &&
      request.rejectionCode === normalized.rejectionCode &&
      (request.rejectionReason ?? undefined) === normalized.rejectionReason) {
      return toWalletConversionRequestResponseDto(request);
    }
    throw new WalletConversionRequestError(
      "Conversion decision conflicts with committed authority.",
      "WALLET_CONVERSION_DECISION_CONFLICT", 409,
    );
  }

  async decide(input: DecisionInput) {
    const actor = this.actor(input.adminUserId);
    const normalized = this.normalize(input);
    const current = await walletConversionRequestRepository.findByReference(
      input.conversionReference,
    );
    if (!current) {
      throw new WalletConversionRequestError("Conversion request was not found.",
        "WALLET_CONVERSION_REQUEST_NOT_FOUND", 404);
    }
    if (current.status !== WalletConversionRequestStatus.PENDING) {
      return this.terminal(current, actor, normalized);
    }
    this.assertPendingMetadata(current);
    await this.validateAuthority(current,
      normalized.decision === WalletConversionDecision.APPROVE);
    await this.inject("AFTER_REQUEST_VALIDATION");
    await this.inject("AFTER_SNAPSHOT_VALIDATION");
    if (normalized.decision === WalletConversionDecision.APPROVE) {
      await this.inject("AFTER_SOURCE_WALLET_PRECHECK");
    }

    const decidedAt = this.now();
    const session = await mongoose.startSession();
    let updated: WalletConversionRequestDocument | null = null;
    try {
      await session.withTransaction(async () => {
        updated = normalized.decision === WalletConversionDecision.APPROVE
          ? await walletConversionRequestRepository.approvePending({
            conversionReference: input.conversionReference,
            decidedBy: actor, decidedAt, session,
          })
          : await walletConversionRequestRepository.rejectPending({
            conversionReference: input.conversionReference,
            decidedBy: actor, decidedAt,
            rejectionCode: normalized.rejectionCode!,
            rejectionReason: normalized.rejectionReason, session,
          });
        if (!updated) return;
        await this.inject("AFTER_GUARDED_TRANSITION");
        await this.inject("BEFORE_AUDIT");
        const action = normalized.decision === WalletConversionDecision.APPROVE
          ? WalletConversionAuditAction.APPROVED
          : WalletConversionAuditAction.REJECTED;
        await walletConversionAuditRepository.createOnce({
          auditKey: createIdempotencyFingerprint(action, current.conversionKey),
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
    } finally { await session.endSession(); }
    if (updated) return toWalletConversionRequestResponseDto(updated);
    const winner = await walletConversionRequestRepository.findByReference(
      input.conversionReference,
    );
    if (!winner) {
      throw new WalletConversionRequestError("Conversion request was not found.",
        "WALLET_CONVERSION_REQUEST_NOT_FOUND", 404);
    }
    return this.terminal(winner, actor, normalized);
  }

  async list(adminUserId: string, query: Record<string, unknown>) {
    this.actor(adminUserId);
    const page = this.page(query.page, 1);
    const limit = Math.min(this.page(query.limit, 20), 100);
    let status = WalletConversionRequestStatus.PENDING;
    if (query.status !== undefined) {
      if (!Object.values(WalletConversionRequestStatus).includes(
        query.status as WalletConversionRequestStatus)) {
        throw new WalletConversionRequestError("Status filter is invalid.",
          "WALLET_CONVERSION_INVALID_STATUS", 422);
      }
      status = query.status as WalletConversionRequestStatus;
    }
    const currency = (value: unknown, label: "source" | "target") => {
      if (value === undefined) return undefined;
      try { return currencyMetadataService.normalize(String(value)); }
      catch {
        throw new WalletConversionRequestError(`${label} currency is invalid.`,
          label === "source" ? "WALLET_CONVERSION_INVALID_SOURCE_CURRENCY" :
            "WALLET_CONVERSION_INVALID_TARGET_CURRENCY", 422);
      }
    };
    const date = (value: unknown) => {
      if (value === undefined) return undefined;
      const parsed = new Date(String(value));
      if (Number.isNaN(parsed.valueOf())) {
        throw new WalletConversionRequestError("Requested date is invalid.",
          "WALLET_CONVERSION_INVALID_PAGINATION", 422);
      }
      return parsed;
    };
    const items = await walletConversionRequestRepository.listForAdmin({
      status,
      sourceCurrency: currency(query.sourceCurrency, "source") as
        SupportedCurrency | undefined,
      targetCurrency: currency(query.targetCurrency, "target") as
        SupportedCurrency | undefined,
      conversionReference: query.conversionReference === undefined ? undefined :
        String(query.conversionReference),
      requestedFrom: date(query.requestedFrom),
      requestedTo: date(query.requestedTo),
    }, page, limit);
    return items.map(toWalletConversionRequestResponseDto);
  }

  async get(adminUserId: string, conversionReference: string) {
    this.actor(adminUserId);
    const request = await walletConversionRequestRepository.findByReference(
      conversionReference,
    );
    if (!request) {
      throw new WalletConversionRequestError("Conversion request was not found.",
        "WALLET_CONVERSION_REQUEST_NOT_FOUND", 404);
    }
    return toWalletConversionRequestResponseDto(request);
  }
}

export const adminWalletConversionDecisionService =
  new AdminWalletConversionDecisionService();
