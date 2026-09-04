import { readFile, mkdir, writeFile } from "node:fs/promises";
import { classifyY4EMedia, evaluateY4EPolicy, summarizeY4EProfile, type Y4EMediaEvidence } from "../evaluation/y4ProfileMediaPolicy.service";

const [sourcePath, outputPath, countRaw] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw new Error("Usage: evaluate-y4-policy <y4c-report> <output> [profiles-per-family]");
if (process.env.NODE_ENV === "production") throw new Error("Y4E evaluation is development-only");
const perFamily = Number(countRaw ?? 30); if (!Number.isInteger(perFamily) || perFamily < 2) throw new Error("profiles-per-family must be an integer >= 2");
type Row = { sampleId: string; scenario: string; status: string; media: Array<{ status: "NO_FACE" | "NO_USABLE_FACE" | "MEDIA_READ_FAILED" | "FACE_CANDIDATES_AVAILABLE"; candidateCount: number; bestCandidate?: { medianSimilarity: number }; bestVsSecondMargin?: number }> };
const evidence = (row: Row): Y4EMediaEvidence => { const media = row.media[0]; return classifyY4EMedia({ status: media.status, candidateCount: media.candidateCount, bestScore: media.bestCandidate?.medianSimilarity, margin: media.bestVsSecondMargin }); };
const virtual = (state: "FACE_NOT_PRESENT" | "TECHNICALLY_UNUSABLE" | "IDENTITY_AMBIGUOUS"): Y4EMediaEvidence => state === "FACE_NOT_PRESENT" ? { state } : state === "TECHNICALLY_UNUSABLE" ? { state } : { state, bestScore: .5, margin: .01 };
const policies = {
  ANY_STRONG_MATCH: { minimumUsable: 1, minimumMatches: 1, matchRatio: 0, mismatchRatioForLikelyMismatch: 1, requireNoMismatch: false },
  MIN_MATCH_2: { minimumUsable: 2, minimumMatches: 2, matchRatio: 0, mismatchRatioForLikelyMismatch: 1, requireNoMismatch: false },
  RATIO_067: { minimumUsable: 2, minimumMatches: 1, matchRatio: .67, mismatchRatioForLikelyMismatch: 1, requireNoMismatch: false },
  COUNT_2_RATIO_067: { minimumUsable: 2, minimumMatches: 2, matchRatio: .67, mismatchRatioForLikelyMismatch: 1, requireNoMismatch: false },
  CONFLICT_REVIEW: { minimumUsable: 2, minimumMatches: 2, matchRatio: .67, mismatchRatioForLikelyMismatch: 1, requireNoMismatch: true },
};
const semantics = (family: string) => family.startsWith("GENUINE") ? "GENUINE" : family.startsWith("IMPERSONATION") ? "IMPERSONATION" : family === "LOW_EVIDENCE_PROFILE" ? "INSUFFICIENT" : "CONFLICTING";
(async () => {
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as { results: Row[] };
  const completed = source.results.filter(row => row.status === "COMPLETED");
  const same = completed.filter(row => row.scenario === "SINGLE_SAME").map(evidence);
  const group = completed.filter(row => row.scenario === "MULTI_TARGET_PRESENT").map(evidence);
  const different = completed.filter(row => row.scenario === "SINGLE_DIFFERENT").map(evidence);
  const absent = completed.filter(row => row.scenario === "MULTI_TARGET_ABSENT").map(evidence);
  const at = (list: Y4EMediaEvidence[], index: number) => list[index % list.length];
  const families: Record<string, (i:number)=>Y4EMediaEvidence[]> = {
    GENUINE_CLEAN: i => [at(same,i),at(same,i+1),at(same,i+2),at(same,i+3)],
    GENUINE_WITH_NO_FACE_MEDIA: i => [at(same,i),at(same,i+1),at(same,i+2),virtual("FACE_NOT_PRESENT")],
    GENUINE_WITH_DIFFICULT_MEDIA: i => [at(same,i),at(same,i+1),at(group,i),virtual("FACE_NOT_PRESENT")],
    GENUINE_GROUP_MEDIA: i => [at(same,i),at(group,i),at(group,i+1),at(same,i+1)],
    MIXED_SINGLE_FOREIGN_IMAGE: i => [at(same,i),at(same,i+1),at(same,i+2),at(different,i)],
    MIXED_MULTIPLE_FOREIGN_IMAGES: i => [at(same,i),at(same,i+1),at(different,i),at(absent,i)],
    IMPERSONATION_ALL_DIFFERENT: i => [at(different,i),at(different,i+1),at(different,i+2),at(different,i+3)],
    IMPERSONATION_GROUP_TARGET_ABSENT: i => [at(absent,i),at(absent,i+1),at(absent,i+2),at(absent,i+3)],
    LOW_EVIDENCE_PROFILE: i => [virtual("FACE_NOT_PRESENT"),virtual("TECHNICALLY_UNUSABLE"),virtual("IDENTITY_AMBIGUOUS"),i % 2 ? virtual("FACE_NOT_PRESENT") : virtual("TECHNICALLY_UNUSABLE")],
    CONTRADICTORY_PROFILE: i => i % 3 === 0 ? [at(same,i),at(same,i+1),at(different,i),at(absent,i)] : i % 3 === 1 ? [at(same,i),at(same,i+1),at(same,i+2),at(different,i)] : [at(same,i),at(different,i),at(different,i+1),at(absent,i)],
  };
  const profiles = Object.entries(families).flatMap(([family, build]) => Array.from({ length: perFamily }, (_, index) => { const media = build(index); const summary = summarizeY4EProfile(media); return { scenarioId: `Y4E_${family}_${String(index + 1).padStart(4,"0")}`, family, semantic: semantics(family), evidence: summary, perMediaStates: media.map(item => item.state), policies: Object.fromEntries(Object.entries(policies).map(([name, policy]) => [name, evaluateY4EPolicy(summary, policy)])) }; }));
  const outcomes = Object.fromEntries(Object.keys(policies).map(name => [name, Object.fromEntries(["GENUINE", "IMPERSONATION", "CONFLICTING", "INSUFFICIENT"].map(semantic => {
    const rows = profiles.filter(row => row.semantic === semantic);
    return [semantic, { total: rows.length, likelyMatch: rows.filter(row => row.policies[name] === "LIKELY_MATCH").length, likelyMismatch: rows.filter(row => row.policies[name] === "LIKELY_MISMATCH").length, review: rows.filter(row => row.policies[name] === "AMBIGUOUS_OR_INSUFFICIENT").length }];
  }))]));
  await mkdir(outputPath.slice(0, Math.max(outputPath.lastIndexOf("/"), outputPath.lastIndexOf("\\"))), { recursive: true });
  await writeFile(outputPath, JSON.stringify({ schemaVersion:"STHN_Y4E_PROFILE_POLICY_REPORT_V1", perMediaPolicy:{membershipThreshold:.36,multiFaceMargin:.04}, requested:profiles.length, profiles, outcomes },null,2));
})().catch(error=>{console.error(error instanceof Error?error.stack??error.message:String(error));process.exitCode=1});
