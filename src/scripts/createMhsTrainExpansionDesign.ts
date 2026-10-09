import path from "node:path";
import { buildMhsTrainExpansionDesign, MHS_TRAIN_EXPANSION_DESIGN_FILENAME, publishMhsTrainExpansionDesign, serializeMhsTrainExpansionDesign, validateMhsTrainExpansionDesign, verifyMhsTrainExpansionDesignAuthorities } from "../research/textModerationDataset/mhsTrainExpansionDesign";

const root = process.cwd();
verifyMhsTrainExpansionDesignAuthorities(root);
const artifact = buildMhsTrainExpansionDesign(new Date().toISOString());
validateMhsTrainExpansionDesign(artifact);
const target = path.resolve(root, "dataset-research/text-moderation/MEASURING_HATE_SPEECH/expansion", MHS_TRAIN_EXPANSION_DESIGN_FILENAME);
publishMhsTrainExpansionDesign(serializeMhsTrainExpansionDesign(artifact), target);
console.log(JSON.stringify({ artifactPath: target, payloadDigest: artifact.expansionPayloadDigest, authorizationDecision: artifact.authorizationDecision }, null, 2));
