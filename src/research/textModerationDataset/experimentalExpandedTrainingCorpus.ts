import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ExperimentalAuxiliary, ExperimentalCandidate, readExperimentalRawCandidates } from "./experimentalRawCandidates";
import { normalizeTextForDuplicateDetection, textDuplicateFingerprint } from "./identity";
import { canonicalJson, sha256 } from "./manifest";

export const EXPERIMENTAL_EXPANDED_TRAINING_VERSION = "EXPERIMENTAL_EXPANDED_TRAINING_V1" as const;
export const EXPERIMENTAL_EXPANDED_TRAINING_SEED = "STHN_EXPERIMENTAL_EXPANDED_TRAINING_V1_20261001" as const;
export const EXPERIMENTAL_EXPANDED_TRAINING_OUTPUT = path.resolve(process.cwd(), "dataset-research/text-moderation/experimental-expanded-training-v1");
export const EXPERIMENTAL_AUXILIARY_CATEGORIES = ["ABUSIVE_OR_HARASSING", "HATE", "PROFANITY", "SEXUAL", "THREAT_OR_VIOLENCE"] as const;
type Category = typeof EXPERIMENTAL_AUXILIARY_CATEGORIES[number];
type TrainingRow = { readonly text: string; readonly target: 0 | 1; readonly primaryCategory: Category | null };
type SelectedCandidate = ExperimentalCandidate & { readonly exact: string; readonly normalized: string };
type Summary = Record<string, unknown>;

const categories = new Set<string>(EXPERIMENTAL_AUXILIARY_CATEGORIES);
const sourceRank = (sourceId: string): number => ({ EXISTING_STHN_HUMAN: 0, GOOGLE_CIVIL_COMMENTS: 1, TEXTDETOX_MULTILINGUAL_TOXICITY: 2, PRISM_HINGLISH_HATE_SPEECH: 3, ETHOS_HATE_SPEECH: 4 } as Record<string, number>)[sourceId] ?? Number.MAX_SAFE_INTEGER;
const digest = (value: string): string => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const exactFingerprint = (text: string): string => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const rankCache = new Map<string, string>();
const candidateRank = (candidate: SelectedCandidate, scope: string): string => { const key = `${scope}:${candidate.sourceId}:${candidate.artifact}:${candidate.row}:${candidate.exact}`, cached = rankCache.get(key); if (cached) return cached; const rank = `${digest(`${EXPERIMENTAL_EXPANDED_TRAINING_SEED}:${key}`)}:${candidate.sourceId}:${candidate.artifact}:${candidate.row}`; rankCache.set(key, rank); return rank; };
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const categoryOf = (candidate: ExperimentalCandidate): Category | null => candidate.target === 1 && categories.has(candidate.auxiliaryTarget) ? candidate.auxiliaryTarget as Category : null;
export const isBinaryOnlyBlock = (candidate: ExperimentalCandidate): boolean => candidate.target === 1 && candidate.auxiliaryTarget === "MASKED";
const decorate = (candidate: ExperimentalCandidate): SelectedCandidate => Object.assign(candidate, { exact: exactFingerprint(candidate.text), normalized: textDuplicateFingerprint(candidate.text) }) as SelectedCandidate;
const countBy = <T>(rows: readonly T[], key: (row: T) => string): Record<string, number> => Object.fromEntries([...rows.reduce((result, row) => { const value = key(row); result.set(value, (result.get(value) ?? 0) + 1); return result; }, new Map<string, number>()).entries()].sort(([a], [b]) => a.localeCompare(b)));
const collapseGroup = (group: readonly SelectedCandidate[], reduction: DeduplicationReduction, stage: "exactDuplicatesRemoved" | "normalizedDuplicatesRemoved"): SelectedCandidate | null => {
  const sthn = group.filter((candidate) => candidate.sourceId === "EXISTING_STHN_HUMAN");
  if (sthn.length) {
    if (sthn.length !== 1) throw new Error("Existing STHN TRAIN contains a duplicate-equivalent row");
    reduction[stage] += group.length - 1;
    return sthn[0];
  }
  if (new Set(group.map((candidate) => candidate.target)).size !== 1) { reduction.binaryConflictsExcluded += group.length; return null; }
  const selected = [...group].sort((a, b) => sourceRank(a.sourceId) - sourceRank(b.sourceId) || compare(candidateRank(a, "representative"), candidateRank(b, "representative")))[0];
  reduction[stage] += group.length - 1;
  if (selected.target === 1 && new Set(group.map((candidate) => candidate.auxiliaryTarget)).size !== 1) {
    reduction.auxiliaryConflictsMasked += 1;
    return { ...selected, auxiliaryTarget: "MASKED" };
  }
  return selected;
};

