import mongoose from "mongoose";

import {
  PayoutExecutionDestinationCommand,
} from "../../contracts/financial/payoutProvider.types";
import { PayoutDestinationType } from "../../enums/financial/payoutDestinationType.enum";
import { PayoutDestinationVerificationStatus } from "../../enums/financial/payoutDestinationVerificationStatus.enum";
import { WithdrawalError } from "../../errors/financial/WithdrawalError";
import { withdrawalRepository } from "../../repositories/withdrawal.repository";
import { IWithdrawalDestinationSnapshot } from "../../types/financial/withdrawalDestinationSnapshot.type";
import { payoutDestinationCryptoService } from "../security/payoutDestinationCrypto.service";

/** Narrow boundary which turns an immutable withdrawal snapshot into a transient provider command. */
export class WithdrawalDestinationExecutionService {
  constructor(private readonly withdrawals = withdrawalRepository) {}

  async getExecutionDestination(
    withdrawalId: string,
  ): Promise<PayoutExecutionDestinationCommand> {
    if (!mongoose.Types.ObjectId.isValid(withdrawalId)) {
      throw new WithdrawalError(
        "Withdrawal destination snapshot is unavailable.",
        "WITHDRAWAL_DESTINATION_SNAPSHOT_REQUIRED",
      );
    }

    const withdrawal = await this.withdrawals.findByIdForPayoutExecution(withdrawalId);
    const snapshot = withdrawal?.destinationSnapshot;
    if (!withdrawal || !withdrawal.payoutDestinationId || !snapshot) {
      throw new WithdrawalError(
        "Withdrawal destination snapshot is required for payout execution.",
        "WITHDRAWAL_DESTINATION_SNAPSHOT_REQUIRED",
      );
    }

    if (
      snapshot.version !== 1 ||
      snapshot.verificationStatus !== PayoutDestinationVerificationStatus.VERIFIED ||
      !snapshot.verifiedAt ||
      !snapshot.encryptedPayload
    ) {
      throw this.integrityError();
    }

    let payload: Record<string, unknown>;
    try {
      payload = payoutDestinationCryptoService.decryptWithdrawalDestinationSnapshotPayload(
        snapshot.encryptedPayload,
        {
          withdrawalReference: withdrawal.withdrawalReference,
          creatorId: withdrawal.creatorId.toHexString(),
          destinationReference: snapshot.destinationReference,
          destinationType: snapshot.type,
          snapshotVersion: snapshot.version,
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "WITHDRAWAL_DESTINATION_SNAPSHOT_ENCRYPTION_VERSION_UNSUPPORTED"
      ) {
        throw error;
      }
      throw this.integrityError();
    }

    return this.validateSnapshot(snapshot, payload);
  }

  private validateSnapshot(
    snapshot: IWithdrawalDestinationSnapshot,
    payload: Record<string, unknown>,
  ): PayoutExecutionDestinationCommand {
    try {
      if (snapshot.type === PayoutDestinationType.BANK_ACCOUNT) {
        if (Object.keys(payload).sort().join(",") !== "accountHolderName,accountNumber,ifsc") {
          throw this.integrityError();
        }
        const accountHolderName = this.normalizeAccountHolderName(payload.accountHolderName);
        const accountNumber = this.normalizeAccountNumber(payload.accountNumber);
        const ifsc = this.normalizeIfsc(payload.ifsc);
        const last4 = accountNumber.slice(-4);
        if (
          payload.accountHolderName !== accountHolderName ||
          payload.accountNumber !== accountNumber ||
          payload.ifsc !== ifsc ||
          snapshot.accountNumberLast4 !== last4 ||
          snapshot.ifscDisplay !== ifsc ||
          snapshot.maskedIdentifier !== `••••${last4}`
        ) {
          throw this.integrityError();
        }
        return {
          snapshotVersion: 1,
          destinationReference: snapshot.destinationReference,
          type: PayoutDestinationType.BANK_ACCOUNT,
          maskedIdentifier: snapshot.maskedIdentifier,
          accountNumberLast4: last4,
          ifscDisplay: ifsc,
          executionDestination: {
            type: PayoutDestinationType.BANK_ACCOUNT,
            accountHolderName,
            accountNumber,
            ifsc,
          },
        };
      }

      if (snapshot.type === PayoutDestinationType.UPI) {
        if (
          Object.keys(payload).join(",") !== "upiId" ||
          snapshot.accountNumberLast4 !== undefined ||
          snapshot.ifscDisplay !== undefined
        ) {
          throw this.integrityError();
        }
        const upiId = this.normalizeUpiId(payload.upiId);
        if (payload.upiId !== upiId || snapshot.maskedIdentifier !== this.maskUpiId(upiId)) {
          throw this.integrityError();
        }
        return {
          snapshotVersion: 1,
          destinationReference: snapshot.destinationReference,
          type: PayoutDestinationType.UPI,
          maskedIdentifier: snapshot.maskedIdentifier,
          executionDestination: { type: PayoutDestinationType.UPI, upiId },
        };
      }
    } catch (error) {
      if (error instanceof WithdrawalError) throw error;
    }
    throw this.integrityError();
  }

  private normalizeAccountHolderName(value: unknown): string {
    if (typeof value !== "string") throw this.integrityError();
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!/^[\p{L}][\p{L} .'-]{1,98}$/u.test(normalized)) throw this.integrityError();
    return normalized;
  }

  private normalizeAccountNumber(value: unknown): string {
    if (typeof value !== "string") throw this.integrityError();
    const normalized = value.replace(/[\s-]/g, "");
    if (!/^\d{9,18}$/.test(normalized)) throw this.integrityError();
    return normalized;
  }

  private normalizeIfsc(value: unknown): string {
    if (typeof value !== "string") throw this.integrityError();
    const normalized = value.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(normalized)) throw this.integrityError();
    return normalized;
  }

  private normalizeUpiId(value: unknown): string {
    if (typeof value !== "string") throw this.integrityError();
    const normalized = value.trim().toLowerCase();
    if (normalized.includes(" ") || !/^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9][a-z0-9.-]{1,63}$/.test(normalized)) {
      throw this.integrityError();
    }
    return normalized;
  }

  private maskUpiId(upiId: string): string {
    const [localPart, handle] = upiId.split("@");
    return `${localPart.charAt(0)}•••${localPart.slice(-1)}@${handle}`;
  }

  private integrityError(): WithdrawalError {
    return new WithdrawalError(
      "Withdrawal destination snapshot integrity validation failed.",
      "WITHDRAWAL_DESTINATION_SNAPSHOT_INTEGRITY_ERROR",
    );
  }
}

export const withdrawalDestinationExecutionService =
  new WithdrawalDestinationExecutionService();
