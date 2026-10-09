import path from "node:path";
import { canonicalJson } from "../research/textModerationDataset/manifest";
import { createMhsMaterialization } from "../research/textModerationDataset/mhsMaterialization";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
const development = path.join(root, "development");
const splits = path.join(root, "splits");
const release = path.join(root, "release");

const result = createMhsMaterialization({
  projectionPath: path.join(development, "mhs-development-text-projection-v1.jsonl"),
  projectionManifestPath: path.join(development, "mhs-development-text-projection-manifest-v1.json"),
  splitManifestPath: path.join(splits, "mhs-split-manifest-v1.json"),
  internalTestFreezePath: path.join(splits, "mhs-internal-test-freeze-v1.json"),
  releaseManifestPath: path.join(release, "mhs-release-manifest-v1.json"),
  eligibilityManifestPath: path.join(release, "mhs-training-eligibility-manifest-v1.json"),
  outputDirectory: path.join(root, "materialized"),
});

process.stdout.write(canonicalJson({
  trainPath: result.trainPath,
  trainSha256: result.trainSha256,
  validationPath: result.validationPath,
  validationSha256: result.validationSha256,
  manifestPath: result.manifestPath,
  manifestSha256: result.manifestSha256,
  manifestPayloadDigest: result.manifest.manifestPayloadDigest,
  counts: {
    TRAIN: result.manifest.artifacts.TRAIN.count,
    VALIDATION: result.manifest.artifacts.VALIDATION.count,
  },
}));
