import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { cacheRoot, loadManifest } from "../evaluation/imageModeration/dataset/sexualContentAcquisition.service";
import { analyzeSexualContentAcquisition, renderSexualContentAcquisitionMarkdown } from "../evaluation/imageModeration/dataset/sexualContentAcquisitionReport.service";

(async () => {
  const analysis = analyzeSexualContentAcquisition(await loadManifest(cacheRoot()));
  const output = path.resolve(process.cwd(), "evaluation-output", "image-moderation", "sexual-content-acquisition");
  await mkdir(output, { recursive: true });
  await Promise.all([writeFile(path.join(output, "acquisition-pool.json"), `${JSON.stringify(analysis, null, 2)}\n`), writeFile(path.join(output, "acquisition-pool.md"), renderSexualContentAcquisitionMarkdown(analysis))]);
  console.log(JSON.stringify(analysis.candidateSummary, null, 2));
})().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
