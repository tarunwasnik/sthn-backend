import path from "node:path";
import { createTextModerationPiiPolicy, publishTextModerationPiiPolicy, TEXT_MODERATION_PII_POLICY_FILENAME } from "../research/textModerationDataset/textModerationPiiPolicy";

const artifact = createTextModerationPiiPolicy();
const target = path.resolve(process.cwd(), "dataset-research/text-moderation/policy", TEXT_MODERATION_PII_POLICY_FILENAME);
const published = publishTextModerationPiiPolicy(artifact, target);
console.log(JSON.stringify({ ...published, policyPayloadDigest: artifact.policyPayloadDigest, authorizationDecision: artifact.authorizationDecision, resumeDecision: artifact.resumeDecision }, null, 2));
