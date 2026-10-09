import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./manifest";
import { parseCsv } from "./csv";
import {
  MHS_V2_CALIBRATION_REGIONS,
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST,
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256,
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_VERSION,
  MHS_V2_SEMANTIC_CALIBRATION_REUSE_CAP,
  MHS_V2_SEMANTIC_CALIBRATION_SEED,
  MhsV2CalibrationRegion,
  MhsV2SemanticCalibrationPolicyArtifact,
  validateMhsV2SemanticCalibrationPolicy,
} from "./mhsV2SemanticCalibrationPolicy";
import { E5_SMALL_MODEL_REPOSITORY, E5_SMALL_MODEL_REVISION } from "./semanticSimilarity/e5SmallExportContract";
import { E5_SELECTED_PREFIX_POLICY_VERSION } from "./semanticSimilarity/e5SemanticCalibration";
import { E5SemanticSimilarityAdapter, semanticCosineSimilarity } from "./semanticSimilarity/e5SemanticSimilarityAdapter";

export const MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SCHEMA = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_CALIBRATION_PAIR_MEMBERSHIP_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_VERSION = "MHS_V2_SEMANTIC_CALIBRATION_PAIR_MEMBERSHIP_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME = "mhs-v2-semantic-calibration-pair-membership-v1.json" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SHA256 = "37d06cfa31bff3fbe61c308cdbe6801901a1cb1966ccf8914ab9009da59d275a" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_PAYLOAD_DIGEST = "ae1934cc219deb7ba77dcf58a5466ec7bf115642ee18484bb20ef4810384983c" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_DIGEST = "07ff2c62a6ec4cbd5f1708a88586366273688f42a097a065be9ebbc9958e6599" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PACKET_VERSION = "STHN_TEXT_MODERATION_MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PACKET_V1" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME = "mhs-v2-semantic-calibration-reviewer-a-v1-blinded.csv" as const;
export const MHS_V2_SEMANTIC_CALIBRATION_REVIEW_SHA256 = "0709acd26bb06fd1057c7057957e5c217a3086110fd5d72ac1654d52b5852277" as const;

export const MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS = [
  "review_row_number", "packet_version", "policy_artifact_sha256", "membership_digest", "pair_id",
  "candidate_a_id", "candidate_a_text_sha256", "candidate_a_text", "candidate_b_id", "candidate_b_text_sha256",
  "candidate_b_text", "semantic_relationship_input", "reviewer_note_input", "reviewer_id_input", "reviewed_at_input",
] as const;

export type MhsV2CalibrationScope = "A" | "B";
export type MhsV2CalibrationStratum = MhsV2CalibrationRegion | "C1";
export type MhsV2CalibrationCandidateNamespace = "V2" | "HISTORICAL_DEVELOPMENT";

export interface MhsV2CalibrationCandidate {
  readonly namespace: MhsV2CalibrationCandidateNamespace;
  readonly candidateId: string;
  readonly textSha256: string;
  readonly text: string;
}

export interface MhsV2CalibrationPairIdentity {
  readonly pairId: string;
  readonly scope: MhsV2CalibrationScope;
  readonly candidateA: MhsV2CalibrationCandidate;
  readonly candidateB: MhsV2CalibrationCandidate;
}

export interface MhsV2CalibrationScoredPair extends MhsV2CalibrationPairIdentity { readonly score: number }

export interface MhsV2CalibrationSelectedPair {
  readonly selectionOrder: number;
  readonly pairId: string;
  readonly scope: MhsV2CalibrationScope;
  readonly stratum: MhsV2CalibrationStratum;
  readonly candidateAId: string;
  readonly candidateATextSha256: string;
  readonly candidateBId: string;
  readonly candidateBTextSha256: string;
  readonly e5Score: number;
}

export interface MhsV2CalibrationRegionAvailability {
  readonly R1: number; readonly R2: number; readonly R3: number; readonly R4: number; readonly R5: number; readonly R6: number;
  readonly below078: number;
}

