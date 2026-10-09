import crypto from "node:crypto";

import { AppError } from "../../utils/AppError";
import { TextModerationDomain } from "./textModeration.types";

const ADMISSION_TTL_SECONDS = 15 * 60;
const TOKEN_VERSION = 1;

interface AdmissionClaims {
  v: number;
  domain: TextModerationDomain;
  userId: string;
  fingerprint: string;
  issuedAt: number;
  expiresAt: number;
}

const secret = (): string | null => {
  const configured = process.env.TEXT_MODERATION_ADMISSION_SECRET?.trim();
  return configured && configured.length >= 32 ? configured : null;
};

const signature = (body: string, key: string) =>
  crypto.createHmac("sha256", key).update(body, "utf8").digest("base64url");

export const issueTextModerationAdmission = (
  domain: TextModerationDomain,
  userId: string,
  fingerprint: string,
): string | null => {
  const key = secret();
  if (!key) return null;
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: AdmissionClaims = {
    v: TOKEN_VERSION,
    domain,
    userId,
    fingerprint,
    issuedAt,
    expiresAt: issuedAt + ADMISSION_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${body}.${signature(body, key)}`;
};

export const requireTextModerationAdmission = (input: {
  token: unknown;
  domain: TextModerationDomain;
  userId: string;
  fingerprint: string;
}) => {
  const key = secret();
  if (!key) {
    throw new AppError("Text moderation is temporarily unavailable. Please try again later.", 503, "TEXT_MODERATION_UNAVAILABLE");
  }
  if (typeof input.token !== "string") {
    throw new AppError("Please check your profile text before submitting.", 409, "TEXT_MODERATION_ADMISSION_REQUIRED");
  }
  const [body, providedSignature, extra] = input.token.split(".");
  if (!body || !providedSignature || extra) {
    throw new AppError("Text moderation approval is invalid or expired.", 409, "TEXT_MODERATION_ADMISSION_INVALID");
  }
  const expected = Buffer.from(signature(body, key));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    throw new AppError("Text moderation approval is invalid or expired.", 409, "TEXT_MODERATION_ADMISSION_INVALID");
  }
  let claims: AdmissionClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdmissionClaims;
  } catch {
    throw new AppError("Text moderation approval is invalid or expired.", 409, "TEXT_MODERATION_ADMISSION_INVALID");
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    claims.v !== TOKEN_VERSION ||
    claims.domain !== input.domain ||
    claims.userId !== input.userId ||
    claims.fingerprint !== input.fingerprint ||
    !Number.isInteger(claims.issuedAt) ||
    !Number.isInteger(claims.expiresAt) ||
    claims.issuedAt > now + 30 ||
    claims.expiresAt < now
  ) {
    throw new AppError("Text changed after its moderation check. Please check it again.", 409, "TEXT_MODERATION_ADMISSION_MISMATCH");
  }
};
