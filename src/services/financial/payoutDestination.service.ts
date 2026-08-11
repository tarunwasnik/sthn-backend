import mongoose from "mongoose";
import crypto from "crypto";

import { PayoutDestinationType } from "../../enums/financial/payoutDestinationType.enum";
import { PayoutDestinationVerificationStatus } from "../../enums/financial/payoutDestinationVerificationStatus.enum";
import { PayoutDestinationError } from "../../errors/financial/PayoutDestinationError";
import { IPayoutDestination } from "../../models/payoutDestination.model";
import { payoutDestinationRepository } from "../../repositories/payoutDestination.repository";
import { payoutDestinationCryptoService } from "../security/payoutDestinationCrypto.service";
import { isValidIdempotencyKey, normalizeIdempotencyKey } from "../../utils/financial/idempotency.util";
import { generateFinancialReference } from "../../utils/financial/reference.util";
import { hasReferenceType, isValidFinancialReference } from "../../utils/financial/reference.util";
import type { IWithdrawalDestinationSnapshot, NormalizedWithdrawalDestination } from "../../types/financial/withdrawalDestinationSnapshot.type";

export interface CreatePayoutDestinationInput {
  creatorId: string;
  type: unknown;
  accountHolderName?: unknown;
  accountNumber?: unknown;
  ifsc?: unknown;
  upiId?: unknown;
  idempotencyKey: unknown;
}

export interface PayoutDestinationResponse {
  destinationReference: string;
  type: PayoutDestinationType;
  verificationStatus: PayoutDestinationVerificationStatus;
  isActive: boolean;
  maskedIdentifier: string;
  accountNumberLast4?: string;
  ifscDisplay?: string;
  verifiedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  deactivatedAt?: Date;
  reactivatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface NormalizedDestination {
  type: PayoutDestinationType;
  idempotencyKey: string;
  destinationFingerprint: string;
  requestFingerprint: string;
  encryptedPayload: Record<string, string>;
  maskedIdentifier: string;
  accountNumberLast4?: string;
  ifscDisplay?: string;
}

export interface CreateWithdrawalBindingSnapshotInput {
  creatorId: string;
  destinationReference: string;
  withdrawalReference: string;
  session: mongoose.ClientSession;
}

export class PayoutDestinationService {
  constructor(private readonly repository = payoutDestinationRepository) {}

  async create(
    input: CreatePayoutDestinationInput,
  ): Promise<{ destination: IPayoutDestination; created: boolean }> {
    this.validateCreatorId(input.creatorId);
    const canonicalCreatorId = new mongoose.Types.ObjectId(input.creatorId).toHexString();
    const normalized = this.normalizeCreateInput(input);

    const sameKey = await this.repository.findByCreatorAndIdempotencyKey(
      canonicalCreatorId,
      normalized.idempotencyKey,
    );
    if (sameKey) {
      if (sameKey.requestFingerprint !== normalized.requestFingerprint) {
        throw new PayoutDestinationError(
          "Idempotency key conflicts with an existing payout destination request.",
          "PAYOUT_DESTINATION_IDEMPOTENCY_CONFLICT",
        );
      }
      return { destination: sameKey, created: false };
    }

    const duplicate = await this.repository.findByCreatorTypeAndDestinationFingerprint(
      input.creatorId,
      normalized.type,
      normalized.destinationFingerprint,
    );
    if (duplicate) {
      return { destination: duplicate, created: false };
    }

    try {
      const destination = await this.repository.create({
        destinationReference: generateFinancialReference("PAYOUT_DESTINATION"),
        creatorId: new mongoose.Types.ObjectId(input.creatorId),
        type: normalized.type,
        verificationStatus: PayoutDestinationVerificationStatus.UNVERIFIED,
        isActive: true,
        idempotencyKey: normalized.idempotencyKey,
        destinationFingerprint: normalized.destinationFingerprint,
        requestFingerprint: normalized.requestFingerprint,
        encryptedPayload: payoutDestinationCryptoService.encryptDestinationPayload(
          normalized.encryptedPayload,
        ),
        maskedIdentifier: normalized.maskedIdentifier,
        accountNumberLast4: normalized.accountNumberLast4,
        ifscDisplay: normalized.ifscDisplay,
      });

      return { destination, created: true };
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        return this.resolveCreateRace(input.creatorId, normalized);
      }
      throw error;
    }
  }

  async list(creatorId: string): Promise<IPayoutDestination[]> {
    this.validateCreatorId(creatorId);
    return this.repository.findManyByCreator(creatorId);
  }