export type DeduplicationReduction = { exactDuplicatesRemoved: number; normalizedDuplicatesRemoved: number; binaryConflictsExcluded: number; auxiliaryConflictsMasked: number };
const collapseSorted = (candidates: SelectedCandidate[], key: (candidate: SelectedCandidate) => string, reduction: DeduplicationReduction, stage: "exactDuplicatesRemoved" | "normalizedDuplicatesRemoved"): SelectedCandidate[] => {
  candidates.sort((a, b) => compare(key(a), key(b))); const survivors: SelectedCandidate[] = [];
  for (let start = 0; start < candidates.length;) { let end = start + 1; while (end < candidates.length && key(candidates[start]) === key(candidates[end])) end += 1; if (end === start + 1) survivors.push(candidates[start]); else { const selected = collapseGroup(candidates.slice(start, end), reduction, stage); if (selected) survivors.push(selected); } start = end; }
  return survivors;
};
export const deduplicateExperimentalCandidates = (candidates: ExperimentalCandidate[]): { readonly candidates: readonly SelectedCandidate[]; readonly reduction: DeduplicationReduction } => {
  let decorated = candidates.map(decorate); candidates.length = 0;
  const exactReduction: DeduplicationReduction = { exactDuplicatesRemoved: 0, normalizedDuplicatesRemoved: 0, binaryConflictsExcluded: 0, auxiliaryConflictsMasked: 0 };
  decorated = collapseSorted(decorated, (candidate) => candidate.exact, exactReduction, "exactDuplicatesRemoved");
  return { candidates: collapseSorted(decorated, (candidate) => candidate.normalized, exactReduction, "normalizedDuplicatesRemoved"), reduction: exactReduction };
};

const take = (pool: readonly SelectedCandidate[], count: number, scope: string, selected: SelectedCandidate[], used: Set<string>, predicate: (candidate: SelectedCandidate) => boolean): void => {
  for (const candidate of [...pool].filter((item) => !used.has(item.exact) && predicate(item)).sort((a, b) => compare(candidateRank(a, scope), candidateRank(b, scope)))) { if (count <= 0) return; selected.push(candidate); used.add(candidate.exact); count -= 1; }
};
const selectedCount = (selected: readonly SelectedCandidate[], predicate: (candidate: SelectedCandidate) => boolean): number => selected.filter(predicate).length;
const fill = (pool: readonly SelectedCandidate[], total: number, scope: string, selected: SelectedCandidate[], used: Set<string>, predicate: (candidate: SelectedCandidate) => boolean): void => take(pool, Math.max(0, total - selectedCount(selected, predicate)), scope, selected, used, predicate);

export const selectExperimentalCandidates = (candidates: readonly SelectedCandidate[]): readonly SelectedCandidate[] => {
  const selected = candidates.filter((candidate) => candidate.sourceId === "EXISTING_STHN_HUMAN");
  if (selected.length !== 200) throw new Error("All 200 existing STHN TRAIN rows must survive deduplication");
  const used = new Set(selected.map((candidate) => candidate.exact)), external = candidates.filter((candidate) => candidate.sourceId !== "EXISTING_STHN_HUMAN");
  take(external, 2_000, "allow-civil", selected, used, (candidate) => candidate.target === 0 && candidate.sourceId === "GOOGLE_CIVIL_COMMENTS");
  take(external, 1_190, "allow-english", selected, used, (candidate) => candidate.target === 0 && candidate.sourceId === "TEXTDETOX_MULTILINGUAL_TOXICITY" && candidate.language === "english");
  take(external, 1_500, "allow-hindi", selected, used, (candidate) => candidate.target === 0 && candidate.sourceId === "TEXTDETOX_MULTILINGUAL_TOXICITY" && candidate.language === "hindi");
  take(external, 1_200, "allow-hinglish", selected, used, (candidate) => candidate.target === 0 && candidate.sourceId === "TEXTDETOX_MULTILINGUAL_TOXICITY" && candidate.language === "hinglish");
  fill(external, 6_000, "allow-fallback", selected, used, (candidate) => candidate.target === 0);
  for (const category of ["ABUSIVE_OR_HARASSING", "PROFANITY"] as const) fill(external, 1_000, category, selected, used, (candidate) => categoryOf(candidate) === category);
  take(external, 250, "hate-civil", selected, used, (candidate) => categoryOf(candidate) === "HATE" && candidate.sourceId === "GOOGLE_CIVIL_COMMENTS");
  take(external, 550, "hate-prism", selected, used, (candidate) => categoryOf(candidate) === "HATE" && candidate.sourceId === "PRISM_HINGLISH_HATE_SPEECH");
  take(external, 184, "hate-ethos", selected, used, (candidate) => categoryOf(candidate) === "HATE" && candidate.sourceId === "ETHOS_HATE_SPEECH");
  fill(external, 1_000, "hate-fallback", selected, used, (candidate) => categoryOf(candidate) === "HATE");
  for (const [category, cap] of [["SEXUAL", 536], ["THREAT_OR_VIOLENCE", 813]] as const) fill(external, cap, category, selected, used, (candidate) => categoryOf(candidate) === category);
  fill(external, 4_000, "binary-only-block", selected, used, isBinaryOnlyBlock);
  const targets: Record<string, number> = { ALLOW: 6_000, ABUSIVE_OR_HARASSING: 1_000, HATE: 1_000, PROFANITY: 1_000, SEXUAL: 536, THREAT_OR_VIOLENCE: 813, BINARY_ONLY_BLOCK: 4_000 };
  const actual: Record<string, number> = { ALLOW: selectedCount(selected, (candidate) => candidate.target === 0), ABUSIVE_OR_HARASSING: selectedCount(selected, (candidate) => categoryOf(candidate) === "ABUSIVE_OR_HARASSING"), HATE: selectedCount(selected, (candidate) => categoryOf(candidate) === "HATE"), PROFANITY: selectedCount(selected, (candidate) => categoryOf(candidate) === "PROFANITY"), SEXUAL: selectedCount(selected, (candidate) => categoryOf(candidate) === "SEXUAL"), THREAT_OR_VIOLENCE: selectedCount(selected, (candidate) => categoryOf(candidate) === "THREAT_OR_VIOLENCE"), BINARY_ONLY_BLOCK: selectedCount(selected, isBinaryOnlyBlock) };
  for (const [key, target] of Object.entries(targets)) if (!(["SEXUAL", "THREAT_OR_VIOLENCE"].includes(key)) && actual[key] !== target) throw new Error(`Insufficient unique candidates for ${key}: ${actual[key]} of ${target}`);
  return selected;
};

