import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson } from "../../research/textModerationDataset/manifest";
import {
  MHS_V2_SUCCESSOR_PROVENANCE_FILENAME,
  MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST,
  MHS_V2_SUCCESSOR_PROVENANCE_SHA256,
  MhsV2SuccessorProvenanceArtifact,
  createMhsV2SuccessorProvenanceRecovery,
  defaultMhsV2SuccessorProvenancePaths,
  publishMhsV2SuccessorProvenanceRecovery,
  sha256FileStreaming,
  validateMhsV2SuccessorProvenanceRecovery,
} from "../../research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery";

const root = process.cwd(), paths = defaultMhsV2SuccessorProvenancePaths(root), training = path.dirname(paths.preparation);
const artifactPath = path.join(training, MHS_V2_SUCCESSOR_PROVENANCE_FILENAME);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as MhsV2SuccessorProvenanceArtifact;
const sha = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const authorities = artifact.authorities, findings = artifact.findings, classes = artifact.evidenceClassification, decision = artifact.decision, waiver = artifact.waiver;

const checks: readonly [string, () => void][] = [
  ["01 artifact validates", () => assert.doesNotThrow(() => validateMhsV2SuccessorProvenanceRecovery(artifact))],
  ["02 status requires explicit waiver", () => assert.equal(artifact.status, "WAIVER_REQUIRES_EXPLICIT_AUTHORIZATION")],
  ["03 artifact SHA exact", () => assert.equal(sha256FileStreaming(artifactPath), MHS_V2_SUCCESSOR_PROVENANCE_SHA256)],
  ["04 payload digest exact", () => assert.equal(artifact.recoveryPayloadDigest, MHS_V2_SUCCESSOR_PROVENANCE_PAYLOAD_DIGEST)],
  ["05 canonical publication", () => assert.equal(fs.readFileSync(artifactPath, "utf8"), canonicalJson(artifact))],
  ["06 run manifest SHA", () => assert.equal((authorities.completedRun as Record<string, unknown>).manifestSha256, "b7d90bef68fd3c72242c39fb299a59f67af097d6820b4c302280666117ccffac")],
  ["07 run manifest payload", () => assert.equal((authorities.completedRun as Record<string, unknown>).manifestPayloadDigest, "d7ddb001bdc817cf14ba0f8516dacaed08e69d069d5eefe5a7243841c640059b")],
  ["08 lifecycle SHA and status", () => assert.deepEqual([(authorities.completedRun as Record<string, unknown>).lifecycleSha256, (authorities.completedRun as Record<string, unknown>).lifecycleStatus], ["47ae7ead37a2c71ff0db6d802acf5ff25ed327c4cac8255a4160f2040ef9fab9", "COMPLETED"])],
  ["09 result summary SHA", () => assert.equal((authorities.completedRun as Record<string, unknown>).resultSummarySha256, "8f0c65c47cfa7d3db43e6fd1738f8e057924fb59b3664a5e4cc32be587fb372e")],
  ["10 preparation SHA", () => assert.equal((authorities.preparation as Record<string, unknown>).sha256, "61c8aaaa0f05330638c880a4cd017d6504509458939d28cb4562d5d3bc151c6f")],
  ["11 expected runner SHA", () => assert.equal((authorities.preparation as Record<string, unknown>).runnerSha256, "2a6fc2a2f36796a4e1845d07edacf9c7e54e8bc24291838ef51733c7942c25ed")],
  ["12 expected model implementation SHA", () => assert.equal((authorities.preparation as Record<string, unknown>).modelImplementationSha256, "f60e9d29e16ce9f8da7ea3c573daae793f0a5723ae9bd725807bfb2861177831")],
  ["13 preparation binding absent", () => assert.equal(artifact.missingDirectBindings.preparationSha256, null)],
  ["14 runner binding absent", () => assert.equal(artifact.missingDirectBindings.runnerSha256, null)],
  ["15 model binding absent", () => assert.equal(artifact.missingDirectBindings.modelImplementationSha256, null)],
  ["16 completed run to preparation insufficient", () => assert.equal(classes.completedRunToPreparation, "INSUFFICIENT")],
  ["17 configuration is structural", () => assert.equal(classes.matchingConfigurationAndBehavior, "DURABLE_STRUCTURAL")],
  ["18 package command corroborating", () => assert.equal(classes.packageCommand, "CORROBORATING_ONLY")],
  ["19 terminal capture corroborating", () => assert.equal(classes.terminalCapture, "CORROBORATING_ONLY")],
  ["20 current hashes corroborating", () => assert.equal(classes.currentSourceHashes, "CORROBORATING_ONLY")],
  ["21 no false runner proof", () => assert.equal(findings.exactExecutedRunnerBytesProven, false)],
  ["22 no false model proof", () => assert.equal(findings.exactExecutedModelImplementationBytesProven, false)],
  ["23 no chained path", () => assert.equal(findings.cryptographicChainedPathExists, false)],
  ["24 run internally consistent", () => assert.equal(findings.completedRunInternallyConsistent, true)],
  ["25 no tampering evidence", () => assert.equal(findings.evidenceOfTampering, false)],
  ["26 certification inadmissible", () => assert.equal(decision.certificationAdmissible, false)],
  ["27 waiver needed", () => assert.equal(decision.waiverNeededToProceed, true)],
  ["28 waiver not issued", () => assert.equal(waiver.issued, false)],
  ["29 explicit authorization required", () => assert.equal(waiver.requiresExplicitUserAuthorization, true)],
  ["30 auxiliary diagnostics absent", () => assert.deepEqual([artifact.limitations.auxiliaryComponentLossesPersisted, artifact.limitations.auxiliaryMetricsPersisted], [false, false])],
  ["31 trainer values terminal only", () => assert.equal((artifact.limitations.trainerRuntimeSeconds as Record<string, unknown>).classification, "TERMINAL_ONLY_CORROBORATING")],
  ["32 certification counters zero", () => assert.ok(Object.values(artifact.boundaries).every((value) => value === 0))],
  ["33 exact upstream files still match", () => assert.deepEqual([sha256FileStreaming(paths.manifest), sha256FileStreaming(paths.lifecycle), sha256FileStreaming(paths.resultSummary)], ["b7d90bef68fd3c72242c39fb299a59f67af097d6820b4c302280666117ccffac", "47ae7ead37a2c71ff0db6d802acf5ff25ed327c4cac8255a4160f2040ef9fab9", "8f0c65c47cfa7d3db43e6fd1738f8e057924fb59b3664a5e4cc32be587fb372e"])],
];
for (const [name, check] of checks) test(name, check);

