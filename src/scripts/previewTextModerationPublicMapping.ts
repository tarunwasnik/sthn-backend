import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { ProvenanceStagingRow } from "../research/textModerationDataset/contracts";
import { previewMappings } from "../research/textModerationDataset/mapping";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation");
const sources = ["HATEMOJI_BUILD", "TOXIGEN_ANNOTATED", "CIVIL_COMMENTS_1_2_4", "MEASURING_HATE_SPEECH"];
const run = async (): Promise<void> => {
  const rows: ProvenanceStagingRow[] = [];
  for (const source of sources) {
    const filename = path.join(root, source, "provenance-staging.jsonl"); if (!fs.existsSync(filename)) continue;
    const reader = readline.createInterface({ input: fs.createReadStream(filename, "utf8"), crlfDelay: Infinity });
    for await (const line of reader) if (line.trim()) rows.push(JSON.parse(line) as ProvenanceStagingRow);
  }
  console.log(JSON.stringify(previewMappings(rows), null, 2));
};
run().catch((error) => { console.error(error); process.exitCode = 1; });