export interface MhsV2CalibrationSelectionResult {
  readonly selected: readonly MhsV2CalibrationSelectedPair[];
  readonly availability: Readonly<Record<MhsV2CalibrationScope, MhsV2CalibrationRegionAvailability>>;
  readonly selectedCounts: Readonly<Record<MhsV2CalibrationScope, Readonly<Record<MhsV2CalibrationStratum, number>>>>;
  readonly maximumCandidateReuse: number;
  readonly candidatesAtReuseCap: readonly string[];
}

export interface MhsV2SemanticCalibrationMembershipPayload {
  readonly schemaVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SCHEMA;
  readonly membershipVersion: typeof MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_VERSION;
  readonly phase: "T6L-7K-A1R-X";
  readonly status: "CALIBRATION_MEMBERSHIP_PACKET_PREPARATION_COMPLETE";
  readonly authorities: {
    readonly policyArtifactSha256: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256;
    readonly policyPayloadDigest: typeof MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST;
    readonly upstreamHashes: MhsV2SemanticCalibrationPolicyArtifact["authorities"];
  };
  readonly e5: {
    readonly repository: typeof E5_SMALL_MODEL_REPOSITORY;
    readonly revision: typeof E5_SMALL_MODEL_REVISION;
    readonly scoringPolicyVersion: typeof E5_SELECTED_PREFIX_POLICY_VERSION;
    readonly candidateCount: 473;
    readonly queryEmbeddingCount: 473;
    readonly passageEmbeddingCount: 473;
    readonly scopeAScoreCount: 79800;
    readonly scopeBScoreCount: 29200;
    readonly totalScoreCount: 109000;
  };
  readonly controls: { readonly selectedBeforeScoring: true; readonly scopeA: 45; readonly scopeB: 15; readonly disjointFromScoreSelected: true };
  readonly scoreAvailability: Readonly<Record<MhsV2CalibrationScope, MhsV2CalibrationRegionAvailability>>;
  readonly selection: {
    readonly rowCount: 300;
    readonly scopeACount: 220;
    readonly scopeBCount: 80;
    readonly scoreSelectedCount: 240;
    readonly controlCount: 60;
    readonly reuseCap: 8;
    readonly maximumCandidateReuse: number;
    readonly candidatesAtReuseCap: readonly string[];
    readonly deterministicReplayMatched: true;
  };
  readonly membershipDigest: string;
  readonly rows: readonly MhsV2CalibrationSelectedPair[];
  readonly protections: {
    readonly rawCandidateTextIncluded: false;
    readonly internalTestContentAccessed: false;
    readonly frozen140ContentAccessed: false;
    readonly moderationLabelsUsed: false;
    readonly automaticSemanticJudgmentPerformed: false;
    readonly thresholdAuthorized: false;
    readonly semanticEdgesCreated: false;
    readonly splitMutated: false;
    readonly trainingEligibilityMutated: false;
  };
}

export type MhsV2SemanticCalibrationMembershipArtifact = MhsV2SemanticCalibrationMembershipPayload & { readonly membershipPayloadDigest: string };

const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const identityKey = (candidate: MhsV2CalibrationCandidate): string => `${candidate.namespace}::${candidate.candidateId}`;
const rank = (purpose: string, pairId: string): string => digest([MHS_V2_SEMANTIC_CALIBRATION_SEED, purpose, pairId]);
const hashRanked = <T extends { readonly pairId: string }>(values: readonly T[], purpose: string): T[] =>
  values.map((value) => ({ value, rank: rank(purpose, value.pairId) })).sort((left, right) => left.rank.localeCompare(right.rank) || left.value.pairId.localeCompare(right.value.pairId)).map(({ value }) => value);

export const mhsV2CalibrationRegion = (score: number): MhsV2CalibrationRegion | null => {
  if (!Number.isFinite(score) || score < -1 || score > 1) throw new Error("Invalid E5 calibration score");
  if (score >= 0.85) return "R1";
  if (score >= 0.84) return "R2";
  if (score >= 0.83) return "R3";
  if (score >= 0.82) return "R4";
  if (score >= 0.8) return "R5";
  if (score >= 0.78) return "R6";
  return null;
};

