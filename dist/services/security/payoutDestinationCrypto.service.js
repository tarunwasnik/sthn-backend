"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutDestinationCryptoService = exports.PayoutDestinationCryptoService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const PayoutDestinationError_1 = require("../../errors/financial/PayoutDestinationError");
/** Narrow, fail-closed cryptography boundary for payout destination data. */
class PayoutDestinationCryptoService {
    encryptDestinationPayload(payload) {
        const { encryptionKey } = this.getKeys();
        const iv = crypto_1.default.randomBytes(12);
        const cipher = crypto_1.default.createCipheriv("aes-256-gcm", encryptionKey, iv);
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
    decryptDestinationPayload(payload) {
        if (payload.version !== 1) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination encryption version is unsupported.", "PAYOUT_DESTINATION_ENCRYPTION_VERSION_UNSUPPORTED");
        }
        try {
            const { encryptionKey } = this.getKeys();
            const decipher = crypto_1.default.createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(payload.iv, "base64"));
            decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
            const plaintext = Buffer.concat([
                decipher.update(Buffer.from(payload.ciphertext, "base64")),
                decipher.final(),
            ]).toString("utf8");
            const decoded = JSON.parse(plaintext);
            if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
                throw new Error("Invalid destination payload.");
            }
            return decoded;
        }
        catch {
            throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination data could not be decrypted.", "PAYOUT_DESTINATION_DECRYPTION_FAILED");
        }
    }
    createDestinationFingerprint(canonicalIdentity) {
        return this.hmac(canonicalIdentity);
    }
    createRequestFingerprint(canonicalRequest) {
        return this.hmac(canonicalRequest);
    }
    encryptWithdrawalDestinationSnapshotPayload(payload, context) {
        const iv = crypto_1.default.randomBytes(12);
        const key = this.deriveWithdrawalSnapshotKey();
        const cipher = crypto_1.default.createCipheriv("aes-256-gcm", key, iv);
        cipher.setAAD(this.buildWithdrawalSnapshotAAD(context));
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
        return { version: 1, ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
    }
    decryptWithdrawalDestinationSnapshotPayload(payload, context) {
        if (payload.version !== 1) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Withdrawal destination snapshot encryption version is unsupported.", "WITHDRAWAL_DESTINATION_SNAPSHOT_ENCRYPTION_VERSION_UNSUPPORTED");
        }
        try {
            const decipher = crypto_1.default.createDecipheriv("aes-256-gcm", this.deriveWithdrawalSnapshotKey(), Buffer.from(payload.iv, "base64"));
            decipher.setAAD(this.buildWithdrawalSnapshotAAD(context));
            decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
            const decoded = JSON.parse(Buffer.concat([
                decipher.update(Buffer.from(payload.ciphertext, "base64")),
                decipher.final(),
            ]).toString("utf8"));
            if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
                throw new Error("Invalid withdrawal snapshot payload.");
            }
            return decoded;
        }
        catch {
            throw new PayoutDestinationError_1.PayoutDestinationError("Withdrawal destination snapshot could not be decrypted.", "WITHDRAWAL_DESTINATION_SNAPSHOT_DECRYPTION_FAILED");
        }
    }
    encryptInternalPayoutDestinationPayload(payload, context) {
        const iv = crypto_1.default.randomBytes(12);
        const cipher = crypto_1.default.createCipheriv("aes-256-gcm", this.deriveInternalPayoutDestinationEncryptionKey(), iv);
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
    createInternalPayoutDestinationFingerprint(canonicalInput) {
        const key = Buffer.from(crypto_1.default.hkdfSync("sha256", this.getKeys().fingerprintKey, Buffer.alloc(0), Buffer.from("STHN:INTERNAL_PROVIDER_PAYOUT_DESTINATION_FINGERPRINT:v1", "utf8"), 32));
        return crypto_1.default.createHmac("sha256", key).update(canonicalInput, "utf8").digest("hex");
    }
    deriveWithdrawalSnapshotKey() {
        return Buffer.from(crypto_1.default.hkdfSync("sha256", this.getKeys().encryptionKey, Buffer.alloc(0), Buffer.from("STHN:WITHDRAWAL_DESTINATION_SNAPSHOT:v1", "utf8"), 32));
    }
    deriveInternalPayoutDestinationEncryptionKey() {
        return Buffer.from(crypto_1.default.hkdfSync("sha256", this.getKeys().encryptionKey, Buffer.alloc(0), Buffer.from("STHN:INTERNAL_PROVIDER_PAYOUT_DESTINATION_ENCRYPTION:v1", "utf8"), 32));
    }
    buildWithdrawalSnapshotAAD(context) {
        return Buffer.from(JSON.stringify({
            purpose: "STHN:WITHDRAWAL_DESTINATION_SNAPSHOT",
            encryptionVersion: 1,
            snapshotVersion: context.snapshotVersion,
            withdrawalReference: context.withdrawalReference,
            creatorId: context.creatorId,
            destinationReference: context.destinationReference,
            destinationType: context.destinationType,
        }), "utf8");
    }
    buildInternalPayoutDestinationAAD(context) {
        return Buffer.from(JSON.stringify({
            purpose: "STHN:INTERNAL_PROVIDER_PAYOUT_DESTINATION",
            encryptionVersion: 1,
            destinationVersion: 1,
            financialPayoutId: context.financialPayoutId,
            providerPayoutId: context.providerPayoutId,
            withdrawalReference: context.withdrawalReference,
            destinationReference: context.destinationReference,
            destinationType: context.destinationType,
        }), "utf8");
    }
    hmac(value) {
        return crypto_1.default
            .createHmac("sha256", this.getKeys().fingerprintKey)
            .update(value, "utf8")
            .digest("hex");
    }
    getKeys() {
        if (this.keys) {
            return this.keys;
        }
        const encryptionKey = this.readBase64Key("PAYOUT_DESTINATION_ENCRYPTION_KEY", 32, true);
        const fingerprintKey = this.readBase64Key("PAYOUT_DESTINATION_FINGERPRINT_KEY", 32, false);
        this.keys = { encryptionKey, fingerprintKey };
        return this.keys;
    }
    readBase64Key(name, minimumBytes, exactLength) {
        const value = process.env[name];
        if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination encryption configuration is unavailable.", "PAYOUT_DESTINATION_CRYPTO_CONFIGURATION_INVALID");
        }
        const key = Buffer.from(value, "base64");
        if ((exactLength && key.length !== minimumBytes) || (!exactLength && key.length < minimumBytes)) {
            throw new PayoutDestinationError_1.PayoutDestinationError("Payout destination encryption configuration is unavailable.", "PAYOUT_DESTINATION_CRYPTO_CONFIGURATION_INVALID");
        }
        return key;
    }
}
exports.PayoutDestinationCryptoService = PayoutDestinationCryptoService;
exports.payoutDestinationCryptoService = new PayoutDestinationCryptoService();
