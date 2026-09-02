import path from "node:path";
import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { CalibrationManifest, CalibrationSample } from "./sfaceCalibration.types";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const TIER_A_MATCH_COUNT = 20;
const TIER_A_NON_MATCH_COUNT = 20;
const REQUIRED_IMAGES_PER_IDENTITY = 6;
export const Y2D_NON_MATCH_TARGET = 5_000;
export const Y2D_BATCH_SIZE = 1_000;

type EligibleIdentity = { directory: string; images: string[] };

export type VggFace2PreparationSummary = Readonly<{
  manifest: CalibrationManifest;
  metadata: Readonly<{
    schemaVersion: "STHN_VGGFACE2_TIER_A_PREPARATION_V1";
    selectionMethod: "LEXICAL_IDENTITY_AND_FILE_ORDER_V1";
    matchCount: number;
    nonMatchCount: number;
    uniqueMatchReferenceIdentities: number;
    uniqueNonMatchReferenceIdentities: number;
    uniqueNonMatchCaptureIdentities: number;
  }>;
}>;

const sorted = (values: readonly string[]) => [...values].sort((left, right) => left.localeCompare(right, "en"));

const ensureExists = async (file: string) => {
  try { await access(file); } catch { throw new Error("VGGFace2 selected media file is missing"); }
};

const discoverEligibleIdentities = async (testRoot: string): Promise<EligibleIdentity[]> => {
  const entries = await readdir(testRoot, { withFileTypes: true });
  const identities: EligibleIdentity[] = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const directory = path.join(testRoot, entry.name);
    const files = await readdir(directory, { withFileTypes: true });
    const images = sorted(files.filter((file) => file.isFile() && IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase())).map((file) => path.join(directory, file.name)));
    if (images.length >= REQUIRED_IMAGES_PER_IDENTITY) identities.push({ directory, images });
  }
  return identities;
};

const asRelative = (manifestDirectory: string, file: string) => path.relative(manifestDirectory, file);

const pairKey = (reference: string, capture: string) => `${reference}\u0000${capture}`;

const selectWindow = (images: readonly string[], start: number, count: number) => Array.from({ length: count }, (_, index) => images[(start + index) % images.length]);

const createMatch = (identity: EligibleIdentity, index: number, manifestDirectory: string, tier: "TA" | "TB"): CalibrationSample => ({
  sampleId: `VGG2_${tier}_M_${String(index + 1).padStart(3, "0")}`,
  expectedLabel: "MATCH",
  reference: asRelative(manifestDirectory, identity.images[0]),
  captures: identity.images.slice(1, 6).map((file) => asRelative(manifestDirectory, file)) as CalibrationSample["captures"],
  scenario: "VGGFACE2_GENERAL",
});

const createNonMatch = (referenceIdentity: EligibleIdentity, captureIdentity: EligibleIdentity, index: number, manifestDirectory: string, tier: "TA" | "TB"): CalibrationSample => ({
  sampleId: `VGG2_${tier}_N_${String(index + 1).padStart(3, "0")}`,
  expectedLabel: "NON_MATCH",
  reference: asRelative(manifestDirectory, referenceIdentity.images[0]),
  captures: captureIdentity.images.slice(1, 6).map((file) => asRelative(manifestDirectory, file)) as CalibrationSample["captures"],
  scenario: "VGGFACE2_GENERAL",
});

const validateSampleFiles = async (manifestDirectory: string, sample: CalibrationSample) => {
  await Promise.all([sample.reference, ...sample.captures].map((file) => ensureExists(path.resolve(manifestDirectory, file))));
  if (new Set([sample.reference, ...sample.captures]).size !== 6) throw new Error("VGGFace2 sample reuses reference or capture media");
};

