"use strict";
//backend/src/services/adminActions/confirmationToken.util.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyConfirmationToken = exports.createConfirmationToken = exports.hashParams = void 0;
const crypto_1 = __importDefault(require("crypto"));
const TOKEN_SECRET = process.env.ADMIN_CONFIRMATION_SECRET || "dev-secret";
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
// -----------------------------
// Helpers
// -----------------------------
const base64url = (input) => Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const sign = (data) => base64url(crypto_1.default.createHmac("sha256", TOKEN_SECRET).update(data).digest());
const hashParams = (params) => {
    const stable = JSON.stringify(params, Object.keys(params).sort());
    return crypto_1.default.createHash("sha256").update(stable).digest("hex");
};
exports.hashParams = hashParams;
// -----------------------------
// Create token (dry run)
// -----------------------------
const createConfirmationToken = ({ adminId, actionKey, actionVersion, targetId, paramsHash, ttlMs = DEFAULT_TTL_MS, }) => {
    const payload = {
        adminId,
        actionKey,
        actionVersion,
        targetId,
        paramsHash,
        expiresAt: Date.now() + ttlMs,
    };
    const encodedPayload = base64url(JSON.stringify(payload));
    const signature = sign(encodedPayload);
    return `${encodedPayload}.${signature}`;
};
exports.createConfirmationToken = createConfirmationToken;
// -----------------------------
// Verify token (execution)
// -----------------------------
const verifyConfirmationToken = ({ token, adminId, actionKey, actionVersion, targetId, paramsHash, }) => {
    const parts = token.split(".");
    if (parts.length !== 2) {
        throw new Error("Invalid confirmation token format");
    }
    const [encodedPayload, signature] = parts;
    const expectedSignature = sign(encodedPayload);
    if (signature !== expectedSignature) {
        throw new Error("Invalid confirmation token signature");
    }
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64").toString());
    if (Date.now() > payload.expiresAt) {
        throw new Error("Confirmation token has expired");
    }
    if (payload.adminId !== adminId ||
        payload.actionKey !== actionKey ||
        payload.actionVersion !== actionVersion || // 🔐 version check
        payload.targetId !== targetId ||
        payload.paramsHash !== paramsHash) {
        throw new Error("Confirmation token does not match action intent");
    }
    return true;
};
exports.verifyConfirmationToken = verifyConfirmationToken;
