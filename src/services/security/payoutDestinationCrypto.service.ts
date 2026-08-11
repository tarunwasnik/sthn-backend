import crypto from "crypto";

import { PayoutDestinationError } from "../../errors/financial/PayoutDestinationError";
import { PayoutDestinationType } from "../../enums/financial/payoutDestinationType.enum";
import type { EncryptedWithdrawalDestinationSnapshotPayload } from "../../types/financial/withdrawalDestinationSnapshot.type";

export interface EncryptedPayoutDestinationPayload {
  version: 1;
  ciphertext: string;
  iv: string;
  authTag: string;
}

interface DestinationCryptoKeys {
  encryptionKey: Buffer;
  fingerprintKey: Buffer;
}

export interface WithdrawalDestinationSnapshotContext {
  withdrawalReference: string;
  creatorId: string;
  destinationReference: string;
  destinationType: PayoutDestinationType;
  snapshotVersion: 1;
}

export interface InternalPayoutDestinationContext {
  financialPayoutId: string;
  providerPayoutId: string;
  withdrawalReference: string;
  destinationReference: string;
  destinationType: PayoutDestinationType;
}

/** Narrow, fail-closed cryptography boundary for payout destination data. */
export class PayoutDestinationCryptoService {
  private keys?: DestinationCryptoKeys;

  encryptDestinationPayload(
    payload: Record<string, string>,
  ): EncryptedPayoutDestinationPayload {
    const { encryptionKey } = this.getKeys();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);

