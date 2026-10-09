import fs from "node:fs";
import path from "node:path";

import { validateTextModerationFixtures } from "../../evaluation/textModeration/textModerationEvaluation.service";
import { canonicalJson, sha256 } from "./manifest";
import { MhsCandidateAdmissionArtifact, validateMhsCandidateAdmissionArtifact } from "./mhsCandidateAdmission";
import { MHS_CANDIDATE_ARTIFACT_SHA256 } from "./mhsCandidateIntegrityAudit";
import { authorizeMhsDatasetAccess, MhsInternalTestFreezeArtifact, validateMhsInternalTestFreezeArtifact } from "./mhsInternalTestFreeze";
import { MhsSplitManifestArtifact, validateMhsSplitManifestArtifact } from "./mhsSplitManifest";

export const MHS_V2_INTERNAL_TEST_SOURCE_COUNT = 13 as const;
export const MHS_V2_BENCHMARK_SOURCE_COUNT = 140 as const;
export const MHS_V2_BENCHMARK_SOURCE_VERSION = "STHN_TEXT_MODERATION_FIXTURES_V1R" as const;
export const MHS_V2_BENCHMARK_SOURCE_SHA256 = "42f2d9dc5e4df6711f73b2c636ffff7085f45cfcd378e421e3d94e7acc967747" as const;
export const MHS_V2_EVALUATION_OUTPUT_ROOT = "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-first-controlled-evaluation-v1" as const;

export type MhsV2ProtectedEvaluationSource = "INTERNAL_TEST" | "EXTERNAL_BENCHMARK";
export interface MhsV2ProtectedEvaluationRow {
  readonly source: MhsV2ProtectedEvaluationSource; readonly exampleId: string; readonly text: string;
  readonly textSha256: string; readonly trueDecision: "ALLOW" | "BLOCK"; readonly trueTarget: 0 | 1;
  readonly metadata: Readonly<Record<string, unknown>>;
}

const readJson = <T>(filename: string): T => JSON.parse(fs.readFileSync(filename, "utf8")) as T;
const exactSha = (filename: string, expected: string, label: string): void => {
  if (sha256(fs.readFileSync(filename)) !== expected) throw new Error(`${label} authority mismatch`);
};

const requireExposure = (backend: string, source: MhsV2ProtectedEvaluationSource): void => {
  const output = path.resolve(backend, MHS_V2_EVALUATION_OUTPUT_ROOT), ledger = path.join(output, "run/protected-exposure-ledger.jsonl");
  if (!output.startsWith(path.resolve(backend) + path.sep) || !fs.existsSync(ledger)) throw new Error("Protected source access requires initialized authorized lifecycle");
  const events = fs.readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  const expected = source === "INTERNAL_TEST" ? "INTERNAL_TEST_ACCESS_STARTED" : "EXTERNAL_BENCHMARK_ACCESS_STARTED";
  if (!events.some((event) => event.event === expected && event.source === source)) throw new Error(`Protected exposure was not durably recorded for ${source}`);
};

