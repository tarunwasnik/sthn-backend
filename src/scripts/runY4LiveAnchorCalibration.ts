import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectY4LiveCaptureSet, summarizeY4LiveCaptureInspection } from "../evaluation/y4ProfileMediaCalibration.service";
import { auditY4LiveAnchorManifest, generateY4LiveAnchorManifest, y4LiveAnchorManifestHash, type Y4LiveAnchorManifest } from "../evaluation/y4LiveAnchorCalibration.service";

const normalized = (file: string) => path.resolve(file).toLocaleLowerCase();
const writeJson = async (file: string, value: unknown) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2)); };
const calibrationSources = async (fullManifestPath: string, holdoutManifestPath: string) => {
  const full = JSON.parse(await readFile(fullManifestPath, "utf8")) as { samples: Array<{ live: string[]; profile: string[] }> };
  const holdout = JSON.parse(await readFile(holdoutManifestPath, "utf8")) as { profiles: Array<{ live: string[]; media: Array<{ sample: "NO_FACE" | { profile: string[] } }> }> };
  const sources = new Set<string>(); for (const sample of full.samples) for (const file of [...sample.live, ...sample.profile]) sources.add(normalized(file));
  for (const profile of holdout.profiles) { for (const file of profile.live) sources.add(normalized(file)); for (const media of profile.media) if (media.sample !== "NO_FACE") for (const file of media.sample.profile) sources.add(normalized(file)); }
  return sources;
};
const [mode, first, second, third, fourth] = process.argv.slice(2);
(async () => {
  if (mode === "generate") {
    if (!first || !second || !third || !fourth) throw new Error("Usage: generate <dataset-root> <y4-full-manifest> <y4f-manifest> <output-manifest>");
    const exclusions = await calibrationSources(second, third); const manifest = await generateY4LiveAnchorManifest({ datasetRoot: first, excludedSourceMedia: exclusions });
    await writeJson(fourth, manifest); await writeJson(`${fourth}.audit.json`, { manifestHash: y4LiveAnchorManifestHash(manifest), audit: auditY4LiveAnchorManifest(manifest, exclusions), exclusionSourceCount: exclusions.size }); return;
  }
  if (mode === "evaluate") {
    if (!first || !second) throw new Error("Usage: evaluate <manifest> <output-report>"); const manifest = JSON.parse(await readFile(first, "utf8")) as Y4LiveAnchorManifest; const results = [];
    for (const [index, anchor] of manifest.anchors.entries()) { results.push({ anchorId: anchor.anchorId, family: anchor.family, summary: summarizeY4LiveCaptureInspection(await inspectY4LiveCaptureSet(anchor.captures)) }); if ((index + 1) % 10 === 0 || index + 1 === manifest.anchors.length) console.log(`Y4G_GATE1_PROGRESS ${index + 1}/${manifest.anchors.length}`); }
    await writeJson(second, { schemaVersion: "STHN_Y4_LIVE_ANCHOR_EVALUATION_V1", manifestHash: y4LiveAnchorManifestHash(manifest), requestedAnchors: manifest.anchors.length, results }); return;
  }
  throw new Error("Expected generate or evaluate mode");
})().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