export const enumerateMhsV2CalibrationPairs = (
  v2: readonly MhsV2CalibrationCandidate[], historical: readonly MhsV2CalibrationCandidate[],
): Readonly<Record<MhsV2CalibrationScope, readonly MhsV2CalibrationPairIdentity[]>> => {
  if (v2.length !== 400 || historical.length !== 73 || v2.some((row) => row.namespace !== "V2") || historical.some((row) => row.namespace !== "HISTORICAL_DEVELOPMENT")) throw new Error("Calibration candidate authority count or namespace mismatch");
  if (new Set(v2.map(identityKey)).size !== 400 || new Set(historical.map(identityKey)).size !== 73) throw new Error("Duplicate calibration candidate identity");
  const a = [...v2].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const b = [...historical].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const scopeA: MhsV2CalibrationPairIdentity[] = [];
  for (let left = 0; left < a.length; left += 1) for (let right = left + 1; right < a.length; right += 1) scopeA.push({ pairId: `SCOPE_A::${a[left].candidateId}::${a[right].candidateId}`, scope: "A", candidateA: a[left], candidateB: a[right] });
  const scopeB = a.flatMap((candidateA) => b.map((candidateB): MhsV2CalibrationPairIdentity => ({ pairId: `SCOPE_B::${candidateA.candidateId}::${candidateB.candidateId}`, scope: "B", candidateA, candidateB })));
  if (scopeA.length !== 79800 || scopeB.length !== 29200 || new Set([...scopeA, ...scopeB].map((pair) => pair.pairId)).size !== 109000) throw new Error("Calibration pair universe mismatch");
  return { A: scopeA, B: scopeB };
};

const canAdd = (pair: MhsV2CalibrationPairIdentity, reuse: ReadonlyMap<string, number>): boolean =>
  (reuse.get(identityKey(pair.candidateA)) ?? 0) < MHS_V2_SEMANTIC_CALIBRATION_REUSE_CAP && (reuse.get(identityKey(pair.candidateB)) ?? 0) < MHS_V2_SEMANTIC_CALIBRATION_REUSE_CAP;
const addReuse = (pair: MhsV2CalibrationPairIdentity, reuse: Map<string, number>): void => {
  [pair.candidateA, pair.candidateB].forEach((candidate) => { const key = identityKey(candidate); reuse.set(key, (reuse.get(key) ?? 0) + 1); });
};

export const selectMhsV2CalibrationControls = (pairs: Readonly<Record<MhsV2CalibrationScope, readonly MhsV2CalibrationPairIdentity[]>>): readonly MhsV2CalibrationPairIdentity[] => {
  const reuse = new Map<string, number>(); const selected: MhsV2CalibrationPairIdentity[] = [];
  for (const [scope, quota] of [["A", 45], ["B", 15]] as const) {
    const ranked = hashRanked(pairs[scope], `C1_SCOPE_${scope}`);
    let count = 0; for (const pair of ranked) { if (count === quota) break; if (!canAdd(pair, reuse)) continue; selected.push(pair); addReuse(pair, reuse); count += 1; }
    if (count !== quota) throw new Error(`Calibration C1 underflow: scope ${scope}; required ${quota}; selected ${count}`);
  }
  return Object.freeze(selected.map((pair) => Object.freeze(pair)));
};

