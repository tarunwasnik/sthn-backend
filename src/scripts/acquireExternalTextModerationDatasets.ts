import { acquireExternalDatasets, prepareExternalDatasetAcquisition } from "../research/textModerationDataset/externalDatasetIntake";

const execute = process.argv.includes("--execute-local-acquisition");
const requested = process.argv.find((argument) => argument.startsWith("--sources="));
const sources = requested ? requested.slice("--sources=".length).split(",").filter(Boolean) : undefined;
(execute ? acquireExternalDatasets(sources) : Promise.resolve(prepareExternalDatasetAcquisition()))
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => { console.error(error); process.exitCode = 1; });