test("34 deterministic reconstruction equals publication", () => assert.equal(canonicalJson(createMhsV2SuccessorProvenanceRecovery(paths)), fs.readFileSync(artifactPath, "utf8")));
test("35 modified decision rejected", () => { const clone = structuredClone(artifact); (clone.decision as Record<string, unknown>).certificationAdmissible = true; assert.throws(() => validateMhsV2SuccessorProvenanceRecovery(clone), /payload|decision/u); });
test("36 false direct binding rejected", () => { const clone = structuredClone(artifact); (clone.missingDirectBindings as Record<string, unknown>).runnerSha256 = "0".repeat(64); assert.throws(() => validateMhsV2SuccessorProvenanceRecovery(clone), /payload|boundary/u); });
test("37 publication replay refused", () => assert.throws(() => publishMhsV2SuccessorProvenanceRecovery(artifact, training), /overwrite refused/u));
test("38 failed publication rolls back", () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-8e-d0-")); try { assert.throws(() => publishMhsV2SuccessorProvenanceRecovery(artifact, directory, () => { throw new Error("injected"); }), /injected/u); assert.equal(fs.existsSync(path.join(directory, MHS_V2_SUCCESSOR_PROVENANCE_FILENAME)), false); } finally { fs.rmSync(directory, { recursive: true, force: true }); } });
test("39 implementation contains no ML execution", () => { const source = fs.readFileSync(path.resolve(root, "src/research/textModerationDataset/mhsV2SuccessorTrainingProvenanceRecovery.ts"), "utf8"); assert.doesNotMatch(source, /from_pretrained|AutoModel|trainer\.train|trainer\.evaluate|torch/iu); });
