import path from "node:path";
import { readMhsAnnotationRows } from "../research/textModerationDataset/mhsAcquisition";
import {
  buildMhsV2ExpansionCandidateAcquisition, MHS_V2_EXPANSION_ACQUISITION_FILENAME,
  MHS_V2_EXPANSION_CANDIDATE_FILENAME, publishMhsV2ExpansionPair, recomputeMhsSourceRows,
  summarizeV2CandidateDistributions, verifyMhsV2ExpansionAuthorities,
} from "../research/textModerationDataset/mhsV2ExpansionCandidateAcquisition";

const main = async (): Promise<void> => {
  const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
  const paths = { design: path.join(mhs, "expansion/mhs-train-expansion-design-v1.json"), proposal: path.join(mhs, "expansion/mhs-train-expansion-tranche-proposal-v1.json"), acquisitionManifest: path.resolve(root, "dataset-research/text-moderation/acquisition-manifest.json"), parentTranche: path.join(mhs, "mhs-review-tranche-v1.jsonl"), sourceArtifact: path.join(mhs, "train-00000-of-00001.parquet"), provenanceStaging: path.join(mhs, "provenance-staging.jsonl"), currentCandidate: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"), currentCandidateIntegrity: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1-integrity-audit.json"), splitManifest: path.join(mhs, "splits/mhs-split-manifest-v1.json"), internalTestFreeze: path.join(mhs, "splits/mhs-internal-test-freeze-v1.json") };
  const authorities = verifyMhsV2ExpansionAuthorities(paths);
  const annotations = await readMhsAnnotationRows(paths.sourceArtifact);
  const sourceRows = recomputeMhsSourceRows(annotations, new Date().toISOString());
  const artifacts = buildMhsV2ExpansionCandidateAcquisition(authorities.proposal, authorities.parent, sourceRows, authorities.currentIntegrity, new Date().toISOString());
  const published = publishMhsV2ExpansionPair(artifacts.candidate, artifacts.acquisition, path.join(mhs, "expansion/candidates"));
  console.log(JSON.stringify({ candidatePath: published.candidatePath, acquisitionPath: published.acquisitionPath, candidateFilename: MHS_V2_EXPANSION_CANDIDATE_FILENAME, acquisitionFilename: MHS_V2_EXPANSION_ACQUISITION_FILENAME, candidateCount: artifacts.candidate.candidateCount, statusCounts: artifacts.acquisition.statusCounts, distributions: summarizeV2CandidateDistributions(artifacts.candidate.rows), acquisitionDecision: artifacts.acquisition.acquisitionDecision, blocker: artifacts.acquisition.blocker, exactNextPhase: artifacts.acquisition.exactNextPhase }, null, 2));
};

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
