import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "../../utils/AppError";
import { validateNewPassword } from "../../services/auth/passwordPolicy.service";

const expectFailure = (value: unknown, code: string) => {
  assert.throws(() => validateNewPassword(value), (error: unknown) => error instanceof AppError && error.code === code);
};

test("password policy accepts compliant passwords without mutation", () => {
  const password = "A 1!bcdef";
  assert.equal(validateNewPassword(password), password);
  assert.equal(validateNewPassword("!a1Bcdefg"), "!a1Bcdefg");
});

test("password policy rejects missing requirements and blocked passwords", () => {
  expectFailure("Aa1!bcde", "PASSWORD_TOO_SHORT");
  expectFailure("aa1!bcdef", "PASSWORD_MISSING_UPPERCASE");
  expectFailure("AA1!BCDEF", "PASSWORD_MISSING_LOWERCASE");
  expectFailure("Aa!bcdefg", "PASSWORD_MISSING_NUMBER");
  expectFailure("Aa1bcdefg", "PASSWORD_MISSING_SPECIAL");
  expectFailure("passwordpassword", "PASSWORD_COMMON");
  expectFailure(null, "PASSWORD_TOO_SHORT");
});

test("password policy enforces character, product, and bcrypt byte limits", () => {
  assert.equal(validateNewPassword(`Aa1!${"x".repeat(68)}`).length, 72);
  expectFailure(`Aa1!${"x".repeat(69)}`, "PASSWORD_BCRYPT_BYTE_LIMIT");
  expectFailure(`Aa1!${"é".repeat(35)}`, "PASSWORD_BCRYPT_BYTE_LIMIT");
  expectFailure(`Aa1!${"x".repeat(125)}`, "PASSWORD_TOO_LONG");
});