export const prepareVggFace2TierA = async (testRoot: string, manifestDirectory: string): Promise<VggFace2PreparationSummary> => {
  const resolvedTestRoot = path.resolve(testRoot);
  if (!(await stat(resolvedTestRoot)).isDirectory()) throw new Error("VGGFace2 test root is not a directory");
  const identities = await discoverEligibleIdentities(resolvedTestRoot);
  const requiredIdentityCount = TIER_A_MATCH_COUNT + (TIER_A_NON_MATCH_COUNT * 2);
  if (identities.length < requiredIdentityCount) throw new Error("VGGFace2 has insufficient eligible identities for deterministic Tier A");

  const samples: CalibrationSample[] = [];
  for (let index = 0; index < TIER_A_MATCH_COUNT; index += 1) samples.push(createMatch(identities[index], index, manifestDirectory, "TA"));
  for (let index = 0; index < TIER_A_NON_MATCH_COUNT; index += 1) samples.push(createNonMatch(identities[TIER_A_MATCH_COUNT + index * 2], identities[TIER_A_MATCH_COUNT + index * 2 + 1], index, manifestDirectory, "TA"));
  await Promise.all(samples.map((sample) => validateSampleFiles(manifestDirectory, sample)));
  const comparisons = new Set(samples.map((sample) => `${sample.expectedLabel}:${sample.reference}:${sample.captures.join("|")}`));
  if (comparisons.size !== samples.length) throw new Error("VGGFace2 Tier A contains duplicate comparisons");

  return {
    manifest: { schemaVersion: "STHN_SFACE_CALIBRATION_MANIFEST_V1", samples },
    metadata: {
      schemaVersion: "STHN_VGGFACE2_TIER_A_PREPARATION_V1",
      selectionMethod: "LEXICAL_IDENTITY_AND_FILE_ORDER_V1",
      matchCount: TIER_A_MATCH_COUNT,
      nonMatchCount: TIER_A_NON_MATCH_COUNT,
      uniqueMatchReferenceIdentities: TIER_A_MATCH_COUNT,
      uniqueNonMatchReferenceIdentities: TIER_A_NON_MATCH_COUNT,
      uniqueNonMatchCaptureIdentities: TIER_A_NON_MATCH_COUNT,
    },
  };
};

/** Tier B is an independent deterministic lexical sample, selected before any model score exists. */
export const prepareVggFace2TierB = async (testRoot: string, manifestDirectory: string) => {
  const identities = await discoverEligibleIdentities(path.resolve(testRoot)); const count = 100;
  if (identities.length < count * 3) throw new Error("VGGFace2 has insufficient eligible identities for deterministic Tier B");
  const samples: CalibrationSample[] = [];
  for (let index = 0; index < count; index += 1) samples.push(createMatch(identities[index], index, manifestDirectory, "TB"));
  for (let index = 0; index < count; index += 1) samples.push(createNonMatch(identities[count + index * 2], identities[count + index * 2 + 1], index, manifestDirectory, "TB"));
  await Promise.all(samples.map((sample) => validateSampleFiles(manifestDirectory, sample)));
  return { manifest: { schemaVersion: "STHN_SFACE_CALIBRATION_MANIFEST_V1" as const, samples }, metadata: { schemaVersion: "STHN_VGGFACE2_TIER_B_PREPARATION_V1", selectionMethod: "LEXICAL_IDENTITY_AND_FILE_ORDER_V1", matchCount: count, nonMatchCount: count, uniqueMatchReferenceIdentities: count, uniqueNonMatchReferenceIdentities: count, uniqueNonMatchCaptureIdentities: count } };
};

export const writeVggFace2TierB = async (testRoot: string, manifestPath: string) => { const summary = await prepareVggFace2TierB(testRoot, path.dirname(path.resolve(manifestPath))); await writeFile(manifestPath, `${JSON.stringify(summary.manifest, null, 2)}\n`, "utf8"); await writeFile(manifestPath.replace(/\.json$/i, ".preparation.json"), `${JSON.stringify(summary.metadata, null, 2)}\n`, "utf8"); return summary; };

