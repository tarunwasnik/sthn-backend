import { certifyExternalDatasetAcquisition, prepareExternalDatasetCertification } from "../research/textModerationDataset/externalDatasetCertification";

const execute = process.argv.includes("--execute-local-certification");
const result = execute ? certifyExternalDatasetAcquisition() : prepareExternalDatasetCertification();
console.log(JSON.stringify(result, null, 2));
