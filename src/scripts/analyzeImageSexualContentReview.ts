import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { cacheRoot, loadManifest } from "../evaluation/imageModeration/dataset/sexualContentAcquisition.service";
import { loadLocalReviewManifest } from "../evaluation/imageModeration/dataset/sexualContentReview.service";
import { analyzeSexualContentReview, renderSexualContentReviewMarkdown } from "../evaluation/imageModeration/dataset/sexualContentReviewReport.service";
(async () => { const root = cacheRoot(); const report = analyzeSexualContentReview(await loadManifest(root), await loadLocalReviewManifest(root)); const output = path.resolve(process.cwd(), "evaluation-output", "image-moderation", "sexual-content-review"); await mkdir(output, { recursive: true }); await Promise.all([writeFile(path.join(output, "review.json"), `${JSON.stringify(report, null, 2)}\n`), writeFile(path.join(output, "review.md"), renderSexualContentReviewMarkdown(report))]); console.log(JSON.stringify(report.summary, null, 2)); })().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
