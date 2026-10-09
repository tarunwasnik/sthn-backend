import assert from "node:assert/strict";
import test from "node:test";

import { ExperimentalAuxiliary, ExperimentalCandidate } from "../../research/textModerationDataset/experimentalRawCandidates";
import { deduplicateExperimentalCandidates, isBinaryOnlyBlock, modelFacingTrainingRow, selectExperimentalCandidates, splitExperimentalCandidates } from "../../research/textModerationDataset/experimentalExpandedTrainingCorpus";

const row = (text: string, target: 0 | 1, auxiliaryTarget: ExperimentalAuxiliary, sourceId = "GOOGLE_CIVIL_COMMENTS", language = "english"): ExperimentalCandidate => ({ text, target, auxiliaryTarget, sourceId, language, artifact: "synthetic", row: Number(text.match(/\d+$/u)?.[0] ?? 0) });
const rows = (prefix: string, count: number, target: 0 | 1, auxiliaryTarget: ExperimentalAuxiliary, sourceId: string, language: string): ExperimentalCandidate[] => Array.from({ length: count }, (_, index) => row(`${prefix}-${index}`, target, auxiliaryTarget, sourceId, language));

test("deduplication gives STHN priority, excludes binary conflicts, and masks auxiliary conflicts", () => {
  const sthn = row("Same text", 0, "MASKED", "EXISTING_STHN_HUMAN", "en"), externalBlock = row("Same text", 1, "HATE");
  const binaryConflict = [row("conflict", 0, "MASKED"), row("conflict", 1, "HATE", "TEXTDETOX_MULTILINGUAL_TOXICITY")];
  const auxiliaryConflict = [row("category conflict", 1, "HATE"), row("category conflict", 1, "PROFANITY", "PRISM_HINGLISH_HATE_SPEECH")];
  const result = deduplicateExperimentalCandidates([sthn, externalBlock, ...binaryConflict, ...auxiliaryConflict]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates.find((candidate) => candidate.text === "Same text")?.sourceId, "EXISTING_STHN_HUMAN");
  assert.equal(result.candidates.find((candidate) => candidate.text === "category conflict")?.auxiliaryTarget, "MASKED");
  assert.equal(result.reduction.binaryConflictsExcluded, 2);
  assert.equal(result.reduction.auxiliaryConflictsMasked, 1);
});

test("binary-only blocks are BLOCK plus MASKED, never ALLOW plus MASKED", () => {
  assert.equal(isBinaryOnlyBlock(row("block", 1, "MASKED")), true);
  assert.equal(isBinaryOnlyBlock(row("allow", 0, "MASKED")), false);
  assert.deepEqual(modelFacingTrainingRow(row("block", 1, "MASKED")), { text: "block", target: 1, primaryCategory: null });
});

test("selection and stratified split are deterministic and retain all STHN rows", () => {
  const sthn = [
    ...rows("sthn-allow", 110, 0, "MASKED", "EXISTING_STHN_HUMAN", "en"),
    ...rows("sthn-abuse", 18, 1, "ABUSIVE_OR_HARASSING", "EXISTING_STHN_HUMAN", "en"), ...rows("sthn-hate", 16, 1, "HATE", "EXISTING_STHN_HUMAN", "en"),
    ...rows("sthn-profanity", 23, 1, "PROFANITY", "EXISTING_STHN_HUMAN", "en"), ...rows("sthn-sexual", 18, 1, "SEXUAL", "EXISTING_STHN_HUMAN", "en"), ...rows("sthn-threat", 15, 1, "THREAT_OR_VIOLENCE", "EXISTING_STHN_HUMAN", "en"),
  ];
  const external = [
    ...rows("civil-allow", 2_000, 0, "MASKED", "GOOGLE_CIVIL_COMMENTS", "english"), ...rows("detox-en", 1_190, 0, "MASKED", "TEXTDETOX_MULTILINGUAL_TOXICITY", "english"), ...rows("detox-hi", 1_500, 0, "MASKED", "TEXTDETOX_MULTILINGUAL_TOXICITY", "hindi"), ...rows("detox-hin", 1_200, 0, "MASKED", "TEXTDETOX_MULTILINGUAL_TOXICITY", "hinglish"),
    ...rows("abuse", 982, 1, "ABUSIVE_OR_HARASSING", "GOOGLE_CIVIL_COMMENTS", "english"), ...rows("profanity", 977, 1, "PROFANITY", "GOOGLE_CIVIL_COMMENTS", "english"), ...rows("sexual", 518, 1, "SEXUAL", "GOOGLE_CIVIL_COMMENTS", "english"), ...rows("threat", 798, 1, "THREAT_OR_VIOLENCE", "GOOGLE_CIVIL_COMMENTS", "english"),
    ...rows("hate-civil", 250, 1, "HATE", "GOOGLE_CIVIL_COMMENTS", "english"), ...rows("hate-prism", 550, 1, "HATE", "PRISM_HINGLISH_HATE_SPEECH", "hinglish"), ...rows("hate-ethos", 184, 1, "HATE", "ETHOS_HATE_SPEECH", "UNKNOWN"), ...rows("binary-only", 4_000, 1, "MASKED", "TEXTDETOX_MULTILINGUAL_TOXICITY", "hindi"),
  ];
  const candidates = deduplicateExperimentalCandidates([...sthn, ...external]).candidates, first = selectExperimentalCandidates(candidates), second = selectExperimentalCandidates(candidates);
  assert.equal(first.length, 14_349);
  assert.deepEqual(first.map((candidate) => candidate.exact), second.map((candidate) => candidate.exact));
  assert.equal(first.filter((candidate) => candidate.sourceId === "EXISTING_STHN_HUMAN").length, 200);
  const split = splitExperimentalCandidates(first), replay = splitExperimentalCandidates(first), trainNormalized = new Set(split.train.map((candidate) => candidate.normalized));
  assert.equal(split.train.length, 12_914);
  assert.equal(split.validation.length, 1_435);
  assert.deepEqual(split.validation.map((candidate) => candidate.exact), replay.validation.map((candidate) => candidate.exact));
  assert.equal(split.validation.some((candidate) => trainNormalized.has(candidate.normalized)), false);
});