  async createWithdrawalBindingSnapshot(
    input: CreateWithdrawalBindingSnapshotInput,
  ): Promise<{ payoutDestinationId: mongoose.Types.ObjectId; snapshot: IWithdrawalDestinationSnapshot }> {
    this.validateCreatorId(input.creatorId);
    const canonicalCreatorId = new mongoose.Types.ObjectId(input.creatorId).toHexString();
    if (!isValidFinancialReference(input.destinationReference) || !hasReferenceType(input.destinationReference, "PAYOUT_DESTINATION")) {
      throw new PayoutDestinationError("Invalid payout destination reference.", "INVALID_PAYOUT_DESTINATION_REFERENCE");
    }

    const destination = await this.repository.claimEligibleForWithdrawalBinding(
      canonicalCreatorId,
      input.destinationReference,
      input.session,
    );
    if (!destination) {
      const existing = await this.repository.findByCreatorAndReference(canonicalCreatorId, input.destinationReference, input.session);
      if (!existing) throw new PayoutDestinationError("Payout destination not found.", "PAYOUT_DESTINATION_NOT_FOUND");
      if (existing.verificationStatus === PayoutDestinationVerificationStatus.REJECTED) throw new PayoutDestinationError("Payout destination is rejected.", "PAYOUT_DESTINATION_REJECTED");
      if (existing.verificationStatus !== PayoutDestinationVerificationStatus.VERIFIED) throw new PayoutDestinationError("Payout destination is not verified.", "PAYOUT_DESTINATION_NOT_VERIFIED");
      if (!existing.isActive) throw new PayoutDestinationError("Payout destination is inactive.", "PAYOUT_DESTINATION_INACTIVE");
      throw new PayoutDestinationError("Payout destination state is inconsistent.", "PAYOUT_DESTINATION_INTEGRITY_ERROR");
    }
    if (!destination.verifiedAt || !destination.encryptedPayload || !destination.destinationFingerprint) {
      throw new PayoutDestinationError("Payout destination state is inconsistent.", "PAYOUT_DESTINATION_INTEGRITY_ERROR");
    }

    const decrypted = payoutDestinationCryptoService.decryptDestinationPayload(destination.encryptedPayload);
    const normalized = this.validateBindingPayload(destination, decrypted);
    const snapshotCreatedAt = new Date();
    const snapshot: IWithdrawalDestinationSnapshot = {
      version: 1,
      destinationReference: destination.destinationReference,
      type: destination.type,
      maskedIdentifier: destination.maskedIdentifier,
      accountNumberLast4: destination.accountNumberLast4,
      ifscDisplay: destination.ifscDisplay,
      verificationStatus: PayoutDestinationVerificationStatus.VERIFIED,
      verifiedAt: destination.verifiedAt,
      snapshotCreatedAt,
      encryptedPayload: payoutDestinationCryptoService.encryptWithdrawalDestinationSnapshotPayload(
        normalized.type === PayoutDestinationType.BANK_ACCOUNT
          ? {
              accountHolderName: normalized.accountHolderName,
              accountNumber: normalized.accountNumber,
              ifsc: normalized.ifsc,
            }
          : { upiId: normalized.upiId },
        {
          withdrawalReference: input.withdrawalReference,
          creatorId: canonicalCreatorId,
          destinationReference: destination.destinationReference,
          destinationType: destination.type,
          snapshotVersion: 1,
        },
      ),
    };
    return { payoutDestinationId: destination._id as mongoose.Types.ObjectId, snapshot };
  }

  async get(creatorId: string, destinationReference: string): Promise<IPayoutDestination> {
    this.validateCreatorId(creatorId);
    const destination = await this.repository.findByCreatorAndReference(
      creatorId,
      destinationReference,
    );
    if (!destination) {
      throw new PayoutDestinationError("Payout destination not found.", "PAYOUT_DESTINATION_NOT_FOUND");
    }
    return destination;
  }

  async setActivation(
    creatorId: string,
    destinationReference: string,
    isActive: boolean,
  ): Promise<{ destination: IPayoutDestination; changed: boolean }> {
    const current = await this.get(creatorId, destinationReference);
    if (current.isActive === isActive) {
      return { destination: current, changed: false };
    }
    if (isActive && current.verificationStatus === PayoutDestinationVerificationStatus.REJECTED) {
      throw new PayoutDestinationError(
        "Rejected payout destinations cannot be reactivated.",
        "PAYOUT_DESTINATION_REACTIVATION_REJECTED",
      );
    }

    const now = new Date();
    const updated = await this.repository.setActiveIfCurrent(
      creatorId,
      destinationReference,
      isActive,
      isActive ? { isActive: true, reactivatedAt: now } : { isActive: false, deactivatedAt: now },
    );
    if (updated) {
      return { destination: updated, changed: true };
    }

    const concurrent = await this.get(creatorId, destinationReference);
    if (
      isActive &&
      concurrent.verificationStatus ===
        PayoutDestinationVerificationStatus.REJECTED
    ) {
      throw new PayoutDestinationError(
        "Rejected payout destinations cannot be reactivated.",
        "PAYOUT_DESTINATION_REACTIVATION_REJECTED",
      );
    }
    if (concurrent.isActive === isActive) {
      return { destination: concurrent, changed: false };
    }
    throw new PayoutDestinationError(
      "Payout destination activation changed concurrently. Retry the request.",
      "PAYOUT_DESTINATION_ACTIVATION_CONFLICT",
    );
  }

