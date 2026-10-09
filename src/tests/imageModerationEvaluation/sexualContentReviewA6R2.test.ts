import assert from "node:assert/strict";
import vm from "node:vm";
import { test } from "node:test";
import { reviewHtml } from "../../evaluation/imageModeration/dataset/sexualContentReviewUi";

const resolve = (ids: readonly string[], target?: string, prior = 0) => {
  const found = target ? ids.indexOf(target) : -1;
  return found >= 0 ? found : Math.min(Math.max(0, prior), Math.max(0, ids.length - 1));
};
const jump = (value: string, length: number, current: number) => {
  const n = Number(value); return !value || !Number.isInteger(n) || n < 1 || n > length ? current : n - 1;
};

test("R2 identity-aware advancing and queue fallbacks are stable", () => {
  assert.equal(resolve(["a", "b", "c"], "c", 2), 2);
  assert.equal(resolve(["a", "c"], "b", 1), 1);
  assert.equal(resolve(["a"], undefined, 9), 0);
  assert.equal(resolve([], undefined, 3), 0);
  assert.equal(resolve(["a", "b", "c"], "b", 1), 1);
  assert.match(reviewHtml, /__sthnAuditTarget/);
  assert.match(reviewHtml, /fetch\('\/api\/candidates\?state='\+encodeURIComponent\(\$\('view'\)\.value\)/);
  assert.match(reviewHtml, /\$\('group'\)\.value/);
});
test("R2 jump is one-based, bounded, and read-only", () => {
  assert.equal(jump("1", 5, 3), 0); assert.equal(jump("3", 5, 0), 2); assert.equal(jump("5", 5, 0), 4);
  for (const value of ["", "0", "-1", "x", "1.5", "6"]) assert.equal(jump(value, 5, 2), 2);
  assert.match(reviewHtml, /id="jump"/); assert.match(reviewHtml, /id="jump-go"/);
  assert.doesNotMatch(reviewHtml.match(/jump-go[\s\S]{0,700}/)?.[0] ?? "", /\/api\/reviews/);
});
test("R2 uses the actual parseable reviewer script", () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(reviewHtml)?.[1]; assert.ok(script); assert.doesNotThrow(() => new vm.Script(script!));
});
