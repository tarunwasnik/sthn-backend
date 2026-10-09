import { createHash } from "node:crypto";

export const G8B_SELECTION_ORDER = ["NUDITY_BLOCK", "EXPLICIT_SEXUAL_BLOCK", "PORNOGRAPHY_BLOCK", "SUGGESTIVE_BLOCK", "ORDINARY_PORTRAIT_PASS", "SWIMWEAR_PASS", "FITNESS_PASS"] as const;
export const G8B_SELECTION_COUNTS = Object.freeze({ NUDITY_BLOCK: 4, EXPLICIT_SEXUAL_BLOCK: 2, PORNOGRAPHY_BLOCK: 2, SUGGESTIVE_BLOCK: 2, ORDINARY_PORTRAIT_PASS: 2, SWIMWEAR_PASS: 2, FITNESS_PASS: 2 });
export const G8B_SELECTION_ALGORITHM = "ORDERED_CLASSIFICATION_FIRST_UNUSED_CANDIDATE_V1" as const;
type Slot = typeof G8B_SELECTION_ORDER[number];
export type G8BCandidate = Readonly<{ id: string; sha256?: string; coverageClass: string; classifications: readonly string[] }>;
export type G8BSelection = Readonly<{ selected: readonly Readonly<{ candidateId: string; candidateSha256: string; selectionSlotClassification: Slot; authoritativeClassifications: readonly string[] }>[]; skipped: readonly Readonly<{ candidateId: string; candidateSha256: string; requestedSlot: Slot; earlierSlot: Slot }>[] }>;
export const sha256 = (x: string | Buffer) => createHash("sha256").update(x).digest("hex");
export const selectG8BDiagnosticSubset = (candidates: readonly G8BCandidate[]): G8BSelection => {
  const used = new Map<string, Slot>();
  const selected: Array<{ candidateId: string; candidateSha256: string; selectionSlotClassification: Slot; authoritativeClassifications: readonly string[] }> = [];
  const skipped: Array<{ candidateId: string; candidateSha256: string; requestedSlot: Slot; earlierSlot: Slot }> = [];
  for (const slot of G8B_SELECTION_ORDER) {
    const required = G8B_SELECTION_COUNTS[slot]; let filled = 0;
    for (const candidate of candidates.filter((item) => item.classifications.includes(slot)).sort((a, b) => a.id.localeCompare(b.id))) {
      const earlier = used.get(candidate.id);
      if (earlier) { skipped.push({ candidateId: candidate.id, candidateSha256: candidate.sha256 ?? "", requestedSlot: slot, earlierSlot: earlier }); continue; }
      if (!candidate.sha256) throw new Error(`Selected candidate lacks SHA: ${candidate.id}`);
      used.set(candidate.id, slot); selected.push({ candidateId: candidate.id, candidateSha256: candidate.sha256, selectionSlotClassification: slot, authoritativeClassifications: [...candidate.classifications] });
      if (++filled === required) break;
    }
    if (filled !== required) throw new Error(`Unable to fill deterministic G8-B slot: ${slot}`);
  }
  if (selected.length !== 16 || used.size !== 16) throw new Error("G8-B selection must contain exactly 16 unique candidates");
  return { selected, skipped };
};
