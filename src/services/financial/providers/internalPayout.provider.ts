import crypto from "crypto";
import { Types } from "mongoose";

import { PayoutProviderInterface } from "../../../contracts/financial/payoutProvider.interface";
import {
  InitializePayoutRequest,
  InitializePayoutResponse,
  GetPayoutResultRequest,
  PayoutProviderResult,
  PayoutProviderInitializationIdentity,
} from "../../../contracts/financial/payoutProvider.types";
import { PaymentProvider } from "../../../enums/financial/paymentProvider.enum";
import { PayoutDestinationType } from "../../../enums/financial/payoutDestinationType.enum";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "../../../constants/financial/supportedCurrencies";
import { PayoutError } from "../../../errors/financial/PayoutError";
import { ProviderSimulationMode } from "../../../constants/internalProvider";
import { hasReferenceType, isValidFinancialReference } from "../../../utils/financial/reference.util";
import ProviderPayoutService from "../../internalProvider/payouts/providerPayout.service";
import { payoutDestinationCryptoService } from "../../security/payoutDestinationCrypto.service";

export class InternalPayoutProvider implements PayoutProviderInterface {
  readonly provider = PaymentProvider.INTERNAL;

  async initializePayout(
    request: InitializePayoutRequest,
  ): Promise<InitializePayoutResponse> {
    this.validateRequest(request);
    const fingerprint = this.createDestinationFingerprint(request);
    const existing = await ProviderPayoutService.findByIdempotencyKeyForDestinationConsistency(request.idempotencyKey);

    if (existing) {
      this.assertExistingDestinationConsistency(existing, request, fingerprint);
      return {
        providerPayoutId: existing.providerPayoutId,
        providerReference: existing.providerReference ?? undefined,
        initializationIdentity: this.initializationIdentity(existing),
        payload: {
          provider: PaymentProvider.INTERNAL,
          duplicateRequest: true,
        },
      };
    }

    const providerPayoutId = `INT_PAYOUT_${crypto
      .randomBytes(8)
      .toString("hex")
      .toUpperCase()}`;
    const providerReference = `INT_PAYOUT_REF_${crypto
      .randomBytes(8)
      .toString("hex")
      .toUpperCase()}`;

    try {
      await ProviderPayoutService.createWithdrawalPayout({
        payoutId: new Types.ObjectId(request.payoutId),
        providerPayoutId,
        providerReference,
        idempotencyKey: request.idempotencyKey,
        providerDestination: this.createProviderDestination(
          request,
          providerPayoutId,
          fingerprint,
        ),
        providerMetadata: {
          provider: PaymentProvider.INTERNAL,
          environment: process.env.NODE_ENV ?? "development",
          simulationMode: ProviderSimulationMode.NORMAL,
        },
        execution: {
          attemptNumber: 1,
          retryCount: 0,
          processingLatencyMs: 0,
          isTestMode: process.env.NODE_ENV !== "production",
        },
        audit: {
          createdBy: "InternalPayoutProvider",
          updatedBy: "InternalPayoutProvider",
          lastStatusChangedAt: new Date(),
        },
        payloads: {
          request: this.createSafeRequestPayload(request, providerPayoutId),
          response: {},
        },
      });
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const winner = await ProviderPayoutService.findByIdempotencyKeyForDestinationConsistency(
        request.idempotencyKey,
      );
      if (!winner) throw error;
      this.assertExistingDestinationConsistency(winner, request, fingerprint);
      return {
        providerPayoutId: winner.providerPayoutId,
        providerReference: winner.providerReference ?? undefined,
        initializationIdentity: this.initializationIdentity(winner),
        payload: { provider: PaymentProvider.INTERNAL, duplicateRequest: true },
      };
    }

    const persisted = await ProviderPayoutService.findByIdempotencyKeyForDestinationConsistency(
      request.idempotencyKey,
    );
    if (!persisted) {
      throw new PayoutError("Provider payout initialization could not be verified.", "PROVIDER_PAYOUT_INITIALIZATION_IDENTITY_MISSING");
    }
    this.assertExistingDestinationConsistency(persisted, request, fingerprint);

    return {
      providerPayoutId: persisted.providerPayoutId,
      providerReference: persisted.providerReference ?? undefined,
      initializationIdentity: this.initializationIdentity(persisted),
      payload: {
        provider: PaymentProvider.INTERNAL,
        status: "CREATED",
      },
    };
  }

