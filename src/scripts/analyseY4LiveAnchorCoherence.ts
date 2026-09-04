import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  inspectY4LiveCaptureSet,
  summarizeY4LiveCaptureInspection,
  y4OpaqueLiveAnchorId,
} from "../evaluation/y4ProfileMediaCalibration.service";

type HoldoutProfile = {
  scenarioId: string;
  live: [string, string, string, string, string];
  family: string;
};
type HoldoutManifest = { profiles: HoldoutProfile[] };
type HoldoutResult = { scenarioId: string; semantic: string; outcome: string };
type HoldoutReport = { profiles: HoldoutResult[] };
type Summary = ReturnType<typeof summarizeY4LiveCaptureInspection>;
type AnchorRow = {
  anchorId: string;
  profileCount: number;
  genuineOutcomeCounts: { likelyMatch: number; likelyMismatch: number; review: number };
  summary: Summary;
};
const percentile = (values: readonly number[], proportion: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * proportion;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
};
const distribution = (values: number[]) => values.length ? {
  minimum: percentile(values, 0), p05: percentile(values, 0.05), p10: percentile(values, 0.1),
  p25: percentile(values, 0.25), median: percentile(values, 0.5), p75: percentile(values, 0.75),
  p90: percentile(values, 0.9), p95: percentile(values, 0.95), maximum: percentile(values, 1),
} : null;

const [manifestPath, resultPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !resultPath || !outputPath) {
  throw new Error("Usage: analyse-y4-live-anchors <holdout-manifest> <holdout-report> <output>");
}

(async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Y4 Gate-1 analysis is development-only");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as HoldoutManifest;
  const result = JSON.parse(await readFile(resultPath, "utf8")) as HoldoutReport;
  const resultByScenario = new Map(result.profiles.map(item => [item.scenarioId, item]));
  const groups = new Map<string, HoldoutProfile[]>();
  for (const profile of manifest.profiles) {
    const id = y4OpaqueLiveAnchorId(profile.live);
    groups.set(id, [...(groups.get(id) ?? []), profile]);
  }
  const anchors: AnchorRow[] = [];
  for (const [anchorId, profiles] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const summary = summarizeY4LiveCaptureInspection(await inspectY4LiveCaptureSet(profiles[0].live));
    const genuine = profiles.map(profile => resultByScenario.get(profile.scenarioId)).filter((item): item is HoldoutResult => item?.semantic === "GENUINE");
    anchors.push({
      anchorId,
      profileCount: profiles.length,
      genuineOutcomeCounts: {
        likelyMatch: genuine.filter(item => item.outcome === "LIKELY_MATCH").length,
        likelyMismatch: genuine.filter(item => item.outcome === "LIKELY_MISMATCH").length,
        review: genuine.filter(item => item.outcome === "AMBIGUOUS_OR_INSUFFICIENT").length,
      },
      summary,
    });
  }
  const by = (selector: (summary: Summary) => number | null) => distribution(anchors.map(anchor => selector(anchor.summary)).filter((value): value is number => value !== null));
  const report = {
    schemaVersion: "STHN_Y4_LIVE_ANCHOR_COHERENCE_V1",
    anchorCount: anchors.length,
    reportPrivacy: "opaque anchor IDs and bounded similarity summaries only; no media, paths, labels, landmarks, or embeddings",
    distributions: {
      pairwiseMedian: by(summary => summary.pairwise?.medianSimilarity ?? null),
      pairwiseMinimum: by(summary => summary.pairwise?.minimumSimilarity ?? null),
      pairwiseMean: by(summary => summary.pairwise?.meanSimilarity ?? null),
      weakestPeerMedian: by(summary => summary.weakestPeerMedian),
    },
    anchors,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2));
})().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