const inBatches = <T>(values: readonly T[], size: number): readonly T[][] => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
export const scoreMhsV2CalibrationUniverse = async (
  adapter: E5SemanticSimilarityAdapter,
  candidates: readonly MhsV2CalibrationCandidate[],
  pairs: Readonly<Record<MhsV2CalibrationScope, readonly MhsV2CalibrationPairIdentity[]>>,
): Promise<Readonly<Record<MhsV2CalibrationScope, readonly MhsV2CalibrationScoredPair[]>>> => {
  if (candidates.length !== 473 || new Set(candidates.map(identityKey)).size !== 473) throw new Error("Calibration embedding candidate count mismatch");
  await adapter.initialize(); const query = new Map<string, readonly number[]>(); const passage = new Map<string, readonly number[]>();
  for (const batch of inBatches(candidates, 16)) {
    const texts = batch.map((candidate) => candidate.text);
    const queryVectors = await adapter.embedBatch(texts, "query"); const passageVectors = await adapter.embedBatch(texts, "passage");
    batch.forEach((candidate, index) => { query.set(identityKey(candidate), queryVectors[index]); passage.set(identityKey(candidate), passageVectors[index]); });
  }
  const score = (pair: MhsV2CalibrationPairIdentity): MhsV2CalibrationScoredPair => {
    const a = identityKey(pair.candidateA), b = identityKey(pair.candidateB);
    const value = (semanticCosineSimilarity(query.get(a)!, passage.get(b)!) + semanticCosineSimilarity(query.get(b)!, passage.get(a)!)) / 2;
    return { ...pair, score: value };
  };
  return { A: pairs.A.map(score), B: pairs.B.map(score) };
};

const quota = (scope: MhsV2CalibrationScope, region: MhsV2CalibrationRegion): number => {
  if (scope === "A") return region === "R6" ? 25 : 30;
  return region === "R6" ? 15 : 10;
};
const emptyCounts = (): Record<MhsV2CalibrationStratum, number> => ({ C1: 0, R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0 });

export const selectMhsV2CalibrationPairs = (
  controls: readonly MhsV2CalibrationPairIdentity[], scored: Readonly<Record<MhsV2CalibrationScope, readonly MhsV2CalibrationScoredPair[]>>,
): MhsV2CalibrationSelectionResult => {
  if (controls.length !== 60 || scored.A.length !== 79800 || scored.B.length !== 29200) throw new Error("Calibration selection source count mismatch");
  const controlIds = new Set(controls.map((pair) => pair.pairId)); const reuse = new Map<string, number>(); const selected: MhsV2CalibrationSelectedPair[] = [];
  const selectedCounts = { A: emptyCounts(), B: emptyCounts() }; const scoredById = new Map([...scored.A, ...scored.B].map((pair) => [pair.pairId, pair]));
  const append = (pair: MhsV2CalibrationScoredPair, stratum: MhsV2CalibrationStratum): void => {
    addReuse(pair, reuse); selectedCounts[pair.scope][stratum] += 1; selected.push({ selectionOrder: selected.length + 1, pairId: pair.pairId, scope: pair.scope, stratum,
      candidateAId: pair.candidateA.candidateId, candidateATextSha256: pair.candidateA.textSha256, candidateBId: pair.candidateB.candidateId,
      candidateBTextSha256: pair.candidateB.textSha256, e5Score: Number(pair.score.toFixed(12)) });
  };
  controls.forEach((control) => { const scoredControl = scoredById.get(control.pairId); if (!scoredControl || !canAdd(scoredControl, reuse)) throw new Error("Frozen C1 identity or reuse mismatch after scoring"); append(scoredControl, "C1"); });
  const availability = {} as Record<MhsV2CalibrationScope, MhsV2CalibrationRegionAvailability>;
  for (const scope of ["A", "B"] as const) {
    const nonControls = scored[scope].filter((pair) => !controlIds.has(pair.pairId));
    const grouped = Object.fromEntries(MHS_V2_CALIBRATION_REGIONS.map((region) => [region, nonControls.filter((pair) => mhsV2CalibrationRegion(pair.score) === region)])) as Record<MhsV2CalibrationRegion, MhsV2CalibrationScoredPair[]>;
    availability[scope] = { R1: grouped.R1.length, R2: grouped.R2.length, R3: grouped.R3.length, R4: grouped.R4.length, R5: grouped.R5.length, R6: grouped.R6.length, below078: nonControls.filter((pair) => pair.score < 0.78).length };
    for (const region of MHS_V2_CALIBRATION_REGIONS) {
      const required = quota(scope, region); const ranked = grouped[region].map((pair) => ({ pair, rank: rank(`SCORE_SCOPE_${scope}_${region}`, pair.pairId) }))
        .sort((left, right) => right.pair.score - left.pair.score || left.rank.localeCompare(right.rank) || left.pair.pairId.localeCompare(right.pair.pairId)).map(({ pair }) => pair);
      const availableAfterReuseAtStart = ranked.filter((pair) => canAdd(pair, reuse)).length; let count = 0;
      for (const pair of ranked) { if (count === required) break; if (!canAdd(pair, reuse)) continue; append(pair, region); count += 1; }
      if (count !== required) throw new Error(`Calibration quota underflow: scope ${scope}; region ${region}; required ${required}; available ${ranked.length}; availableAfterReuse ${availableAfterReuseAtStart}; selected ${count}; limitingCondition ${ranked.length < required ? "SCORE_SCARCITY" : "REUSE_CAP_SCARCITY"}`);
    }
  }
  const maximumCandidateReuse = Math.max(...reuse.values()); const candidatesAtReuseCap = [...reuse.entries()].filter(([, count]) => count === MHS_V2_SEMANTIC_CALIBRATION_REUSE_CAP).map(([id]) => id).sort();
  if (selected.length !== 300 || new Set(selected.map((row) => row.pairId)).size !== 300 || maximumCandidateReuse > MHS_V2_SEMANTIC_CALIBRATION_REUSE_CAP) throw new Error("Calibration final membership invariant failed");
  return { selected, availability, selectedCounts, maximumCandidateReuse, candidatesAtReuseCap };
};

