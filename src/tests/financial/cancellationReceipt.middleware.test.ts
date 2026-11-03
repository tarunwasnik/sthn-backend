import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { captureCancellationReceipt, getProvisionalCancellationReceipt } from "../../middlewares/cancellationReceipt.middleware";

test("receipt observation is server-generated, provisional and stable within a request", () => {
  const req = { body: { receivedAt: "2000-01-01T00:00:00.000Z", cancellationReceivedMs: 0 } } as Request;
  const res = {} as Response;
  assert.equal(getProvisionalCancellationReceipt(req), undefined);
  let calls = 0;
  const before = Date.now();
  captureCancellationReceipt(req, res, () => { calls++; });
  const observed = getProvisionalCancellationReceipt(req);
  assert.ok(observed);
  assert.ok(observed.getTime() >= before && observed.getTime() <= Date.now());
  observed.setTime(0);
  captureCancellationReceipt(req, res, () => { calls++; });
  assert.equal(calls, 2);
  assert.ok(getProvisionalCancellationReceipt(req)!.getTime() >= before);
});

test("observations are request-local and establish no receipt on other requests", () => {
  const first = {} as Request;
  const second = {} as Request;
  captureCancellationReceipt(first, {} as Response, () => undefined);
  assert.ok(getProvisionalCancellationReceipt(first));
  assert.equal(getProvisionalCancellationReceipt(second), undefined);
});
