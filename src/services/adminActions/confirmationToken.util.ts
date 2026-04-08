//backend/src/services/adminActions/confirmationToken.util.ts


import crypto from "crypto";

/**
 * Phase 25 — Version-aware confirmation token
 */
type ConfirmationTokenPayload = {
  adminId: string;
  actionKey: string;
  actionVersion: number; // 🕰️ Phase 25
  targetId: string;
  paramsHash: string;
  expiresAt: number; // epoch ms
};

const TOKEN_SECRET =
  process.env.ADMIN_CONFIRMATION_SECRET || "dev-secret";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// -----------------------------
// Helpers
// -----------------------------
const base64url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const sign = (data: string) =>
  base64url(
    crypto.createHmac("sha256", TOKEN_SECRET).update(data).digest()
  );

export const hashParams = (params: Record<string, any>) => {
  const stable = JSON.stringify(params, Object.keys(params).sort());
  return crypto.createHash("sha256").update(stable).digest("hex");
};

// -----------------------------
// Create token (dry run)
// -----------------------------
export const createConfirmationToken = ({
  adminId,
  actionKey,
  actionVersion,
  targetId,
  paramsHash,
  ttlMs = DEFAULT_TTL_MS,
}: {
  adminId: string;
  actionKey: string;
  actionVersion: number; // 🕰️ Phase 25
  targetId: string;
  paramsHash: string;
  ttlMs?: number;
}) => {
  const payload: ConfirmationTokenPayload = {
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

// -----------------------------
// Verify token (execution)
// -----------------------------
export const verifyConfirmationToken = ({
  token,
  adminId,
  actionKey,
  actionVersion,
  targetId,
  paramsHash,
}: {
  token: string;
  adminId: string;
  actionKey: string;
  actionVersion: number; // 🕰️ Phase 25
  targetId: string;
  paramsHash: string;
}) => {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid confirmation token format");
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = sign(encodedPayload);

  if (signature !== expectedSignature) {
    throw new Error("Invalid confirmation token signature");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64").toString()
  ) as ConfirmationTokenPayload;

  if (Date.now() > payload.expiresAt) {
    throw new Error("Confirmation token has expired");
  }

  if (
    payload.adminId !== adminId ||
    payload.actionKey !== actionKey ||
    payload.actionVersion !== actionVersion || // 🔐 version check
    payload.targetId !== targetId ||
    payload.paramsHash !== paramsHash
  ) {
    throw new Error("Confirmation token does not match action intent");
  }

  return true;
};