export const mhsV2CalibrationMembershipDigest = (rows: readonly MhsV2CalibrationSelectedPair[]): string => digest(rows.map((row) => ({
  pairId: row.pairId, candidateAId: row.candidateAId, candidateATextSha256: row.candidateATextSha256,
  candidateBId: row.candidateBId, candidateBTextSha256: row.candidateBTextSha256, policyArtifactSha256: MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256,
})));

export const createMhsV2SemanticCalibrationMembership = (
  policy: MhsV2SemanticCalibrationPolicyArtifact, result: MhsV2CalibrationSelectionResult, deterministicReplayMatched: boolean,
): MhsV2SemanticCalibrationMembershipArtifact => {
  validateMhsV2SemanticCalibrationPolicy(policy); if (!deterministicReplayMatched) throw new Error("Calibration deterministic replay mismatch");
  const payload: MhsV2SemanticCalibrationMembershipPayload = {
    schemaVersion: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SCHEMA, membershipVersion: MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_VERSION,
    phase: "T6L-7K-A1R-X", status: "CALIBRATION_MEMBERSHIP_PACKET_PREPARATION_COMPLETE",
    authorities: { policyArtifactSha256: MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256, policyPayloadDigest: MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST, upstreamHashes: policy.authorities },
    e5: { repository: E5_SMALL_MODEL_REPOSITORY, revision: E5_SMALL_MODEL_REVISION, scoringPolicyVersion: E5_SELECTED_PREFIX_POLICY_VERSION, candidateCount: 473, queryEmbeddingCount: 473, passageEmbeddingCount: 473, scopeAScoreCount: 79800, scopeBScoreCount: 29200, totalScoreCount: 109000 },
    controls: { selectedBeforeScoring: true, scopeA: 45, scopeB: 15, disjointFromScoreSelected: true }, scoreAvailability: result.availability,
    selection: { rowCount: 300, scopeACount: 220, scopeBCount: 80, scoreSelectedCount: 240, controlCount: 60, reuseCap: 8,
      maximumCandidateReuse: result.maximumCandidateReuse, candidatesAtReuseCap: result.candidatesAtReuseCap, deterministicReplayMatched: true },
    membershipDigest: mhsV2CalibrationMembershipDigest(result.selected), rows: result.selected,
    protections: { rawCandidateTextIncluded: false, internalTestContentAccessed: false, frozen140ContentAccessed: false, moderationLabelsUsed: false,
      automaticSemanticJudgmentPerformed: false, thresholdAuthorized: false, semanticEdgesCreated: false, splitMutated: false, trainingEligibilityMutated: false },
  };
  const artifact = { ...payload, membershipPayloadDigest: digest(payload) }; validateMhsV2SemanticCalibrationMembership(artifact); return artifact;
};

