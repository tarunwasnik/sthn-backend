import assert from "node:assert/strict";
import test from "node:test";
import { selectG8CR1DiagnosticCandidates } from "../../evaluation/imageModeration/nudeNet320nStageIsolation";

test("G8-C-R1 selection is deterministic, frozen-subset-only, and bounded to four candidates", () => {
  const ids = ["candidate-06e0fcca6c4fdfc9", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o"];
  const comparisons = ids.map((candidateId, index) => ({ candidateId, countPass: ![1, 3, 4, 5].includes(index) }));
  const selected = selectG8CR1DiagnosticCandidates(ids, comparisons);
  assert.deepEqual(selected.map((item) => item.candidateId), ["candidate-06e0fcca6c4fdfc9", "a", "c", "d"]);
  assert.equal(selected.length, 4);
  assert.ok(selected.every((item) => ids.includes(item.candidateId)));
});
