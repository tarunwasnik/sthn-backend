import { constructExternalCorpus } from "../research/textModerationDataset/externalCorpusExecution";
constructExternalCorpus().then((report) => console.log(JSON.stringify(report, null, 2))).catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
