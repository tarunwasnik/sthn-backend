import assert from "node:assert/strict";
import { test } from "node:test";

import { creatorServiceMajorToMinor } from "../../../utils/financial/creatorServicePrice.util";

export const registerCreatorServicePriceTests = () => {
  test("creator service price converts USD major-unit values to the identical minor-unit money", () => {
    assert.equal(creatorServiceMajorToMinor(1000, "USD"), 100_000);
    assert.equal(creatorServiceMajorToMinor(1100.99, "USD"), 110_099);
    assert.equal(creatorServiceMajorToMinor(12.34, "USD"), 1_234);
    assert.equal(creatorServiceMajorToMinor(14331, "USD"), 1_433_100);
  });

  test("creator service price rejects invalid and excess-precision USD values", () => {
    for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 12.345, 1100.999]) {
      assert.throws(() => creatorServiceMajorToMinor(price, "USD"));
    }
  });
};
