import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { loadManualBenchmarkManifest, manualBenchmarkRoot } from "../evaluation/imageModeration/dataset/manualBenchmarkInventory.service";
import { analyzeManualBenchmark, renderManualBenchmarkMarkdown } from "../evaluation/imageModeration/dataset/manualBenchmarkReport.service";
import { loadLocalReviewManifest } from "../evaluation/imageModeration/dataset/sexualContentReview.service";
(async () => { const root = manualBenchmarkRoot(); const report = analyzeManualBenchmark(await loadManualBenchmarkManifest(root), await loadLocalReviewManifest(root)); const output = path.resolve(process.cwd(), "evaluation-output", "image-moderation", "manual-benchmark"); await mkdir(output, { recursive: true }); await Promise.all([writeFile(path.join(output, "inventory.json"), `${JSON.stringify(report, null, 2)}\n`), writeFile(path.join(output, "inventory.md"), renderManualBenchmarkMarkdown(report))]); console.log(JSON.stringify(report, null, 2)); })().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
