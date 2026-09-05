import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProfileVerificationMemoryDiagnostic,
  PROFILE_VERIFICATION_MEMORY_DIAGNOSTIC_EVENT,
} from "../../services/profile/profileVerificationMemoryDiagnostic.service";

test("profile-verification memory diagnostics expose only bounded stage, role, index, and memory fields", () => {
  const diagnostic = createProfileVerificationMemoryDiagnostic(
    "PROFILE_MEDIA_ITEM_COMPLETE",
    { mediaIndex: 99, mediaRole: "PROFILE_PHOTO" },
    { rss: 200 * 1_048_576, heapUsed: 25.04 * 1_048_576, heapTotal: 40 * 1_048_576, external: 12 * 1_048_576, arrayBuffers: 8 * 1_048_576 },
  );
  assert.deepEqual(diagnostic, {
    event: PROFILE_VERIFICATION_MEMORY_DIAGNOSTIC_EVENT,
    stage: "PROFILE_MEDIA_ITEM_COMPLETE",
    mediaIndex: 7,
    mediaRole: "PROFILE_PHOTO",
    rssMiB: 200,
    heapUsedMiB: 25,
    heapTotalMiB: 40,
    externalMiB: 12,
    arrayBuffersMiB: 8,
  });
  assert.deepEqual(Object.keys(diagnostic).sort(), [
    "arrayBuffersMiB", "event", "externalMiB", "heapTotalMiB", "heapUsedMiB", "mediaIndex", "mediaRole", "rssMiB", "stage",
  ]);
  const serialized = JSON.stringify(diagnostic);
  for (const prohibited of ["url", "publicId", "embedding", "landmark", "coordinate", "token", "request", "user", "evidence"]) {
    assert.equal(serialized.toLowerCase().includes(prohibited.toLowerCase()), false);
  }
});

test("non-item memory diagnostics omit all media metadata", () => {
  const diagnostic = createProfileVerificationMemoryDiagnostic(
    "WORKER_CLAIMED",
    { mediaIndex: 4, mediaRole: "AVATAR" },
    { rss: -1, heapUsed: Number.MAX_SAFE_INTEGER, heapTotal: 0, external: 0, arrayBuffers: 0 },
  );
  assert.deepEqual(Object.keys(diagnostic).sort(), ["arrayBuffersMiB", "event", "externalMiB", "heapTotalMiB", "heapUsedMiB", "rssMiB", "stage"]);
  assert.equal(diagnostic.rssMiB, 0);
  assert.equal(diagnostic.heapUsedMiB, 1_048_576);
});

test("decision diagnostics expose only the bounded decision type and memory fields", () => {
  const diagnostic = createProfileVerificationMemoryDiagnostic(
    "DECISION_APPLIED",
    { decisionType: "APPROVED", mediaIndex: 2, mediaRole: "AVATAR" },
    { rss: 1, heapUsed: 2, heapTotal: 3, external: 4, arrayBuffers: 5 },
  );
  assert.equal(diagnostic.decisionType, "APPROVED");
  assert.equal("mediaIndex" in diagnostic, false);
  assert.equal("mediaRole" in diagnostic, false);
  assert.deepEqual(Object.keys(diagnostic).sort(), ["arrayBuffersMiB", "decisionType", "event", "externalMiB", "heapTotalMiB", "heapUsedMiB", "rssMiB", "stage"]);
});
