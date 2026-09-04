import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { inspectY4Sample, type Y4Manifest } from "../evaluation/y4ProfileMediaCalibration.service";

const [manifestPath, reportPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !reportPath || !outputPath) throw new Error("Usage: inspect-y4 <manifest> <report> <output>");

type ReportRow = { sampleId: string; scenario: string; status: string; targetRankedFirst?: boolean | null; media: Array<{ bestCandidate?: { medianSimilarity: number } }> };
const score = (row: ReportRow) => row.media[0]?.bestCandidate?.medianSimilarity ?? Number.NEGATIVE_INFINITY;
const take = (rows: ReportRow[], count: number, descending = false) => [...rows].sort((left, right) => descending ? score(right) - score(left) : score(left) - score(right)).slice(0, count);

(async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Y4Manifest;
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { results: ReportRow[] };
  const wrong = report.results.filter(row => row.scenario === "MULTI_TARGET_PRESENT" && row.status === "COMPLETED" && row.targetRankedFirst === false);
  const lowestSame = take(report.results.filter(row => row.scenario === "SINGLE_SAME" && row.status === "COMPLETED"), 10);
  const lowestPresent = take(report.results.filter(row => row.scenario === "MULTI_TARGET_PRESENT" && row.status === "COMPLETED"), 10);
  const highestAbsent = take(report.results.filter(row => row.scenario === "MULTI_TARGET_ABSENT" && row.status === "COMPLETED"), 20, true);
  const groups = { WRONG_PERSON_RANKED_FIRST: wrong, LOWEST_SINGLE_SAME: lowestSame, LOWEST_MULTI_TARGET_PRESENT: lowestPresent, HIGHEST_MULTI_TARGET_ABSENT: highestAbsent };
  const byId = new Map(manifest.samples.map(sample => [sample.sampleId, sample]));
  const cache = new Map<string, unknown>();
  const work = path.join(path.dirname(outputPath), "y4-inspection-composites");
  for (const row of Object.values(groups).flat()) {
    const sample = byId.get(row.sampleId);
    if (!sample) throw new Error(`Manifest sample missing for ${row.sampleId}`);
    if (!cache.has(row.sampleId)) cache.set(row.sampleId, await inspectY4Sample(sample, work));
  }
  const selected = Object.fromEntries(Object.entries(groups).map(([group, rows]) => [group, rows.map(row => ({ reportScore: score(row), inspection: cache.get(row.sampleId) }))]));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify({ schemaVersion: "STHN_Y4_PROFILE_MEDIA_INSPECTION_V1", selected }, null, 2));
})().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
