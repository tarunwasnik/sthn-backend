import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "../research/textModerationDataset/manifest";
import { MHS_DEVELOPMENT_PROJECTION_MANIFEST_FILENAME, MHS_DEVELOPMENT_PROJECTION_FILENAME, readMhsDevelopmentProjection } from "../research/textModerationDataset/mhsDevelopmentProjection";
import { MHS_V2_EXPANSION_CANDIDATE_FILENAME, MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST, MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST, MHS_V2_EXPANSION_CANDIDATE_SHA256, MhsV2ExpansionCandidateArtifact } from "../research/textModerationDataset/mhsV2ExpansionCandidateAcquisition";
import {
  MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_HASHES, MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME,
  MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST, MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256,
  MhsV2SemanticCalibrationPolicyArtifact, validateMhsV2SemanticCalibrationPolicy,
} from "../research/textModerationDataset/mhsV2SemanticCalibrationPolicy";
import {
  MhsV2CalibrationCandidate, createMhsV2SemanticCalibrationMembership, createMhsV2SemanticCalibrationReviewCsv,
  enumerateMhsV2CalibrationPairs, publishMhsV2SemanticCalibrationPacket, scoreMhsV2CalibrationUniverse,
  selectMhsV2CalibrationControls, selectMhsV2CalibrationPairs, validatePreparedMhsV2SemanticCalibrationReviewCsv,
} from "../research/textModerationDataset/mhsV2SemanticCalibrationExecution";
import { E5SemanticSimilarityAdapter } from "../research/textModerationDataset/semanticSimilarity/e5SemanticSimilarityAdapter";

interface NodeRuntimeCertification { readonly executionProvider: string; readonly inputNames: readonly string[]; readonly outputNames: readonly string[]; readonly hiddenDimension: number; readonly dynamicBatchPassed: boolean; readonly dynamicSequencePassed: boolean; readonly tokenizerDeterministic: boolean; readonly status: string; readonly frozenBenchmarkAccessed: boolean }

const root = process.cwd(); const mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
const output = path.join(mhs, "expansion/semantic-calibration");
const semanticRoot = path.resolve(root, "evaluation-cache/text-moderation/semantic/intfloat-multilingual-e5-small/053834db62d809d8f124a76b687fbd948e13ef3e");
const authorityPaths = {
  v2Candidate: path.join(mhs, "expansion/candidates/mhs-v2-expansion-candidates-v1.json"), reviewUniverse: path.join(mhs, "expansion/review/mhs-v2-expansion-review-universe-v1.json"), operationalPlan: path.join(mhs, "expansion/review/mhs-v2-expansion-review-batch-plan-v1.json"), consolidation: path.join(mhs, "expansion/certification/mhs-v2-expansion-consolidation-certification-v1.json"),
  e5Contract: path.resolve(root, "src/research/textModerationDataset/semanticSimilarity/E5_SMALL_SEMANTIC_CONTRACT.md"), e5ExportManifest: path.join(semanticRoot, "STHN_E5_SMALL_ONNX_EXPORT_MANIFEST.json"), e5RuntimeCertification: path.join(semanticRoot, "certification/node-runtime-certification.json"),
  gSemanticAudit: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1-semantic-audit.json"), hManifest: path.join(mhs, "semantic-review/mhs-semantic-review-v1-internal-manifest.json"), hValidated: path.join(mhs, "semantic-review/mhs-semantic-review-v1-validated-reviewer-a.json"), hAnalysis: path.join(mhs, "semantic-review/mhs-semantic-review-v1-precision-analysis.json"),
  jManifest: path.join(mhs, "semantic-review/mhs-semantic-boundary-review-v1-internal-manifest.json"), jValidated: path.join(mhs, "semantic-review/mhs-semantic-boundary-review-v1-validated-reviewer-a.json"), jAnalysis: path.join(mhs, "semantic-review/mhs-semantic-boundary-review-v1-analysis.json"), lAuthorization: path.join(mhs, "semantic-review/mhs-semantic-review-floor-0.85-authorization-v1.json"), lReplay: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1-semantic-audit-review-floor-0.85-v1.json"),
  developmentProjectionManifest: path.join(mhs, `development/${MHS_DEVELOPMENT_PROJECTION_MANIFEST_FILENAME}`), developmentProjection: path.join(mhs, `development/${MHS_DEVELOPMENT_PROJECTION_FILENAME}`), splitManifest: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreezeMetadata: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json"), frozen140Artifact: path.resolve(root, "src/evaluation/textModeration/textModerationFixtures.ts"),
};
const policyPath = path.join(output, MHS_V2_SEMANTIC_CALIBRATION_POLICY_FILENAME);
const shaFile = (filename: string): string => sha256(fs.readFileSync(filename));