  serialize(destination: IPayoutDestination): PayoutDestinationResponse {
    return {
      destinationReference: destination.destinationReference,
      type: destination.type,
      verificationStatus: destination.verificationStatus,
      isActive: destination.isActive,
      maskedIdentifier: destination.maskedIdentifier,
      accountNumberLast4: destination.accountNumberLast4,
      ifscDisplay: destination.ifscDisplay,
      verifiedAt: destination.verifiedAt,
      rejectedAt: destination.rejectedAt,
      rejectionReason: destination.rejectionReason,
      deactivatedAt: destination.deactivatedAt,
      reactivatedAt: destination.reactivatedAt,
      createdAt: destination.createdAt,
      updatedAt: destination.updatedAt,
    };
  }

  private normalizeCreateInput(input: CreatePayoutDestinationInput): NormalizedDestination {
    if (!Object.values(PayoutDestinationType).includes(input.type as PayoutDestinationType)) {
      throw new PayoutDestinationError("Invalid payout destination type.", "INVALID_PAYOUT_DESTINATION_TYPE");
    }
    if (typeof input.idempotencyKey !== "string" || !isValidIdempotencyKey(input.idempotencyKey)) {
      throw new PayoutDestinationError("Invalid idempotency key.", "INVALID_PAYOUT_DESTINATION_IDEMPOTENCY_KEY");
    }

    const type = input.type as PayoutDestinationType;
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    if (type === PayoutDestinationType.BANK_ACCOUNT) {
      if (input.upiId !== undefined) {
        throw new PayoutDestinationError("UPI details are not valid for a bank destination.", "INVALID_PAYOUT_DESTINATION_INPUT");
      }
      const accountHolderName = this.normalizeAccountHolderName(input.accountHolderName);
      const accountNumber = this.normalizeAccountNumber(input.accountNumber);
      const ifsc = this.normalizeIfsc(input.ifsc);
      const last4 = accountNumber.slice(-4);
      return {
        type,
        idempotencyKey,
        destinationFingerprint: payoutDestinationCryptoService.createDestinationFingerprint(
          `BANK_ACCOUNT:${accountNumber}:${ifsc}`,
        ),
        requestFingerprint: payoutDestinationCryptoService.createRequestFingerprint(
          `BANK_ACCOUNT:${accountHolderName}:${accountNumber}:${ifsc}`,
        ),
        encryptedPayload: { accountHolderName, accountNumber, ifsc },
        maskedIdentifier: `••••${last4}`,
        accountNumberLast4: last4,
        ifscDisplay: ifsc,
      };
    }

    if (
      input.accountHolderName !== undefined ||
      input.accountNumber !== undefined ||
      input.ifsc !== undefined
    ) {
      throw new PayoutDestinationError("Bank details are not valid for a UPI destination.", "INVALID_PAYOUT_DESTINATION_INPUT");
    }
    const upiId = this.normalizeUpiId(input.upiId);
    return {
      type,
      idempotencyKey,
      destinationFingerprint: payoutDestinationCryptoService.createDestinationFingerprint(`UPI:${upiId}`),
      requestFingerprint: payoutDestinationCryptoService.createRequestFingerprint(`UPI:${upiId}`),
      encryptedPayload: { upiId },
      maskedIdentifier: this.maskUpiId(upiId),
    };
  }