export const splitExperimentalCandidates = (selected: readonly SelectedCandidate[]): { readonly train: readonly SelectedCandidate[]; readonly validation: readonly SelectedCandidate[] } => {
  const groups = new Map<string, SelectedCandidate[]>();
  for (const candidate of selected) { const key = candidate.target === 0 ? "ALLOW" : categoryOf(candidate) ?? "BINARY_ONLY_BLOCK"; const group = groups.get(key); if (group) group.push(candidate); else groups.set(key, [candidate]); }
  const train: SelectedCandidate[] = [], validation: SelectedCandidate[] = [];
  for (const [key, group] of groups) { const ordered = [...group].sort((a, b) => compare(candidateRank(a, `split:${key}`), candidateRank(b, `split:${key}`))); const validationCount = Math.round(group.length * 0.1); validation.push(...ordered.slice(0, validationCount)); train.push(...ordered.slice(validationCount)); }
  return { train, validation };
};

const modelRows = (rows: readonly SelectedCandidate[]): TrainingRow[] => rows.map((candidate) => ({ text: candidate.text, target: candidate.target, primaryCategory: categoryOf(candidate) }));
const shaFile = (filename: string): string => sha256(fs.readFileSync(filename));
export const verifyExperimentalExpandedTrainingCorpus = (train: readonly SelectedCandidate[], validation: readonly SelectedCandidate[], expectedSthn: readonly ExperimentalCandidate[]): void => {
  const all = [...train, ...validation], trainNormalized = new Set(train.map((candidate) => candidate.normalized));
  if (!all.length || new Set(all.map((candidate) => candidate.exact)).size !== all.length || new Set(all.map((candidate) => candidate.normalized)).size !== all.length || train.some((candidate) => validation.some((other) => other.exact === candidate.exact)) || validation.some((candidate) => trainNormalized.has(candidate.normalized))) throw new Error("Experimental corpus split duplicate or total invariant failed");
  if (all.some((candidate) => !candidate.text.trim() || (candidate.target !== 0 && candidate.target !== 1) || (candidate.target === 0 && candidate.auxiliaryTarget !== "MASKED") || (candidate.target === 1 && candidate.auxiliaryTarget !== "MASKED" && !categories.has(candidate.auxiliaryTarget)))) throw new Error("Experimental corpus row schema invariant failed");
  if (all.filter(isBinaryOnlyBlock).some((candidate) => candidate.target !== 1) || all.some((candidate) => !["EXISTING_STHN_HUMAN", "GOOGLE_CIVIL_COMMENTS", "TEXTDETOX_MULTILINGUAL_TOXICITY", "PRISM_HINGLISH_HATE_SPEECH", "ETHOS_HATE_SPEECH"].includes(candidate.sourceId))) throw new Error("Experimental corpus source or binary-only invariant failed");
  const selectedSthn = new Set(all.filter((candidate) => candidate.sourceId === "EXISTING_STHN_HUMAN").map((candidate) => candidate.exact));
  if (expectedSthn.length !== 200 || expectedSthn.some((candidate) => !selectedSthn.has(exactFingerprint(candidate.text)))) throw new Error("Existing STHN TRAIN retention invariant failed");
};

