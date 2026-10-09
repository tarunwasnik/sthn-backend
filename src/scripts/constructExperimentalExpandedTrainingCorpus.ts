import { buildExperimentalExpandedTrainingCorpus } from "../research/textModerationDataset/experimentalExpandedTrainingCorpus";

buildExperimentalExpandedTrainingCorpus().then((summary) => console.log(JSON.stringify(summary, null, 2))).catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
