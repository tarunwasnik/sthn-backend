import crypto from "node:crypto";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { assertY4EvaluationOnly, type Y4LiveAnchorSummary } from "./y4ProfileMediaCalibration.service";

export const Y4_LIVE_ANCHOR_FAMILIES = ["COHERENT_SAME_IDENTITY_ANCHOR", "MIXED_IDENTITY_ANCHOR_4_PLUS_1", "MIXED_IDENTITY_ANCHOR_3_PLUS_2"] as const;
export type Y4LiveAnchorFamily = typeof Y4_LIVE_ANCHOR_FAMILIES[number];
export type Y4LiveAnchorManifestRow = { anchorId: string; family: Y4LiveAnchorFamily; captures: readonly [string, string, string, string, string] };
export type Y4LiveAnchorManifest = { schemaVersion: "STHN_Y4_LIVE_ANCHOR_CALIBRATION_V1"; anchors: readonly Y4LiveAnchorManifestRow[] };
export type Y4LiveAnchorManifestAudit = { anchorCount: number; familyCounts: Record<Y4LiveAnchorFamily, number>; sourceMediaOverlap: number; duplicateSourceMedia: number; duplicateAnchorCompositions: number; invalidTruthRows: number; foreignPositionCounts: { fourPlusOne: number[]; threePlusTwo: number[] } };
export type Y4LiveAnchorEvaluationRow = { anchorId: string; family: Y4LiveAnchorFamily; summary: Y4LiveAnchorSummary };
const image = /\.(jpg|jpeg|png)$/i;
const canonical = (value: unknown) => JSON.stringify(value);
const composition = (captures: readonly string[]) => [...captures].sort().join("\u0000");
const sourceIdentity = (file: string) => path.dirname(file).toLocaleLowerCase();
const normal = (file: string) => path.resolve(file).toLocaleLowerCase();
export const y4LiveAnchorManifestHash = (manifest: Y4LiveAnchorManifest) => crypto.createHash("sha256").update(canonical(manifest)).digest("hex");

/** Public audit deliberately contains counts only, never source paths or identity labels. */
export const auditY4LiveAnchorManifest = (manifest: Y4LiveAnchorManifest, excludedSourceMedia: ReadonlySet<string>): Y4LiveAnchorManifestAudit => {
  const sourceMedia = manifest.anchors.flatMap(anchor => anchor.captures); const normalized = sourceMedia.map(normal);
  const count = (family: Y4LiveAnchorFamily) => manifest.anchors.filter(anchor => anchor.family === family).length;
  const fourPlusOne = Array.from({ length: 5 }, () => 0); const threePlusTwo = Array.from({ length: 5 }, () => 0);
  const invalidTruthRows = manifest.anchors.filter(anchor => {
    const identities = anchor.captures.map(sourceIdentity); if (anchor.captures.length !== 5) return true;
    if (anchor.family === "COHERENT_SAME_IDENTITY_ANCHOR") return new Set(identities).size !== 1;
    const counts = [...new Set(identities)].map(identity => identities.filter(value => value === identity).length).sort((left, right) => right - left);
    const expected = anchor.family === "MIXED_IDENTITY_ANCHOR_4_PLUS_1" ? [4, 1] : [3, 2]; if (counts.length !== 2 || counts[0] !== expected[0] || counts[1] !== expected[1]) return true;
    const foreignIdentity = identities.find(identity => identities.filter(value => value === identity).length === expected[1]); if (!foreignIdentity) return true;
    identities.forEach((identity, index) => { if (identity === foreignIdentity) (anchor.family === "MIXED_IDENTITY_ANCHOR_4_PLUS_1" ? fourPlusOne : threePlusTwo)[index] += 1; }); return false;
  }).length;
  return { anchorCount: manifest.anchors.length, familyCounts: Object.fromEntries(Y4_LIVE_ANCHOR_FAMILIES.map(family => [family, count(family)])) as Record<Y4LiveAnchorFamily, number>, sourceMediaOverlap: normalized.filter(file => excludedSourceMedia.has(file)).length, duplicateSourceMedia: normalized.length - new Set(normalized).size, duplicateAnchorCompositions: manifest.anchors.length - new Set(manifest.anchors.map(anchor => composition(anchor.captures.map(normal)))).size, invalidTruthRows, foreignPositionCounts: { fourPlusOne, threePlusTwo } };
};

const sourcePools = async (datasetRoot: string, exclusions: ReadonlySet<string>) => Promise.all((await readdir(datasetRoot, { withFileTypes: true })).filter(item => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name)).map(async directory => ({ identity: directory.name, files: (await readdir(path.join(datasetRoot, directory.name))).filter(file => image.test(file)).sort().map(file => path.join(datasetRoot, directory.name, file)).filter(file => !exclusions.has(normal(file))) })));
/** Deterministic lexical allocation. It examines only paths/identity folders, never model output. */
export const generateY4LiveAnchorManifest = async (input: { datasetRoot: string; excludedSourceMedia: ReadonlySet<string> }): Promise<Y4LiveAnchorManifest> => {
  assertY4EvaluationOnly(); const pools = await sourcePools(input.datasetRoot, input.excludedSourceMedia); if (pools.length < 2) throw new Error("Insufficient identities for mixed-anchor controls");
  const take = (index: number, amount: number) => { const pool = pools[index % pools.length]; if (pool.files.length < amount) throw new Error("Insufficient fresh source media for deterministic anchor allocation"); return pool.files.splice(0, amount); };
  const anchors: Y4LiveAnchorManifestRow[] = []; const add = (family: Y4LiveAnchorFamily, captures: string[]) => anchors.push({ anchorId: `Y4G_LIVE_${String(anchors.length + 1).padStart(4, "0")}`, family, captures: captures as unknown as Y4LiveAnchorManifestRow["captures"] });
  for (let index = 0; index < 300; index += 1) add("COHERENT_SAME_IDENTITY_ANCHOR", take(index, 5));
  for (let index = 0; index < 150; index += 1) { const primary = take(index, 4); const foreign = take(index + 1, 1)[0]; primary.splice(index % 5, 0, foreign); add("MIXED_IDENTITY_ANCHOR_4_PLUS_1", primary); }
  const patterns = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];
  for (let index = 0; index < 150; index += 1) { const primary = take(index, 3); const foreign = take(index + 1, 2); const positions = patterns[index % patterns.length]; const captures: string[] = []; for (let captureIndex = 0, primaryIndex = 0, foreignIndex = 0; captureIndex < 5; captureIndex += 1) captures.push(positions.includes(captureIndex) ? foreign[foreignIndex++] : primary[primaryIndex++]); add("MIXED_IDENTITY_ANCHOR_3_PLUS_2", captures); }
  const manifest: Y4LiveAnchorManifest = { schemaVersion: "STHN_Y4_LIVE_ANCHOR_CALIBRATION_V1", anchors }; const audit = auditY4LiveAnchorManifest(manifest, input.excludedSourceMedia);
  if (audit.anchorCount !== 600 || audit.familyCounts.COHERENT_SAME_IDENTITY_ANCHOR !== 300 || audit.familyCounts.MIXED_IDENTITY_ANCHOR_4_PLUS_1 !== 150 || audit.familyCounts.MIXED_IDENTITY_ANCHOR_3_PLUS_2 !== 150 || audit.sourceMediaOverlap || audit.duplicateSourceMedia || audit.duplicateAnchorCompositions || audit.invalidTruthRows) throw new Error("Generated Gate-1 manifest failed its pre-scoring audit"); return manifest;
};