export const buildExperimentalExpandedTrainingCorpus = async (): Promise<Summary> => {
  if (fs.existsSync(EXPERIMENTAL_EXPANDED_TRAINING_OUTPUT)) throw new Error("Experimental expanded training output already exists; overwrite refused");
  const raw = await readExperimentalRawCandidates(); const sthn = raw.filter((candidate) => candidate.sourceId === "EXISTING_STHN_HUMAN"), deduplicated = deduplicateExperimentalCandidates(raw); const selected = selectExperimentalCandidates(deduplicated.candidates), split = splitExperimentalCandidates(selected);
  verifyExperimentalExpandedTrainingCorpus(split.train, split.validation, sthn);
  const trainRows = modelRows(split.train), validationRows = modelRows(split.validation), temporary = `${EXPERIMENTAL_EXPANDED_TRAINING_OUTPUT}.${process.pid}.partial`;
  const distribution = (rows: readonly SelectedCandidate[]): Record<string, number> => countBy(rows, (candidate) => candidate.target === 0 ? "ALLOW" : categoryOf(candidate) ?? "BINARY_ONLY_BLOCK");
  const summary: Summary = { version: EXPERIMENTAL_EXPANDED_TRAINING_VERSION, seed: EXPERIMENTAL_EXPANDED_TRAINING_SEED, totalRows: selected.length, trainRows: split.train.length, validationRows: split.validation.length, ALLOW: selectedCount(selected, (candidate) => candidate.target === 0), BLOCK: selectedCount(selected, (candidate) => candidate.target === 1), ABUSIVE_OR_HARASSING: selectedCount(selected, (candidate) => categoryOf(candidate) === "ABUSIVE_OR_HARASSING"), HATE: selectedCount(selected, (candidate) => categoryOf(candidate) === "HATE"), PROFANITY: selectedCount(selected, (candidate) => categoryOf(candidate) === "PROFANITY"), SEXUAL: selectedCount(selected, (candidate) => categoryOf(candidate) === "SEXUAL"), THREAT_OR_VIOLENCE: selectedCount(selected, (candidate) => categoryOf(candidate) === "THREAT_OR_VIOLENCE"), BINARY_ONLY_BLOCK: selectedCount(selected, isBinaryOnlyBlock), sourceCounts: countBy(selected, (candidate) => candidate.sourceId), languageCounts: countBy(selected.filter((candidate) => candidate.language !== "UNKNOWN"), (candidate) => candidate.language), trainDistribution: distribution(split.train), validationDistribution: distribution(split.validation), sthnRowsRetained: selectedCount(selected, (candidate) => candidate.sourceId === "EXISTING_STHN_HUMAN"), exactDuplicatesRemoved: deduplicated.reduction.exactDuplicatesRemoved, normalizedDuplicatesRemoved: deduplicated.reduction.normalizedDuplicatesRemoved, binaryConflictsExcluded: deduplicated.reduction.binaryConflictsExcluded, auxiliaryConflictsMasked: deduplicated.reduction.auxiliaryConflictsMasked, exactCrossSplitDuplicates: 0, normalizedCrossSplitDuplicates: 0 };
  try { fs.mkdirSync(temporary, { recursive: true }); fs.writeFileSync(path.join(temporary, `${"train"}.jsonl`), `${trainRows.map((row) => JSON.stringify(row)).join("\n")}\n`, { encoding: "utf8", flag: "wx" }); fs.writeFileSync(path.join(temporary, "validation.jsonl"), `${validationRows.map((row) => JSON.stringify(row)).join("\n")}\n`, { encoding: "utf8", flag: "wx" }); const fileSummary = { ...summary, trainSha256: shaFile(path.join(temporary, "train.jsonl")), validationSha256: shaFile(path.join(temporary, "validation.jsonl")) }; fs.writeFileSync(path.join(temporary, "summary.json"), canonicalJson(fileSummary), { encoding: "utf8", flag: "wx" }); fs.renameSync(temporary, EXPERIMENTAL_EXPANDED_TRAINING_OUTPUT); return { ...fileSummary, summarySha256: shaFile(path.join(EXPERIMENTAL_EXPANDED_TRAINING_OUTPUT, "summary.json")) }; }
  catch (error) { fs.rmSync(temporary, { recursive: true, force: true }); throw error; }
};

export const modelFacingTrainingRow = (candidate: ExperimentalCandidate): TrainingRow => ({ text: candidate.text, target: candidate.target, primaryCategory: categoryOf(candidate) });