  private initializationIdentity(
    payout: {
      payoutId: Types.ObjectId;
      providerPayoutId: string;
      providerReference?: string;
      providerDestination?: {
        sourceSnapshotVersion: 1;
        destinationReference: string;
        fingerprint: string;
      };
      payloads: { request: unknown; response: unknown };
    },
  ): PayoutProviderInitializationIdentity {
    const destination = payout.providerDestination;
    const request = payout.payloads.request;
    if (
      !destination ||
      !this.isSafeInitializationRequest(request) ||
      request.payoutId !== payout.payoutId.toString()
    ) {
      throw new PayoutError("Provider payout initialization identity is invalid.", "PROVIDER_PAYOUT_INITIALIZATION_IDENTITY_INVALID");
    }
    return {
      providerPayoutId: payout.providerPayoutId,
      providerReference: payout.providerReference ?? undefined,
      payoutId: payout.payoutId.toString(),
      withdrawalReference: request.withdrawalReference,
      amount: request.amount,
      destinationSnapshotVersion: destination.sourceSnapshotVersion,
      destinationReference: destination.destinationReference,
      destinationFingerprint: destination.fingerprint,
    };
  }

  private isSafeInitializationRequest(
    value: unknown,
  ): value is { payoutId: string; withdrawalReference: string; amount: { amount: number; currency: SupportedCurrency } } {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const amount = record.amount;
    return typeof record.payoutId === "string" &&
      typeof record.withdrawalReference === "string" &&
      !!amount && typeof amount === "object" && !Array.isArray(amount) &&
      typeof (amount as Record<string, unknown>).amount === "number" &&
      typeof (amount as Record<string, unknown>).currency === "string" &&
      SUPPORTED_CURRENCIES.some(
        (currency) => currency === (amount as Record<string, unknown>).currency,
      );
  }

  async getPayoutResult(
    request: GetPayoutResultRequest,
  ): Promise<PayoutProviderResult> {
    const payout = await ProviderPayoutService.findByProviderPayoutId(
      request.providerPayoutId,
    );

    if (!payout || payout.payoutId.toString() !== request.payoutId) {
      throw new Error("Provider payout not found.");
    }

    const providerRequest = payout.payloads.request as { amount: InitializePayoutRequest["amount"] };
    const amount = providerRequest.amount;

    switch (payout.status) {
      case "PAID":
        return {
          outcome: "COMPLETED",
          terminal: true,
          providerPayoutId: payout.providerPayoutId,
          providerTransactionId: payout.providerTransactionId ?? undefined,
          amount,
          completedAt: payout.paidAt ?? undefined,
          payload: { provider: PaymentProvider.INTERNAL, status: payout.status },
        };
      case "FAILED":
      case "CANCELLED":
      case "EXPIRED":
        return {
          outcome: "FAILED",
          terminal: true,
          providerPayoutId: payout.providerPayoutId,
          providerTransactionId: payout.providerTransactionId ?? undefined,
          amount,
          failedAt:
            payout.failedAt ?? payout.cancelledAt ?? payout.expiredAt ?? undefined,
          failureCode: payout.failureCode ?? payout.failureReason,
          failureReason: payout.failureMessage ?? payout.failureReason,
          payload: { provider: PaymentProvider.INTERNAL, status: payout.status },
        };
      default:
        return {
          outcome: "PROCESSING",
          terminal: false,
          providerPayoutId: payout.providerPayoutId,
          amount,
          payload: { provider: PaymentProvider.INTERNAL, status: payout.status },
        };
    }
  }