export const validateMhsV2SemanticCalibrationMembership = (artifact: MhsV2SemanticCalibrationMembershipArtifact): void => {
  const { membershipPayloadDigest, ...payload } = artifact; const serialized = canonicalJson(artifact);
  const counts = (scope: MhsV2CalibrationScope, stratum: MhsV2CalibrationStratum): number => artifact.rows.filter((row) => row.scope === scope && row.stratum === stratum).length;
  if (artifact.schemaVersion !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_SCHEMA || artifact.membershipVersion !== MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_VERSION || artifact.phase !== "T6L-7K-A1R-X"
    || artifact.authorities.policyArtifactSha256 !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256 || artifact.authorities.policyPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST
    || artifact.rows.length !== 300 || new Set(artifact.rows.map((row) => row.pairId)).size !== 300 || artifact.rows.some((row, index) => row.selectionOrder !== index + 1 || !/^[a-f0-9]{64}$/u.test(row.candidateATextSha256) || !/^[a-f0-9]{64}$/u.test(row.candidateBTextSha256))
    || counts("A", "C1") !== 45 || counts("B", "C1") !== 15 || MHS_V2_CALIBRATION_REGIONS.some((region) => counts("A", region) !== quota("A", region) || counts("B", region) !== quota("B", region))
    || artifact.selection.maximumCandidateReuse > 8 || !artifact.selection.deterministicReplayMatched || artifact.membershipDigest !== mhsV2CalibrationMembershipDigest(artifact.rows)
    || Object.values(artifact.protections).some(Boolean) || serialized.includes('"candidateAText":') || serialized.includes('"candidateBText":') || serialized.includes('"text":')
    || membershipPayloadDigest !== digest(payload)) throw new Error("Invalid MHS V2 semantic calibration membership authority");
};

const csvCell = (value: string | number): string => `"${String(value).replace(/"/gu, '""')}"`;
export const createMhsV2SemanticCalibrationReviewCsv = (
  artifact: MhsV2SemanticCalibrationMembershipArtifact, candidates: readonly MhsV2CalibrationCandidate[],
): string => {
  validateMhsV2SemanticCalibrationMembership(artifact); const byIdentity = new Map(candidates.map((candidate) => [identityKey(candidate), candidate]));
  const ordered = hashRanked(artifact.rows, "BLINDED_REVIEW_ORDER");
  const records = ordered.map((row, index) => {
    const aNamespace: MhsV2CalibrationCandidateNamespace = "V2"; const bNamespace: MhsV2CalibrationCandidateNamespace = row.scope === "A" ? "V2" : "HISTORICAL_DEVELOPMENT";
    const a = byIdentity.get(`${aNamespace}::${row.candidateAId}`), b = byIdentity.get(`${bNamespace}::${row.candidateBId}`);
    if (!a || !b || a.textSha256 !== row.candidateATextSha256 || b.textSha256 !== row.candidateBTextSha256) throw new Error("Reviewer packet candidate binding mismatch");
    return [index + 1, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PACKET_VERSION, MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256, artifact.membershipDigest,
      row.pairId, row.candidateAId, row.candidateATextSha256, a.text, row.candidateBId, row.candidateBTextSha256, b.text, "", "", "", ""];
  });
  return `${MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS.map(csvCell).join(",")}\r\n${records.map((record) => record.map(csvCell).join(",")).join("\r\n")}\r\n`;
};

