import { repairExternalDatasetArchives } from "../research/textModerationDataset/externalDatasetCertification";

try { console.log(JSON.stringify(repairExternalDatasetArchives(), null, 2)); }
catch (error) { console.error(error); process.exitCode = 1; }
