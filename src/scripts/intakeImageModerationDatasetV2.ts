import { datasetV2Root, intakeDatasetV2, loadDatasetV2Manifest, scanDatasetV2Incoming } from "../evaluation/imageModeration/dataset/datasetV2Intake.service";
import { loadManualBenchmarkManifest, manualBenchmarkRoot } from "../evaluation/imageModeration/dataset/manualBenchmarkInventory.service";

const run = async () => {
  const root = datasetV2Root(); const prior = await loadDatasetV2Manifest(root); const v1 = await loadManualBenchmarkManifest(manualBenchmarkRoot());
  const references = v1.candidates.filter((x) => x.sha256).map((x) => ({ candidateId: x.id, sha256: x.sha256! }));
  const result = await intakeDatasetV2({ root, existing: prior.candidates, references, files: await scanDatasetV2Incoming(root) });
  console.log(JSON.stringify({ discovered: result.discovered, valid: result.valid, invalid: result.invalid, exactDuplicates: result.exactDuplicates, nearDuplicateCandidates: result.nearDuplicates, crossPoolLeakage: result.crossPoolLeakage, admittedReviewRequired: result.admittedReviewRequired, manifestFingerprint: result.manifest.fingerprint, poolFingerprints: result.manifest.poolFingerprints }, null, 2));
};
run().catch((error) => { console.error(error); process.exitCode = 1; });
