import assert from "node:assert/strict";
import test from "node:test";

import { validateDisplayTimeZone } from "../../controllers/accountPreference.controller";
import { AccountPreference } from "../../models/accountPreference.model";

test("account preferences use one record per user and default to browser time zone", () => {
  const indexes = AccountPreference.schema.indexes() as Array<[Record<string, number>, { unique?: boolean }]>;
  assert.ok(indexes.some(([keys, options]) => keys.userId === 1 && options.unique === true));
  const preference = new AccountPreference({ userId: "507f1f77bcf86cd799439011" });
  assert.equal(preference.displayTimeZone, null);
  assert.equal(preference.validateSync(), undefined);
});

test("display time zone validation accepts IANA zones and browser-default null only", () => {
  assert.equal(validateDisplayTimeZone("Asia/Kolkata"), "Asia/Kolkata");
  assert.equal(validateDisplayTimeZone(null), null);
  assert.throws(() => validateDisplayTimeZone("not/a-zone"), { code: "INVALID_ACCOUNT_PREFERENCE" });
  assert.throws(() => validateDisplayTimeZone(""), { code: "INVALID_ACCOUNT_PREFERENCE" });
});
