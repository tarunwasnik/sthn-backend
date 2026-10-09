import { reconstructExternalCorpusV2 } from "../research/textModerationDataset/externalCorpusReconstruction";
reconstructExternalCorpusV2().then((report) => console.log(JSON.stringify(report, null, 2))).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