  private validateBindingPayload(
    destination: IPayoutDestination,
    payload: Record<string, string>,
  ): NormalizedWithdrawalDestination {
    const keys = Object.keys(payload).sort();
    try {
      switch (destination.type) {
        case PayoutDestinationType.BANK_ACCOUNT: {
          if (keys.join(",") !== "accountHolderName,accountNumber,ifsc") throw this.integrityError();
          const accountHolderName = this.normalizeAccountHolderName(payload.accountHolderName);
          const accountNumber = this.normalizeAccountNumber(payload.accountNumber);
          const ifsc = this.normalizeIfsc(payload.ifsc);
          if (payload.accountHolderName !== accountHolderName || payload.accountNumber !== accountNumber || payload.ifsc !== ifsc || destination.accountNumberLast4 !== accountNumber.slice(-4) || destination.ifscDisplay !== ifsc || destination.maskedIdentifier !== `••••${accountNumber.slice(-4)}`) throw this.integrityError();
          const expected = payoutDestinationCryptoService.createDestinationFingerprint(`BANK_ACCOUNT:${accountNumber}:${ifsc}`);
          if (!this.fingerprintsEqual(expected, destination.destinationFingerprint)) throw this.integrityError();
          return { type: PayoutDestinationType.BANK_ACCOUNT, accountHolderName, accountNumber, ifsc };
        }
        case PayoutDestinationType.UPI: {
          if (keys.join(",") !== "upiId" || destination.accountNumberLast4 !== undefined || destination.ifscDisplay !== undefined) throw this.integrityError();
          const upiId = this.normalizeUpiId(payload.upiId);
          if (payload.upiId !== upiId || destination.maskedIdentifier !== this.maskUpiId(upiId)) throw this.integrityError();
          const expected = payoutDestinationCryptoService.createDestinationFingerprint(`UPI:${upiId}`);
          if (!this.fingerprintsEqual(expected, destination.destinationFingerprint)) throw this.integrityError();
          return { type: PayoutDestinationType.UPI, upiId };
        }
        default:
          throw this.integrityError();
      }
    } catch (error) {
      if (error instanceof PayoutDestinationError && error.code === "PAYOUT_DESTINATION_INTEGRITY_ERROR") throw error;
      throw this.integrityError();
    }
  }

  private fingerprintsEqual(first: string, second: string): boolean {
    const left = Buffer.from(first, "utf8");
    const right = Buffer.from(second, "utf8");
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  private integrityError(): PayoutDestinationError {
    return new PayoutDestinationError("Payout destination integrity validation failed.", "PAYOUT_DESTINATION_INTEGRITY_ERROR");
  }

  private normalizeAccountHolderName(value: unknown): string {
    if (typeof value !== "string") throw new PayoutDestinationError("Invalid account holder name.", "INVALID_ACCOUNT_HOLDER_NAME");
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!/^[\p{L}][\p{L} .'-]{1,98}$/u.test(normalized)) {
      throw new PayoutDestinationError("Invalid account holder name.", "INVALID_ACCOUNT_HOLDER_NAME");
    }
    return normalized;
  }

  private normalizeAccountNumber(value: unknown): string {
    if (typeof value !== "string") throw new PayoutDestinationError("Invalid bank account number.", "INVALID_ACCOUNT_NUMBER");
    const normalized = value.replace(/[\s-]/g, "");
    if (!/^\d{9,18}$/.test(normalized)) {
      throw new PayoutDestinationError("Invalid bank account number.", "INVALID_ACCOUNT_NUMBER");
    }
    return normalized;
  }

  private normalizeIfsc(value: unknown): string {
    if (typeof value !== "string") throw new PayoutDestinationError("Invalid IFSC.", "INVALID_IFSC");
    const normalized = value.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized)) {
      throw new PayoutDestinationError("Invalid IFSC.", "INVALID_IFSC");
    }
    return normalized;
  }

  private normalizeUpiId(value: unknown): string {
    if (typeof value !== "string") throw new PayoutDestinationError("Invalid UPI ID.", "INVALID_UPI_ID");
    const normalized = value.trim().toLowerCase();
    if (normalized.includes(" ") || !/^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$/.test(normalized)) {
      throw new PayoutDestinationError("Invalid UPI ID.", "INVALID_UPI_ID");
    }
    return normalized;
  }

  private maskUpiId(upiId: string): string {
    const [localPart, handle] = upiId.split("@");
    return `${localPart.charAt(0)}•••${localPart.slice(-1)}@${handle}`;
  }

  private validateCreatorId(creatorId: string): void {
    if (!mongoose.Types.ObjectId.isValid(creatorId)) {
      throw new PayoutDestinationError("Invalid creator identity.", "INVALID_PAYOUT_DESTINATION_CREATOR");
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
  }

  private async resolveCreateRace(
    creatorId: string,
    normalized: NormalizedDestination,
  ): Promise<{ destination: IPayoutDestination; created: boolean }> {
    const byKey = await this.repository.findByCreatorAndIdempotencyKey(creatorId, normalized.idempotencyKey);
    if (byKey) {
      if (byKey.requestFingerprint !== normalized.requestFingerprint) {
        throw new PayoutDestinationError("Idempotency key conflicts with an existing payout destination request.", "PAYOUT_DESTINATION_IDEMPOTENCY_CONFLICT");
      }
      return { destination: byKey, created: false };
    }
    const byDestination = await this.repository.findByCreatorTypeAndDestinationFingerprint(
      creatorId, normalized.type, normalized.destinationFingerprint,
    );
    if (byDestination) return { destination: byDestination, created: false };
    throw new PayoutDestinationError("Unable to create payout destination. Retry the request.", "PAYOUT_DESTINATION_CREATE_CONFLICT");
  }
}

export const payoutDestinationService = new PayoutDestinationService();