/** Tier C lexically enumerates distinct identities first and distinct ordered A→B pairs before any reuse. */
export const prepareVggFace2TierC = async (testRoot: string, manifestDirectory: string) => {
  const identities = await discoverEligibleIdentities(path.resolve(testRoot)); const matchTarget = 300, nonMatchTarget = 500;
  if (identities.length < matchTarget) throw new Error("VGGFace2 has insufficient eligible identities for Tier C MATCH target");
  const samples: CalibrationSample[] = [];
  for (let index = 0; index < matchTarget; index += 1) samples.push(createMatch(identities[index], index, manifestDirectory, "TB") as CalibrationSample);
  samples.forEach((sample) => { if (sample.sampleId.startsWith("VGG2_TB_M")) (sample as { sampleId: string }).sampleId = sample.sampleId.replace("VGG2_TB_M", "VGG2_TC_M"); });
  for (let index = 0; index < nonMatchTarget; index += 1) {
    const reference = identities[index % identities.length]; const capture = identities[(index + 1) % identities.length];
    const sample = createNonMatch(reference, capture, index, manifestDirectory, "TB"); (sample as { sampleId: string }).sampleId = sample.sampleId.replace("VGG2_TB_N", "VGG2_TC_N"); samples.push(sample);
  }
  await Promise.all(samples.map((sample) => validateSampleFiles(manifestDirectory, sample)));
  const comparisons = new Set(samples.map((sample) => `${sample.expectedLabel}:${sample.reference}:${sample.captures.join("|")}`)); if (comparisons.size !== samples.length) throw new Error("VGGFace2 Tier C contains duplicate comparisons");
  const nonMatches = samples.filter((sample) => sample.expectedLabel === "NON_MATCH"); const pairKeys = nonMatches.map((sample) => `${path.dirname(sample.reference)}>${path.dirname(sample.captures[0])}`); const refs = samples.map((sample) => sample.reference); const captures = samples.flatMap((sample) => sample.captures);
  const reuse = (values: readonly string[]) => { const frequencies = new Map<string, number>(); for (const value of values) frequencies.set(value, (frequencies.get(value) ?? 0) + 1); const counts = [...frequencies.values()]; return { unique: counts.length, average: values.length / counts.length, maximum: Math.max(...counts) }; };
  return { manifest: { schemaVersion: "STHN_SFACE_CALIBRATION_MANIFEST_V1" as const, samples }, metadata: { schemaVersion: "STHN_VGGFACE2_TIER_C_PREPARATION_V1", selectionMethod: "LEXICAL_IDENTITY_AND_ORDERED_PAIR_V1", matchTarget, nonMatchTarget, uniqueMatchReferenceIdentities: matchTarget, uniqueNonMatchReferenceIdentities: identities.length, uniqueNonMatchCaptureIdentities: identities.length, totalDistinctIdentities: identities.length, uniqueOrderedNonMatchPairs: new Set(pairKeys).size, duplicateOrderedPairs: pairKeys.length - new Set(pairKeys).size, reversedPairCounterparts: 0, exactDuplicateComparisons: samples.length - comparisons.size, referenceFiles: reuse(refs), captureFiles: reuse(captures) } };
};
export const writeVggFace2TierC = async (testRoot: string, manifestPath: string) => { const summary = await prepareVggFace2TierC(testRoot, path.dirname(path.resolve(manifestPath))); await writeFile(manifestPath, `${JSON.stringify(summary.manifest, null, 2)}\n`, "utf8"); await writeFile(manifestPath.replace(/\.json$/i, ".preparation.json"), `${JSON.stringify(summary.metadata, null, 2)}\n`, "utf8"); return summary; };

const readOrderedNonMatchPairs = async (manifestPaths: readonly string[]) => {
  const pairs = new Set<string>();
  for (const manifestPath of manifestPaths) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CalibrationManifest;
    const base = path.dirname(path.resolve(manifestPath));
    for (const sample of manifest.samples) if (sample.expectedLabel === "NON_MATCH") {
      pairs.add(pairKey(path.dirname(path.resolve(base, sample.reference)), path.dirname(path.resolve(base, sample.captures[0]))));
    }
  }
  return pairs;
};

