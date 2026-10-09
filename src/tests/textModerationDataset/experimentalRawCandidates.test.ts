import assert from "node:assert/strict";
import test from "node:test";
import { mapCivil, mapEthos, mapTextDetox, readEthosRawCandidates, readExistingSthnTrainRawCandidates } from "../../research/textModerationDataset/experimentalRawCandidates";

test("ETHOS uses the canonical binary score threshold", () => {
  assert.equal(mapEthos("0.799999"), null);
  assert.deepEqual(mapEthos("0.80"), { target: 1, auxiliaryTarget: "HATE" });
  assert.equal(mapEthos("invalid"), null);
  assert.equal(readEthosRawCandidates().length, 279);
});

test("existing STHN TRAIN preserves reviewed binary and category labels", () => {
  const rows = readExistingSthnTrainRawCandidates();
  const count = (target: number, auxiliaryTarget?: string): number => rows.filter((row) => row.target === target && (auxiliaryTarget === undefined || row.auxiliaryTarget === auxiliaryTarget)).length;
  assert.equal(rows.length, 200);
  assert.equal(count(0), 110);
  assert.equal(count(1), 90);
  assert.equal(count(1, "ABUSIVE_OR_HARASSING"), 18);
  assert.equal(count(1, "HATE"), 16);
  assert.equal(count(1, "PROFANITY"), 23);
  assert.equal(count(1, "SEXUAL"), 18);
  assert.equal(count(1, "THREAT_OR_VIOLENCE"), 15);
});

test("raw-source mappings preserve bigint, Civil precedence, and PRISM-compatible positivity", () => {
  assert.deepEqual(mapTextDetox(0n), { target: 0, auxiliaryTarget: "MASKED" });
  assert.deepEqual(mapTextDetox(1n), { target: 1, auxiliaryTarget: "MASKED" });
  assert.equal(mapTextDetox(2n), null);
  assert.deepEqual(mapCivil({ text: "x", toxicity: 0.9, severe_toxicity: 0, obscene: 0.9, threat: 0.9, insult: 0.9, identity_attack: 0.9, sexual_explicit: 0.9 }), { target: 1, auxiliaryTarget: "THREAT_OR_VIOLENCE" });
  assert.equal(mapCivil({ text: "x", toxicity: 0.7, severe_toxicity: 0, obscene: 0, threat: 0, insult: 0, identity_attack: 0, sexual_explicit: 0 }), null);
});
