import assert from "node:assert/strict";
import test from "node:test";
import { executionSupplement, frozenAuthorities, validateExecutionSupplement } from "../../research/textModerationDataset/externalMappingExecutionSupplement";
import { mapExternalRow } from "../../research/textModerationDataset/externalCorpusExecution";

const civil = (overrides: Record<string, unknown> = {}) => ({ text: "synthetic", toxicity: 0, severe_toxicity: 0, obscene: 0, threat: 0, insult: 0, identity_attack: 0, sexual_explicit: 0, ...overrides });
test("Civil exact allow boundary and stronger precedence are executable", () => {
  assert.equal(mapExternalRow("GOOGLE_CIVIL_COMMENTS", civil({ toxicity: .05, severe_toxicity: .05, obscene: .05, threat: .05, insult: .05, identity_attack: .05, sexual_explicit: .05 }), { artifact: "x", row: 1 })?.decision, "ALLOW");
  assert.equal(mapExternalRow("GOOGLE_CIVIL_COMMENTS", civil({ toxicity: .05001 }), { artifact: "x", row: 1 }), null);
  assert.equal(mapExternalRow("GOOGLE_CIVIL_COMMENTS", civil({ threat: .8, sexual_explicit: .8 }), { artifact: "x", row: 1 })?.category, "THREAT_OR_VIOLENCE");
});
test("Civil rejects malformed values and maps binary-only toxicity", () => {
  assert.equal(mapExternalRow("GOOGLE_CIVIL_COMMENTS", civil({ insult: null }), { artifact: "x", row: 1 }), null);
  assert.equal(mapExternalRow("GOOGLE_CIVIL_COMMENTS", civil({ toxicity: .9 }), { artifact: "x", row: 1 })?.category, null);
});
test("TextDetox accepts only native 0 and 1 with auxiliary masked", () => {
  assert.equal(mapExternalRow("TEXTDETOX_MULTILINGUAL_TOXICITY", { text: "synthetic", toxic: 0 }, { artifact: "x", language: "hindi", row: 1 })?.decision, "ALLOW");
  assert.equal(mapExternalRow("TEXTDETOX_MULTILINGUAL_TOXICITY", { text: "synthetic", toxic: 1 }, { artifact: "x", language: "hindi", row: 1 })?.category, null);
  assert.equal(mapExternalRow("TEXTDETOX_MULTILINGUAL_TOXICITY", { text: "synthetic", toxic: 2 }, { artifact: "x", row: 1 }), null);
  assert.equal(mapExternalRow("TEXTDETOX_MULTILINGUAL_TOXICITY", { text: "synthetic", toxic: 1n }, { artifact: "x", row: 1 })?.decision, "BLOCK");
});
test("PRISM and ETHOS retain positive-only canonical mappings", () => {
  assert.equal(mapExternalRow("PRISM_HINGLISH_HATE_SPEECH", { text: "synthetic", label: "1", lang: "hinglish" }, { artifact: "data_train.csv", row: 1 })?.category, "HATE");
  assert.equal(mapExternalRow("PRISM_HINGLISH_HATE_SPEECH", { text: "synthetic", label: "0", lang: "hinglish" }, { artifact: "data_train.csv", row: 1 }), null);
  assert.equal(mapExternalRow("ETHOS_HATE_SPEECH", { comment: "synthetic", isHate: ".8" }, { artifact: "binary", row: 1 })?.category, "HATE");
  assert.equal(mapExternalRow("ETHOS_HATE_SPEECH", { comment: "synthetic", isHate: ".79" }, { artifact: "binary", row: 1 }), null);
});
test("supplement binds frozen authorities and refuses non-authorized mappings", () => {
  const supplement = executionSupplement(); assert.deepEqual((supplement.subordinateTo as typeof frozenAuthorities), frozenAuthorities);
  assert.equal(mapExternalRow("POLYGLOT_HINDI_TOXICITY_QWEN", { text: "synthetic" }, { artifact: "x", row: 1 }), null);
  assert.equal(mapExternalRow("DYNAHATE", { text: "synthetic" }, { artifact: "x", row: 1 }), null);
  assert.equal(mapExternalRow("INTERNAL_TEST", { text: "synthetic" }, { artifact: "x", row: 1 }), null);
  assert.equal((supplement.existingSthnTrain as { count: number; allow: number; block: number }).count, 200);
  assert.equal((supplement.existingSthnTrain as { allow: number }).allow, 110);
  assert.equal((supplement.existingSthnTrain as { block: number }).block, 90);
  validateExecutionSupplement(supplement);
});