const main = async (): Promise<void> => {
  const before = Object.fromEntries(Object.entries(authorityPaths).map(([key, filename]) => [key, shaFile(filename)]));
  if (canonicalJson(before) !== canonicalJson(MHS_V2_SEMANTIC_CALIBRATION_EXPECTED_HASHES)) throw new Error("A1R-X frozen authority hash mismatch before scoring");
  const policyBytes = fs.readFileSync(policyPath); if (sha256(policyBytes) !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_SHA256) throw new Error("A1R-X policy artifact SHA mismatch");
  const policy = JSON.parse(policyBytes.toString("utf8")) as MhsV2SemanticCalibrationPolicyArtifact;
  if (policy.policyPayloadDigest !== MHS_V2_SEMANTIC_CALIBRATION_POLICY_PAYLOAD_DIGEST) throw new Error("A1R-X policy payload digest mismatch"); validateMhsV2SemanticCalibrationPolicy(policy);
  const runtime = JSON.parse(fs.readFileSync(authorityPaths.e5RuntimeCertification, "utf8")) as NodeRuntimeCertification;
  if (runtime.status !== "PASSED" || runtime.executionProvider !== "cpu" || runtime.inputNames.join(",") !== "input_ids,attention_mask" || runtime.outputNames.join(",") !== "last_hidden_state" || runtime.hiddenDimension !== 384 || !runtime.dynamicBatchPassed || !runtime.dynamicSequencePassed || !runtime.tokenizerDeterministic || runtime.frozenBenchmarkAccessed) throw new Error("A1R-X E5 runtime certification invalid");
  const v2Bytes = fs.readFileSync(authorityPaths.v2Candidate); if (sha256(v2Bytes) !== MHS_V2_EXPANSION_CANDIDATE_SHA256) throw new Error("A1R-X V2 candidate SHA mismatch");
  const v2Artifact = JSON.parse(v2Bytes.toString("utf8")) as MhsV2ExpansionCandidateArtifact;
  if (v2Artifact.candidateCount !== 400 || v2Artifact.rows.length !== 400 || v2Artifact.candidatePayloadDigest !== MHS_V2_EXPANSION_CANDIDATE_PAYLOAD_DIGEST || v2Artifact.membershipDigest !== MHS_V2_EXPANSION_CANDIDATE_MEMBERSHIP_DIGEST || new Set(v2Artifact.rows.map((row) => row.candidateId)).size !== 400 || v2Artifact.rows.some((row) => sha256(Buffer.from(row.text, "utf8")) !== row.exactTextDigest)) throw new Error("A1R-X V2 candidate authority invalid");
  const historicalRows = readMhsDevelopmentProjection(authorityPaths.developmentProjection, authorityPaths.developmentProjectionManifest, {
    splitManifestPath: authorityPaths.splitManifest, internalTestFreezePath: authorityPaths.internalTestFreezeMetadata,
    releaseManifestPath: path.join(mhs, "release/mhs-release-manifest-v1.json"), eligibilityManifestPath: path.join(mhs, "release/mhs-training-eligibility-manifest-v1.json"),
  });
  const v2: MhsV2CalibrationCandidate[] = v2Artifact.rows.map((row) => ({ namespace: "V2", candidateId: row.candidateId, textSha256: row.exactTextDigest, text: row.text }));
  const historical: MhsV2CalibrationCandidate[] = historicalRows.map((row) => ({ namespace: "HISTORICAL_DEVELOPMENT", candidateId: row.exampleId, textSha256: row.candidateTextDigest, text: row.text }));
  const candidates = [...v2, ...historical]; const pairs = enumerateMhsV2CalibrationPairs(v2, historical);
  const controls = selectMhsV2CalibrationControls(pairs); // Frozen before adapter initialization or score creation.
  const scored = await scoreMhsV2CalibrationUniverse(new E5SemanticSimilarityAdapter(), candidates, pairs);
  const selected = selectMhsV2CalibrationPairs(controls, scored); const replay = selectMhsV2CalibrationPairs(controls, scored);
  const replayMatched = canonicalJson(selected) === canonicalJson(replay); const artifact = createMhsV2SemanticCalibrationMembership(policy, selected, replayMatched);
  const csv = createMhsV2SemanticCalibrationReviewCsv(artifact, candidates); validatePreparedMhsV2SemanticCalibrationReviewCsv(csv, artifact, candidates);
  const published = publishMhsV2SemanticCalibrationPacket(artifact, csv, output);
  const after = Object.fromEntries(Object.entries(authorityPaths).map(([key, filename]) => [key, shaFile(filename)])); if (canonicalJson(before) !== canonicalJson(after)) throw new Error("A1R-X mutated an upstream authority");
  console.log(canonicalJson({ ...published, membershipSha256: shaFile(published.membershipPath), membershipPayloadDigest: artifact.membershipPayloadDigest,
    membershipDigest: artifact.membershipDigest, reviewPacketSha256: shaFile(published.reviewPath), scoreAvailability: artifact.scoreAvailability,
    selection: artifact.selection, upstreamHashesBefore: before, upstreamHashesAfter: after }));
};

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
