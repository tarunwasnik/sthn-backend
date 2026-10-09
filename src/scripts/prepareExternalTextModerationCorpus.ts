import { prepareExternalCorpusConstruction } from "../research/textModerationDataset/externalCorpusConstruction";
try { console.log(JSON.stringify(prepareExternalCorpusConstruction(), null, 2)); } catch (error) { console.error(error); process.exitCode = 1; }
