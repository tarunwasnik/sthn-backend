import path from "node:path";
import { buildMhsTrainExpansionTrancheProposal, MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_FILENAME, ProposalPaths, publishMhsTrainExpansionTrancheProposal, serializeMhsTrainExpansionTrancheProposal, validateMhsTrainExpansionTrancheProposal, verifyMhsTrainExpansionProposalAuthorities } from "../research/textModerationDataset/mhsTrainExpansionTrancheProposal";

const root = process.cwd(), mhs = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH");
const paths: ProposalPaths = { design: path.join(mhs, "expansion/mhs-train-expansion-design-v1.json"), acquisitionManifest: path.resolve(root, "dataset-research/text-moderation/acquisition-manifest.json"), sourceArtifact: path.join(mhs, "train-00000-of-00001.parquet"), staging: path.join(mhs, "provenance-staging.jsonl"), parentTranche: path.join(mhs, "mhs-review-tranche-v1.jsonl"), candidate: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1.json"), candidateIntegrity: path.join(mhs, "candidates/mhs-review-pilot-v1-candidate-v1-integrity-audit.json") };
const sources = verifyMhsTrainExpansionProposalAuthorities(paths);
const artifact = buildMhsTrainExpansionTrancheProposal(sources.parent, sources.candidate, sources.integrity, new Date().toISOString());
validateMhsTrainExpansionTrancheProposal(artifact);
const target = path.join(mhs, "expansion", MHS_TRAIN_EXPANSION_TRANCHE_PROPOSAL_FILENAME);
publishMhsTrainExpansionTrancheProposal(serializeMhsTrainExpansionTrancheProposal(artifact), target);
console.log(JSON.stringify({ artifactPath: target, proposalCount: artifact.proposalCount, payloadDigest: artifact.proposalPayloadDigest, authorizationDecision: artifact.authorizationDecision }, null, 2));
