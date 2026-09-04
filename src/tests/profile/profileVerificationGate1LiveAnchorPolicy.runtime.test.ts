import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateProfileVerificationGate1LiveAnchor, LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN } from "../../services/profile/profileVerificationGate1LiveAnchorPolicy.service";

test("Gate-1 distinguishes technical insufficiency from coherence and honors the .28 boundary", () => {
  assert.deepEqual(evaluateProfileVerificationGate1LiveAnchor([[1], [1], [1], [1]]).outcome, "LIVE_CAPTURE_TECHNICAL_FAILURE");
  const boundary = evaluateProfileVerificationGate1LiveAnchor([[1, 0], [.28, Math.sqrt(1 - .28 ** 2)], [.28, Math.sqrt(1 - .28 ** 2)], [.28, Math.sqrt(1 - .28 ** 2)], [.28, Math.sqrt(1 - .28 ** 2)]]);
  assert.equal(boundary.threshold, LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN);
  assert.equal(boundary.outcome, "PASS");
  const incoherent = evaluateProfileVerificationGate1LiveAnchor([[1, 0], [1, 0], [1, 0], [1, 0], [-1, 0]]);
  assert.equal(incoherent.outcome, "LIVE_ANCHOR_INCOHERENT");
  assert.equal(incoherent.usableCaptureCount, 5);
  assert.ok((incoherent.weakestPeerMedian ?? 1) < .28);
});

test("Gate-1 result is bounded and contains no biometric vectors", () => {
  const serialized = JSON.stringify(evaluateProfileVerificationGate1LiveAnchor([[1], [1], [1], [1], [1]]));
  assert.equal(serialized.includes("embedding"), false);
  assert.equal(serialized.includes("landmark"), false);
});
