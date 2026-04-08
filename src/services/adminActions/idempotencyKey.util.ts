//backend/src/services/adminActions/idempotencyKey.util.ts


import crypto from "crypto";

/**
 * Phase 25 — Version-aware idempotency key
 *
 * Same admin + same action + same VERSION + same target + same params
 * => same idempotency key
 *
 * Different version => different key (even if everything else matches)
 */
export const createIdempotencyKey = ({
  adminId,
  actionKey,
  actionVersion, // 🕰️ Phase 25
  targetId,
  paramsHash,
}: {
  adminId: string;
  actionKey: string;
  actionVersion: number;
  targetId: string;
  paramsHash: string;
}) => {
  const raw = `${adminId}:${actionKey}:v${actionVersion}:${targetId}:${paramsHash}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
};