    return {
      version: 1,
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  decryptDestinationPayload(
    payload: EncryptedPayoutDestinationPayload,
  ): Record<string, string> {
    if (payload.version !== 1) {
      throw new PayoutDestinationError(
        "Payout destination encryption version is unsupported.",
        "PAYOUT_DESTINATION_ENCRYPTION_VERSION_UNSUPPORTED",
      );
    }

    try {
      const { encryptionKey } = this.getKeys();
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        Buffer.from(payload.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
      const decoded: unknown = JSON.parse(plaintext);

      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        throw new Error("Invalid destination payload.");
      }

      return decoded as Record<string, string>;
    } catch {
      throw new PayoutDestinationError(
        "Payout destination data could not be decrypted.",
        "PAYOUT_DESTINATION_DECRYPTION_FAILED",
      );
    }
  }

  createDestinationFingerprint(canonicalIdentity: string): string {
    return this.hmac(canonicalIdentity);
  }

  createRequestFingerprint(canonicalRequest: string): string {
    return this.hmac(canonicalRequest);
  }

  encryptWithdrawalDestinationSnapshotPayload(
    payload: Record<string, string>,
    context: WithdrawalDestinationSnapshotContext,
  ): EncryptedWithdrawalDestinationSnapshotPayload {
    const iv = crypto.randomBytes(12);
    const key = this.deriveWithdrawalSnapshotKey();
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(this.buildWithdrawalSnapshotAAD(context));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return { version: 1, ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
  }

  decryptWithdrawalDestinationSnapshotPayload(
    payload: EncryptedWithdrawalDestinationSnapshotPayload,
    context: WithdrawalDestinationSnapshotContext,
  ): Record<string, unknown> {
    if (payload.version !== 1) {
      throw new PayoutDestinationError(
        "Withdrawal destination snapshot encryption version is unsupported.",
        "WITHDRAWAL_DESTINATION_SNAPSHOT_ENCRYPTION_VERSION_UNSUPPORTED",
      );
    }

    try {
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        this.deriveWithdrawalSnapshotKey(),
        Buffer.from(payload.iv, "base64"),
      );
      decipher.setAAD(this.buildWithdrawalSnapshotAAD(context));
      decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
      const decoded: unknown = JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(payload.ciphertext, "base64")),
          decipher.final(),
        ]).toString("utf8"),
      );

      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        throw new Error("Invalid withdrawal snapshot payload.");
      }

      return decoded as Record<string, unknown>;
    } catch {
      throw new PayoutDestinationError(
        "Withdrawal destination snapshot could not be decrypted.",
        "WITHDRAWAL_DESTINATION_SNAPSHOT_DECRYPTION_FAILED",
      );
    }
  }

  encryptInternalPayoutDestinationPayload(
    payload: Record<string, string>,
    context: InternalPayoutDestinationContext,
  ): EncryptedPayoutDestinationPayload {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      this.deriveInternalPayoutDestinationEncryptionKey(),
      iv,
    );
    cipher.setAAD(this.buildInternalPayoutDestinationAAD(context));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    return {
      version: 1,
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  createInternalPayoutDestinationFingerprint(canonicalInput: string): string {
    const key = Buffer.from(
      crypto.hkdfSync(
        "sha256",
        this.getKeys().fingerprintKey,
        Buffer.alloc(0),
        Buffer.from("STHN:INTERNAL_PROVIDER_PAYOUT_DESTINATION_FINGERPRINT:v1", "utf8"),
        32,
      ),
    );
    return crypto.createHmac("sha256", key).update(canonicalInput, "utf8").digest("hex");
  }

  private deriveWithdrawalSnapshotKey(): Buffer {
    return Buffer.from(
      crypto.hkdfSync(
        "sha256",
        this.getKeys().encryptionKey,
        Buffer.alloc(0),
        Buffer.from("STHN:WITHDRAWAL_DESTINATION_SNAPSHOT:v1", "utf8"),
        32,
      ),
    );
  }

  private deriveInternalPayoutDestinationEncryptionKey(): Buffer {
    return Buffer.from(
      crypto.hkdfSync(
        "sha256",
        this.getKeys().encryptionKey,
        Buffer.alloc(0),
        Buffer.from("STHN:INTERNAL_PROVIDER_PAYOUT_DESTINATION_ENCRYPTION:v1", "utf8"),
        32,
      ),
    );
  }

  private buildWithdrawalSnapshotAAD(
    context: WithdrawalDestinationSnapshotContext,
  ): Buffer {
    return Buffer.from(
      JSON.stringify({
        purpose: "STHN:WITHDRAWAL_DESTINATION_SNAPSHOT",
        encryptionVersion: 1,
        snapshotVersion: context.snapshotVersion,
        withdrawalReference: context.withdrawalReference,
        creatorId: context.creatorId,
        destinationReference: context.destinationReference,
        destinationType: context.destinationType,
      }),
      "utf8",
    );
  }

  private buildInternalPayoutDestinationAAD(
    context: InternalPayoutDestinationContext,
  ): Buffer {
    return Buffer.from(
      JSON.stringify({
        purpose: "STHN:INTERNAL_PROVIDER_PAYOUT_DESTINATION",
        encryptionVersion: 1,
        destinationVersion: 1,
        financialPayoutId: context.financialPayoutId,
        providerPayoutId: context.providerPayoutId,
        withdrawalReference: context.withdrawalReference,
        destinationReference: context.destinationReference,
        destinationType: context.destinationType,
      }),
      "utf8",
    );
  }

  private hmac(value: string): string {
    return crypto
      .createHmac("sha256", this.getKeys().fingerprintKey)
      .update(value, "utf8")
      .digest("hex");
  }

  private getKeys(): DestinationCryptoKeys {
    if (this.keys) {
      return this.keys;
    }

    const encryptionKey = this.readBase64Key(
      "PAYOUT_DESTINATION_ENCRYPTION_KEY",
      32,
      true,
    );
    const fingerprintKey = this.readBase64Key(
      "PAYOUT_DESTINATION_FINGERPRINT_KEY",
      32,
      false,
    );

    this.keys = { encryptionKey, fingerprintKey };
    return this.keys;
  }

  private readBase64Key(
    name: string,
    minimumBytes: number,
    exactLength: boolean,
  ): Buffer {
    const value = process.env[name];
    if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
      throw new PayoutDestinationError(
        "Payout destination encryption configuration is unavailable.",
        "PAYOUT_DESTINATION_CRYPTO_CONFIGURATION_INVALID",
      );
    }

    const key = Buffer.from(value, "base64");
    if ((exactLength && key.length !== minimumBytes) || (!exactLength && key.length < minimumBytes)) {
      throw new PayoutDestinationError(
        "Payout destination encryption configuration is unavailable.",
        "PAYOUT_DESTINATION_CRYPTO_CONFIGURATION_INVALID",
      );
    }

    return key;
  }
}

export const payoutDestinationCryptoService = new PayoutDestinationCryptoService();
