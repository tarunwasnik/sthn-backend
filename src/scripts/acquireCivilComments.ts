import fs from "node:fs";
import path from "node:path";
import { acquireCivilComments } from "../research/textModerationDataset/civilCommentsAcquisition";
import { canonicalJson } from "../research/textModerationDataset/manifest";

acquireCivilComments().then((result) => console.log(JSON.stringify({ sourceId: result.artifact.sourceId, artifactId: result.artifact.artifactId, byteSize: result.artifact.byteSize, sha256: result.artifact.sha256, rowCounts: result.rowCounts }, null, 2)))
  .catch((error) => {
    const reason = error instanceof Error ? error.message : String(error); const filename = path.resolve(process.cwd(), "dataset-research", "text-moderation", "acquisition-results.json");
    const prior = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, "utf8")) as { results: { sourceId: string }[] } : { results: [] };
    const result = { sourceId: "CIVIL_COMMENTS_1_2_4", status: "BLOCKED", artifactCount: 0, rowCount: 0, reason };
    fs.writeFileSync(filename, canonicalJson({ createdAt: new Date().toISOString(), results: [...prior.results.filter((item) => item.sourceId !== result.sourceId), result] }));
    console.error(reason); process.exitCode = 1;
  });
