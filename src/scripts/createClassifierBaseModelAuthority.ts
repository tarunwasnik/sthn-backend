import path from "node:path";

import { canonicalJson } from "../research/textModerationDataset/manifest";
import { CLASSIFIER_BASE_REVISION, createClassifierBaseAuthority } from "../research/textModerationDataset/classifierBaseModelAuthority";

const result = createClassifierBaseAuthority({
  cacheDirectory: path.resolve(process.cwd(), "evaluation-cache", "text-moderation", "classifier", "facebookai-xlm-roberta-base", CLASSIFIER_BASE_REVISION),
  outputDirectory: path.resolve(process.cwd(), "dataset-research", "text-moderation", "model-authority"),
  resolvedAt: "2026-09-13T12:45:14.776Z",
});

process.stdout.write(canonicalJson({
  authorityPath: result.authorityPath,
  authoritySha256: result.authoritySha256,
  authorityPayloadDigest: result.authority.authorityPayloadDigest,
  repository: result.authority.source.repository,
  revision: result.authority.source.revision,
  authorizationDecision: result.authority.authorizationDecision,
}));