/** Development-only deterministic, score-independent Y2D pair construction. Batches partition one global sequence. */
export const prepareVggFace2Y2DNonMatch = async (testRoot: string, manifestDirectory: string, previousManifestPaths: readonly string[], options: Readonly<{ target?: number; batchSize?: number }> = {}) => {
  const target = options.target ?? Y2D_NON_MATCH_TARGET; const batchSize = options.batchSize ?? Y2D_BATCH_SIZE;
  if (!Number.isInteger(target) || target < 1 || !Number.isInteger(batchSize) || batchSize < 1 || target % batchSize !== 0) throw new Error("Y2D target must be an exact positive batch multiple");
  const identities = await discoverEligibleIdentities(path.resolve(testRoot));
  if (identities.length < 2) throw new Error("VGGFace2 has insufficient eligible identities for Y2D");
  const previousPairs = await readOrderedNonMatchPairs(previousManifestPaths);
  const samples: CalibrationSample[] = [];
  let excludedEarlierPairs = 0;
  for (let offset = 1; offset < identities.length && samples.length < target; offset += 1) {
    for (let referenceIndex = 0; referenceIndex < identities.length && samples.length < target; referenceIndex += 1) {
      const captureIndex = (referenceIndex + offset) % identities.length;
      const referenceIdentity = identities[referenceIndex]; const captureIdentity = identities[captureIndex];
      const orderedPair = pairKey(referenceIdentity.directory, captureIdentity.directory);
      if (previousPairs.has(orderedPair)) { excludedEarlierPairs += 1; continue; }
      const ordinal = samples.length;
      const reference = referenceIdentity.images[(referenceIndex + offset) % referenceIdentity.images.length];
      const captures = selectWindow(captureIdentity.images, (referenceIndex * 5 + offset) % captureIdentity.images.length, 5);
      samples.push({ sampleId: `VGG2_Y2D_N_${String(ordinal + 1).padStart(4, "0")}`, expectedLabel: "NON_MATCH", reference: asRelative(manifestDirectory, reference), captures: captures.map((file) => asRelative(manifestDirectory, file)) as CalibrationSample["captures"], scenario: "VGGFACE2_GENERAL" });
    }
  }
  if (samples.length !== target) throw new Error("VGGFace2 has insufficient score-independent unique ordered pairs for Y2D");
  await Promise.all(samples.map((sample) => validateSampleFiles(manifestDirectory, sample)));
  const pairKeys = samples.map((sample) => pairKey(path.dirname(path.resolve(manifestDirectory, sample.reference)), path.dirname(path.resolve(manifestDirectory, sample.captures[0]))));
  const comparisons = new Set(samples.map((sample) => `${sample.expectedLabel}:${sample.reference}:${sample.captures.join("|")}`));
  const referenceUsage = new Map<string, number>(); const captureUsage = new Map<string, number>();
  for (const key of pairKeys) { const [reference, capture] = key.split("\u0000"); referenceUsage.set(reference, (referenceUsage.get(reference) ?? 0) + 1); captureUsage.set(capture, (captureUsage.get(capture) ?? 0) + 1); }
  const reuse = (values: readonly string[]) => { const frequencies = new Map<string, number>(); for (const value of values) frequencies.set(value, (frequencies.get(value) ?? 0) + 1); const counts = [...frequencies.values()]; return { unique: counts.length, average: values.length / counts.length, maximum: Math.max(...counts) }; };
  const usage = (values: Map<string, number>) => { const counts = [...values.values()]; return { minimum: Math.min(...counts), maximum: Math.max(...counts), mean: counts.reduce((sum, count) => sum + count, 0) / counts.length }; };
  const batches = Array.from({ length: target / batchSize }, (_, index) => ({ schemaVersion: "STHN_SFACE_CALIBRATION_MANIFEST_V1" as const, samples: samples.slice(index * batchSize, (index + 1) * batchSize) }));
  return { batches, metadata: { schemaVersion: "STHN_VGGFACE2_Y2D_NON_MATCH_PREPARATION_V1", selectionMethod: "LEXICAL_CYCLIC_OFFSET_PAIRING_V1", target, batchSize, batchCount: batches.length, eligibleIdentities: identities.length, uniqueReferenceIdentities: referenceUsage.size, uniqueCaptureIdentities: captureUsage.size, totalDistinctIdentities: new Set([...referenceUsage.keys(), ...captureUsage.keys()]).size, uniqueOrderedPairs: new Set(pairKeys).size, duplicateOrderedPairs: pairKeys.length - new Set(pairKeys).size, selfPairs: pairKeys.filter((key) => { const [reference, capture] = key.split("\u0000"); return reference === capture; }).length, reversedPairCounterparts: pairKeys.filter((key) => { const [reference, capture] = key.split("\u0000"); return new Set(pairKeys).has(pairKey(capture, reference)); }).length, previousOrderedPairsAvailable: previousPairs.size, earlierPairsExcluded: excludedEarlierPairs, overlapWithEarlierPairs: pairKeys.filter((key) => previousPairs.has(key)).length, exactDuplicateComparisons: samples.length - comparisons.size, referenceIdentityUsage: usage(referenceUsage), captureIdentityUsage: usage(captureUsage), referenceFiles: reuse(samples.map((sample) => sample.reference)), captureFiles: reuse(samples.flatMap((sample) => sample.captures)) } };
};

export const writeVggFace2Y2DNonMatch = async (testRoot: string, manifestDirectory: string, previousManifestPaths: readonly string[]) => {
  const resolvedDirectory = path.resolve(manifestDirectory); const summary = await prepareVggFace2Y2DNonMatch(testRoot, resolvedDirectory, previousManifestPaths);
  await Promise.all(summary.batches.map((batch, index) => writeFile(path.join(resolvedDirectory, `y2d-nonmatch-${String(index + 1).padStart(3, "0")}.json`), `${JSON.stringify(batch, null, 2)}\n`, "utf8")));
  await writeFile(path.join(resolvedDirectory, "y2d-nonmatch.preparation.json"), `${JSON.stringify(summary.metadata, null, 2)}\n`, "utf8");
  return summary;
};

/** Development-only external-dataset writer; the returned manifest never enters application persistence. */
export const writeVggFace2TierA = async (testRoot: string, manifestPath: string) => {
  const resolvedManifestPath = path.resolve(manifestPath);
  const summary = await prepareVggFace2TierA(testRoot, path.dirname(resolvedManifestPath));
  await writeFile(resolvedManifestPath, `${JSON.stringify(summary.manifest, null, 2)}\n`, "utf8");
  await writeFile(resolvedManifestPath.replace(/\.json$/i, ".preparation.json"), `${JSON.stringify(summary.metadata, null, 2)}\n`, "utf8");
  return summary;
};
