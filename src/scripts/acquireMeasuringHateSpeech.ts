import { acquireMeasuringHateSpeech } from "../research/textModerationDataset/mhsAcquisition";

acquireMeasuringHateSpeech().then(({ artifact, proof }) => console.log(JSON.stringify({ sourceId: artifact.sourceId, byteSize: artifact.byteSize, sha256: artifact.sha256, proof }, null, 2)))
  .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
