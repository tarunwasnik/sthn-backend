import bcrypt from "bcryptjs";

import { AppError } from "../../utils/AppError";

export const PASSWORD_MIN_LENGTH = 9;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MAX_BCRYPT_BYTES = 72;

const commonPasswords = new Set([
  "passwordpassword",
  "123456789012",
  "qwertyuiop123",
  "letmeinletmein",
  "welcome123456",
]);

export type PasswordPolicyFailureCode =
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_MISSING_UPPERCASE"
  | "PASSWORD_MISSING_LOWERCASE"
  | "PASSWORD_MISSING_NUMBER"
  | "PASSWORD_MISSING_SPECIAL"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_BCRYPT_BYTE_LIMIT"
  | "PASSWORD_COMMON";

const failures: Record<PasswordPolicyFailureCode, string> = {
  PASSWORD_TOO_SHORT: "Password must be at least 9 characters.",
  PASSWORD_MISSING_UPPERCASE: "Password must include an uppercase letter (A–Z).",
  PASSWORD_MISSING_LOWERCASE: "Password must include a lowercase letter (a–z).",
  PASSWORD_MISSING_NUMBER: "Password must include a number (0–9).",
  PASSWORD_MISSING_SPECIAL: "Password must include a special character.",
  PASSWORD_TOO_LONG: "Password exceeds the supported maximum length.",
  PASSWORD_BCRYPT_BYTE_LIMIT: "Password exceeds the supported byte length.",
  PASSWORD_COMMON: "Choose a less commonly used password.",
};

const reject = (code: PasswordPolicyFailureCode): never => {
  throw new AppError(failures[code], 400, code);
};

/**
 * Creation/change-time policy only. Login intentionally continues to verify
 * legacy hashes without applying this policy.
 */
export const validateNewPassword = (value: unknown): string => {
  if (typeof value !== "string") return reject("PASSWORD_TOO_SHORT");
  const password = value;
  if (password.length < PASSWORD_MIN_LENGTH) reject("PASSWORD_TOO_SHORT");
  if (password.length > PASSWORD_MAX_LENGTH) reject("PASSWORD_TOO_LONG");
  if (bcrypt.truncates(password) || Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BCRYPT_BYTES) {
    reject("PASSWORD_BCRYPT_BYTE_LIMIT");
  }
  if (commonPasswords.has(password.toLowerCase())) reject("PASSWORD_COMMON");
  if (!/[A-Z]/.test(password)) reject("PASSWORD_MISSING_UPPERCASE");
  if (!/[a-z]/.test(password)) reject("PASSWORD_MISSING_LOWERCASE");
  if (!/[0-9]/.test(password)) reject("PASSWORD_MISSING_NUMBER");
  // Any non-alphanumeric, non-space symbol is accepted; passwords are never transformed.
  if (!/[^A-Za-z0-9\s]/.test(password)) reject("PASSWORD_MISSING_SPECIAL");
  return password;
};
