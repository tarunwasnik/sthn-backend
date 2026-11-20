import assert from "node:assert/strict";
import crypto from "crypto";
import { afterEach, test } from "node:test";
import { AppError } from "../../utils/AppError";
import { clearBreachedPasswordCacheForTests, createBreachedPasswordChecker } from "../../services/auth/breachedPassword.service";

afterEach(clearBreachedPasswordCacheForTests);

const digest = (password: string) => crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();

test("sends only the five-character SHA-1 prefix and rejects an exact breached suffix", async () => {
  const password = "Breached Password!1";
  const hash = digest(password);
  let received = "";
  const check = createBreachedPasswordChecker(async (prefix) => { received = prefix; return `${hash.slice(5).toLowerCase()}:42\r\n`; });
  await assert.rejects(() => check(password), (error: unknown) => error instanceof AppError && error.code === "PASSWORD_BREACHED");
  assert.equal(received, hash.slice(0, 5));
  assert.equal(received.includes(password), false);
  assert.equal(received.includes(hash.slice(5)), false);
});

test("accepts an absent exact suffix but not a partial match", async () => {
  const password = "Clean Password!1";
  const hash = digest(password);
  const check = createBreachedPasswordChecker(async () => `${hash.slice(5, -1)}0:5\n`);
  await check(password);
});

test("treats malformed responses and provider failures as retryable safety failures", async () => {
  const malformed = createBreachedPasswordChecker(async () => "not-a-range-response");
  const unavailable = createBreachedPasswordChecker(async () => { throw new Error("network unavailable"); });
  for (const check of [malformed, unavailable]) {
    await assert.rejects(() => check("Clean Password!1"), (error: unknown) => error instanceof AppError && error.statusCode === 503 && error.code === "PASSWORD_SAFETY_UNAVAILABLE");
  }
});

test("permits an empty valid range response", async () => {
  await createBreachedPasswordChecker(async () => "")("Clean Password!1");
});