  private validateRequest(request: InitializePayoutRequest): void {
    if (!Types.ObjectId.isValid(request.payoutId) || !request.destination) {
      throw this.invalidDestination();
    }
    const destination = request.destination;
    if (
      destination.snapshotVersion !== 1 ||
      typeof destination.destinationReference !== "string" ||
      !isValidFinancialReference(destination.destinationReference) ||
      !hasReferenceType(destination.destinationReference, "PAYOUT_DESTINATION") ||
      typeof destination.maskedIdentifier !== "string" ||
      destination.maskedIdentifier.length === 0 ||
      !destination.executionDestination ||
      destination.executionDestination.type !== destination.type
    ) {
      throw this.invalidDestination();
    }

    switch (destination.type) {
      case PayoutDestinationType.BANK_ACCOUNT: {
        const execution = destination.executionDestination;
        if (execution.type !== PayoutDestinationType.BANK_ACCOUNT) throw this.invalidDestination();
        const accountHolderName = this.normalizeAccountHolderName(execution.accountHolderName);
        const accountNumber = this.normalizeAccountNumber(execution.accountNumber);
        const ifsc = this.normalizeIfsc(execution.ifsc);
        if (
          execution.accountHolderName !== accountHolderName ||
          execution.accountNumber !== accountNumber ||
          execution.ifsc !== ifsc ||
          !/^\d{4}$/.test(destination.accountNumberLast4) ||
          destination.accountNumberLast4 !== accountNumber.slice(-4) ||
          destination.ifscDisplay !== ifsc ||
          !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(destination.ifscDisplay) ||
          destination.maskedIdentifier !== `••••${destination.accountNumberLast4}`
        ) {
          throw this.invalidDestination();
        }
        return;
      }
      case PayoutDestinationType.UPI: {
        const execution = destination.executionDestination;
        if (execution.type !== PayoutDestinationType.UPI) throw this.invalidDestination();
        const upiId = this.normalizeUpiId(execution.upiId);
        if (
          execution.upiId !== upiId ||
          destination.accountNumberLast4 !== undefined ||
          destination.ifscDisplay !== undefined ||
          destination.maskedIdentifier !== this.maskUpiId(upiId)
        ) {
          throw this.invalidDestination();
        }
        return;
      }
      default:
        throw this.invalidDestination();
    }
  }

  private createDestinationFingerprint(request: InitializePayoutRequest): string {
    switch (request.destination.type) {
      case PayoutDestinationType.BANK_ACCOUNT: {
        const destination = request.destination.executionDestination;
        if (destination.type !== PayoutDestinationType.BANK_ACCOUNT) throw this.invalidDestination();
        return payoutDestinationCryptoService.createInternalPayoutDestinationFingerprint(
          JSON.stringify({
            type: destination.type,
            accountHolderName: destination.accountHolderName,
            accountNumber: destination.accountNumber,
            ifsc: destination.ifsc,
          }),
        );
      }
      case PayoutDestinationType.UPI: {
        const destination = request.destination.executionDestination;
        if (destination.type !== PayoutDestinationType.UPI) throw this.invalidDestination();
        return payoutDestinationCryptoService.createInternalPayoutDestinationFingerprint(
          JSON.stringify({ type: destination.type, upiId: destination.upiId }),
        );
      }
      default:
        throw this.invalidDestination();
    }
  }

  private createProviderDestination(
    request: InitializePayoutRequest,
    providerPayoutId: string,
    fingerprint: string,
  ) {
    const destination = request.destination;
    switch (destination.type) {
      case PayoutDestinationType.BANK_ACCOUNT: {
        const execution = destination.executionDestination;
        if (execution.type !== PayoutDestinationType.BANK_ACCOUNT) throw this.invalidDestination();
        return {
          version: 1 as const,
          sourceSnapshotVersion: destination.snapshotVersion,
          destinationReference: destination.destinationReference,
          type: destination.type,
          maskedIdentifier: destination.maskedIdentifier,
          accountNumberLast4: destination.accountNumberLast4,
          ifscDisplay: destination.ifscDisplay,
          fingerprint,
          encryptedPayload: payoutDestinationCryptoService.encryptInternalPayoutDestinationPayload(
            { accountHolderName: execution.accountHolderName, accountNumber: execution.accountNumber, ifsc: execution.ifsc },
            { financialPayoutId: request.payoutId, providerPayoutId, withdrawalReference: request.withdrawalReference, destinationReference: destination.destinationReference, destinationType: destination.type },
          ),
        };
      }
      case PayoutDestinationType.UPI: {
        const execution = destination.executionDestination;
        if (execution.type !== PayoutDestinationType.UPI) throw this.invalidDestination();
        return {
          version: 1 as const,
          sourceSnapshotVersion: destination.snapshotVersion,
          destinationReference: destination.destinationReference,
          type: destination.type,
          maskedIdentifier: destination.maskedIdentifier,
          fingerprint,
          encryptedPayload: payoutDestinationCryptoService.encryptInternalPayoutDestinationPayload(
            { upiId: execution.upiId },
            { financialPayoutId: request.payoutId, providerPayoutId, withdrawalReference: request.withdrawalReference, destinationReference: destination.destinationReference, destinationType: destination.type },
          ),
        };
      }
      default:
        throw this.invalidDestination();
    }
  }