export const loadAuthorizedInternalTestRows = (backend = process.cwd()): readonly MhsV2ProtectedEvaluationRow[] => {
  requireExposure(backend, "INTERNAL_TEST");
  const mhs = path.resolve(backend, "dataset-research/text-moderation/MEASURING_HATE_SPEECH"), freezePath = path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), splitPath = path.join(mhs, "splits/mhs-split-manifest-v1.json"), candidatePath = path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json");
  exactSha(freezePath, "11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36", "INTERNAL_TEST freeze");
  exactSha(splitPath, "f9f2598cd63da5a64997c7741461b76ac738db0f41b9be44ba75822cb1deb37f", "split manifest");
  exactSha(candidatePath, MHS_CANDIDATE_ARTIFACT_SHA256, "historical candidate");
  const freeze = readJson<MhsInternalTestFreezeArtifact>(freezePath), split = readJson<MhsSplitManifestArtifact>(splitPath), candidate = readJson<MhsCandidateAdmissionArtifact>(candidatePath);
  validateMhsInternalTestFreezeArtifact(freeze); validateMhsSplitManifestArtifact(split); validateMhsCandidateAdmissionArtifact(candidate);
  const byId = new Map(candidate.rows.map((row) => [row.sourceRowId, row]));
  const rows = freeze.candidateIdentityIndex.map((identity): MhsV2ProtectedEvaluationRow => {
    const access = authorizeMhsDatasetAccess(identity.candidateId, "FINAL_INTERNAL_EVALUATION_ACCESS", split, freeze, { explicitFinalEvaluationAuthorization: true }), row = byId.get(identity.candidateId);
    if (!access.allowed || !access.candidateContentAccess || !row?.candidateAdmitted || !row.reviewedText || row.textDigest !== identity.textDigest || sha256(Buffer.from(row.reviewedText, "utf8")) !== identity.textDigest || !["ALLOW", "BLOCK"].includes(row.reviewerDecision)) throw new Error(`Invalid authorized INTERNAL_TEST row ${identity.candidateId}`);
    const decision = row.reviewerDecision as "ALLOW" | "BLOCK";
    return { source: "INTERNAL_TEST", exampleId: identity.candidateId, text: row.reviewedText, textSha256: identity.textDigest, trueDecision: decision, trueTarget: decision === "ALLOW" ? 0 : 1, metadata: { ...(row.primaryCategory ? { primaryCategory: row.primaryCategory } : {}) } };
  });
  if (rows.length !== 13 || new Set(rows.map((row) => row.exampleId)).size !== 13 || rows.filter((row) => row.trueDecision === "ALLOW").length !== 9 || rows.filter((row) => row.trueDecision === "BLOCK").length !== 4) throw new Error("INTERNAL_TEST source count or distribution mismatch");
  return rows;
};

export const loadAuthorizedExternalBenchmarkRows = (backend = process.cwd()): readonly MhsV2ProtectedEvaluationRow[] => {
  requireExposure(backend, "EXTERNAL_BENCHMARK");
  const sourcePath = path.resolve(backend, "src/evaluation/textModeration/textModerationFixtures.ts");
  exactSha(sourcePath, MHS_V2_BENCHMARK_SOURCE_SHA256, "external benchmark");
  // Deliberately lazy: no import-time, preflight, self-test, or preparation access.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fixtureModule = require("../../evaluation/textModeration/textModerationFixtures") as typeof import("../../evaluation/textModeration/textModerationFixtures");
  if (fixtureModule.TEXT_MODERATION_FIXTURE_VERSION !== MHS_V2_BENCHMARK_SOURCE_VERSION) throw new Error("External benchmark version mismatch");
  validateTextModerationFixtures(fixtureModule.textModerationEvaluationFixtures);
  const rows = fixtureModule.textModerationEvaluationFixtures.map((fixture): MhsV2ProtectedEvaluationRow => ({
    source: "EXTERNAL_BENCHMARK", exampleId: fixture.id, text: fixture.text, textSha256: sha256(Buffer.from(fixture.text, "utf8")),
    trueDecision: fixture.expectedDecision, trueTarget: fixture.expectedDecision === "ALLOW" ? 0 : 1,
    metadata: { domain: fixture.domain, target: fixture.target, difficulty: fixture.difficulty, language: fixture.language, tags: fixture.tags, ...(fixture.expectedCategory ? { expectedCategory: fixture.expectedCategory } : {}) },
  }));
  if (rows.length !== 140 || new Set(rows.map((row) => row.exampleId)).size !== 140) throw new Error("External benchmark source count or identity mismatch");
  return rows;
};

export const serializeProtectedRowsForPipe = (rows: readonly MhsV2ProtectedEvaluationRow[]): string => canonicalJson(rows);
