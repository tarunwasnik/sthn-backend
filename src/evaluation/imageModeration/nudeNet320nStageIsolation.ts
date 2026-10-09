export type StageAComparison = Readonly<{ candidateId: string; countPass: boolean }>;

export const G8C_R1_CONTROL_CANDIDATE = "candidate-06e0fcca6c4fdfc9";

/** Selection uses only frozen Stage-A comparison evidence and frozen subset order. */
export const selectG8CR1DiagnosticCandidates = (
  frozenIds: readonly string[],
  comparisons: readonly StageAComparison[],
): readonly Readonly<{ candidateId: string; reason: string }>[] => {
  if (frozenIds.length !== 16 || new Set(frozenIds).size !== 16 || !frozenIds.includes(G8C_R1_CONTROL_CANDIDATE)) {
    throw new Error("G8-C-R1 requires the exact frozen 16-candidate Stage-A subset");
  }
  const comparisonById = new Map(comparisons.map((comparison) => [comparison.candidateId, comparison]));
  const selected = [{ candidateId: G8C_R1_CONTROL_CANDIDATE, reason: "G8-B same-tensor control and Stage-A failed candidate" }];
  for (const candidateId of frozenIds) {
    if (selected.length === 4) break;
    if (candidateId !== G8C_R1_CONTROL_CANDIDATE && comparisonById.get(candidateId)?.countPass === false) {
      selected.push({ candidateId, reason: "Earliest frozen-order Stage-A retained-detection count mismatch" });
    }
  }
  if (selected.length !== 4) throw new Error("G8-C-R1 could not deterministically select four diagnostics");
  return selected;
};