  private createSafeRequestPayload(request: InitializePayoutRequest, providerPayoutId: string) {
    const destination = request.destination;
    return {
      payoutId: request.payoutId,
      providerPayoutId,
      payoutReference: request.payoutReference,
      withdrawalReference: request.withdrawalReference,
      creatorId: request.creatorId,
      amount: request.amount,
      provider: request.provider,
      idempotencyKey: request.idempotencyKey,
      destination: {
        snapshotVersion: destination.snapshotVersion,
        destinationReference: destination.destinationReference,
        type: destination.type,
        maskedIdentifier: destination.maskedIdentifier,
        ...(destination.type === PayoutDestinationType.BANK_ACCOUNT
          ? { accountNumberLast4: destination.accountNumberLast4, ifscDisplay: destination.ifscDisplay }
          : {}),
      },
    };
  }

  private assertExistingDestinationConsistency(
    existing: { payoutId: Types.ObjectId; providerDestination?: { version: 1; sourceSnapshotVersion: 1; fingerprint: string; destinationReference: string; type: PayoutDestinationType; maskedIdentifier: string; accountNumberLast4?: string; ifscDisplay?: string } },
    request: InitializePayoutRequest,
    fingerprint: string,
  ): void {
    const destination = existing.providerDestination;
    if (
      !destination ||
      destination.version !== 1 ||
      destination.sourceSnapshotVersion !== request.destination.snapshotVersion ||
      existing.payoutId.toString() !== request.payoutId ||
      !this.fingerprintsEqual(destination.fingerprint, fingerprint) ||
      destination.destinationReference !== request.destination.destinationReference ||
      destination.type !== request.destination.type ||
      destination.maskedIdentifier !== request.destination.maskedIdentifier ||
      (request.destination.type === PayoutDestinationType.BANK_ACCOUNT &&
        (destination.accountNumberLast4 !== request.destination.accountNumberLast4 ||
          destination.ifscDisplay !== request.destination.ifscDisplay)) ||
      (request.destination.type === PayoutDestinationType.UPI &&
        (destination.accountNumberLast4 !== undefined || destination.ifscDisplay !== undefined))
    ) {
      throw new PayoutError("Provider payout destination conflicts with an existing payout.", "PROVIDER_PAYOUT_DESTINATION_CONFLICT");
    }
  }

  private fingerprintsEqual(first: string, second: string): boolean {
    const left = Buffer.from(first, "utf8");
    const right = Buffer.from(second, "utf8");
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
  }

  private normalizeAccountHolderName(value: unknown): string {
    if (typeof value !== "string") throw this.invalidDestination();
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!/^[\p{L}][\p{L} .'-]{1,98}$/u.test(normalized)) throw this.invalidDestination();
    return normalized;
  }

  private normalizeAccountNumber(value: unknown): string {
    if (typeof value !== "string") throw this.invalidDestination();
    const normalized = value.replace(/[\s-]/g, "");
    if (!/^\d{9,18}$/.test(normalized)) throw this.invalidDestination();
    return normalized;
  }

  private normalizeIfsc(value: unknown): string {
    if (typeof value !== "string") throw this.invalidDestination();
    const normalized = value.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized)) throw this.invalidDestination();
    return normalized;
  }

  private normalizeUpiId(value: unknown): string {
    if (typeof value !== "string") throw this.invalidDestination();
    const normalized = value.trim().toLowerCase();
    if (normalized.includes(" ") || !/^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$/.test(normalized)) {
      throw this.invalidDestination();
    }
    return normalized;
  }

  private maskUpiId(upiId: string): string {
    const [localPart, handle] = upiId.split("@");
    return `${localPart.charAt(0)}•••${localPart.slice(-1)}@${handle}`;
  }

  private invalidDestination(): PayoutError {
    return new PayoutError("Provider payout destination is invalid.", "PROVIDER_PAYOUT_DESTINATION_INVALID");
  }
}

export const internalPayoutProvider = new InternalPayoutProvider();
