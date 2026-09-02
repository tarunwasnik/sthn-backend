import path from "node:path";
import { access, readdir, stat, writeFile } from "node:fs/promises";
import { CalibrationManifest, CalibrationSample } from "./sfaceCalibration.types";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const TIER_A_MATCH_COUNT = 20;
const TIER_A_NON_MATCH_COUNT = 20;
const REQUIRED_IMAGES_PER_IDENTITY = 6;

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
  const reuse = (values: string[]) => { const counts = [...new Map(values.map((value) => [value, values.filter((candidate) => candidate === value).length])).values()]; return { unique: counts.length, average: values.length / counts.length, maximum: Math.max(...counts) }; };
  return { manifest: { schemaVersion: "STHN_SFACE_CALIBRATION_MANIFEST_V1" as const, samples }, metadata: { schemaVersion: "STHN_VGGFACE2_TIER_C_PREPARATION_V1", selectionMethod: "LEXICAL_IDENTITY_AND_ORDERED_PAIR_V1", matchTarget, nonMatchTarget, uniqueMatchReferenceIdentities: matchTarget, uniqueNonMatchReferenceIdentities: identities.length, uniqueNonMatchCaptureIdentities: identities.length, totalDistinctIdentities: identities.length, uniqueOrderedNonMatchPairs: new Set(pairKeys).size, duplicateOrderedPairs: pairKeys.length - new Set(pairKeys).size, reversedPairCounterparts: 0, exactDuplicateComparisons: samples.length - comparisons.size, referenceFiles: reuse(refs), captureFiles: reuse(captures) } };
};
export const writeVggFace2TierC = async (testRoot: string, manifestPath: string) => { const summary = await prepareVggFace2TierC(testRoot, path.dirname(path.resolve(manifestPath))); await writeFile(manifestPath, `${JSON.stringify(summary.manifest, null, 2)}\n`, "utf8"); await writeFile(manifestPath.replace(/\.json$/i, ".preparation.json"), `${JSON.stringify(summary.metadata, null, 2)}\n`, "utf8"); return summary; };

/** Development-only external-dataset writer; the returned manifest never enters application persistence. */
export const writeVggFace2TierA = async (testRoot: string, manifestPath: string) => {
  const resolvedManifestPath = path.resolve(manifestPath);
  const summary = await prepareVggFace2TierA(testRoot, path.dirname(resolvedManifestPath));
  await writeFile(resolvedManifestPath, `${JSON.stringify(summary.manifest, null, 2)}\n`, "utf8");
  await writeFile(resolvedManifestPath.replace(/\.json$/i, ".preparation.json"), `${JSON.stringify(summary.metadata, null, 2)}\n`, "utf8");
  return summary;
};