export const validatePreparedMhsV2SemanticCalibrationReviewCsv = (
  csv: string, artifact: MhsV2SemanticCalibrationMembershipArtifact, candidates: readonly MhsV2CalibrationCandidate[],
): void => {
  validateMhsV2SemanticCalibrationMembership(artifact); const records = parseCsv(csv);
  const forbidden = /score|stratum|control|moderation|category|reason|split|protected|training|eligib/iu;
  if (records.length !== 300 || MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS.some((column) => forbidden.test(column))) throw new Error("Reviewer packet row count or blindness contract failed");
  const byIdentity = new Map(candidates.map((candidate) => [identityKey(candidate), candidate])); const authority = new Map(artifact.rows.map((row) => [row.pairId, row]));
  records.forEach((record, index) => {
    const actualColumns = Object.keys(record); if (actualColumns.length !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS.length || actualColumns.some((column, columnIndex) => column !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_COLUMNS[columnIndex])) throw new Error("Reviewer packet column contract failed");
    const row = authority.get(record.pair_id); if (!row || record.review_row_number !== String(index + 1) || record.packet_version !== MHS_V2_SEMANTIC_CALIBRATION_REVIEW_PACKET_VERSION
      || record.policy_artifact_sha256 !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256 || record.membership_digest !== artifact.membershipDigest
      || record.candidate_a_id !== row.candidateAId || record.candidate_a_text_sha256 !== row.candidateATextSha256 || record.candidate_b_id !== row.candidateBId || record.candidate_b_text_sha256 !== row.candidateBTextSha256
      || record.semantic_relationship_input !== "" || record.reviewer_note_input !== "" || record.reviewer_id_input !== "" || record.reviewed_at_input !== "") throw new Error("Reviewer packet immutable binding or blank-input contract failed");
    const a = byIdentity.get(`V2::${row.candidateAId}`), b = byIdentity.get(`${row.scope === "A" ? "V2" : "HISTORICAL_DEVELOPMENT"}::${row.candidateBId}`);
    if (!a || !b || record.candidate_a_text !== a.text || record.candidate_b_text !== b.text || sha256(Buffer.from(record.candidate_a_text, "utf8")) !== row.candidateATextSha256 || sha256(Buffer.from(record.candidate_b_text, "utf8")) !== row.candidateBTextSha256) throw new Error("Reviewer packet exact text binding failed");
  });
};

export const publishMhsV2SemanticCalibrationPacket = (artifact: MhsV2SemanticCalibrationMembershipArtifact, csv: string, outputDirectory: string): { readonly membershipPath: string; readonly reviewPath: string } => {
  validateMhsV2SemanticCalibrationMembership(artifact); const membership = canonicalJson(artifact); fs.mkdirSync(outputDirectory, { recursive: true });
  const membershipPath = path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_MEMBERSHIP_FILENAME), reviewPath = path.join(outputDirectory, MHS_V2_SEMANTIC_CALIBRATION_REVIEW_FILENAME);
  if (fs.existsSync(membershipPath) || fs.existsSync(reviewPath)) throw new Error("MHS V2 semantic calibration membership or review packet exists; overwrite refused");
  const token = `${process.pid}-${Date.now()}`; const membershipTemporary = `${membershipPath}.${token}.partial`, reviewTemporary = `${reviewPath}.${token}.partial`;
  try {
    fs.writeFileSync(membershipTemporary, membership, { encoding: "utf8", flag: "wx" }); fs.writeFileSync(reviewTemporary, csv, { encoding: "utf8", flag: "wx" });
    fs.renameSync(membershipTemporary, membershipPath); fs.renameSync(reviewTemporary, reviewPath);
    if (fs.readFileSync(membershipPath, "utf8") !== membership || fs.readFileSync(reviewPath, "utf8") !== csv) throw new Error("Incomplete MHS V2 semantic calibration packet publication");
    return { membershipPath, reviewPath };
  } catch (error) {
    for (const [filename, expected] of [[membershipPath, membership], [reviewPath, csv]] as const) if (fs.existsSync(filename) && fs.readFileSync(filename, "utf8") === expected) fs.rmSync(filename, { force: true });
    throw error;
  } finally { fs.rmSync(membershipTemporary, { force: true }); fs.rmSync(reviewTemporary, { force: true }); }
};
