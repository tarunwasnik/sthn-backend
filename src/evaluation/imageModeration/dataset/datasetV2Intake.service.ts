import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export type DatasetV2Pool = "DEVELOPMENT" | "HOLDOUT";
export type DatasetV2Flag = "EXACT_DUPLICATE" | "NEAR_DUPLICATE_CANDIDATE" | "CROSS_POOL_LEAKAGE" | "V1_REFERENCE_COLLISION";
export type DatasetV2Candidate = Readonly<{ candidateId: string; pool: DatasetV2Pool; sha256: string; dHash: string; format: string; width: number; height: number; bytes: number; sourceGroup: string; acquisitionBatch: string; state: "REVIEW_REQUIRED"; relativeAsset: string; flags: readonly DatasetV2Flag[]; leakageGroups: readonly string[] }>;
export type DatasetV2Reference = Readonly<{ candidateId: string; sha256: string; dHash?: string; sourceGroup?: string }>;
export type DatasetV2Manifest = Readonly<{ schemaVersion: "STHN_DATASET_V2_INTAKE_V1"; candidates: readonly DatasetV2Candidate[]; fingerprint: string; poolFingerprints: Readonly<Record<DatasetV2Pool, string>> }>;
export type DatasetV2Input = Readonly<{ pool: DatasetV2Pool; bytes: Buffer; name: string; sourceGroup?: string; acquisitionBatch?: string }>;

const manifestFile = (root: string) => path.join(root, "intake-manifest.json");
const ordered = <T extends DatasetV2Candidate>(items: readonly T[]) => [...items].sort((a, b) => a.candidateId.localeCompare(b.candidateId));
const canonicalCandidate = (x: DatasetV2Candidate) => ({ ...x, flags: [...x.flags].sort(), leakageGroups: [...x.leakageGroups].sort() });
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const datasetV2Root = (root = process.cwd()) => path.resolve(root, "evaluation-cache", "image-moderation", "dataset-v2");
export const datasetV2ManifestFingerprint = (candidates: readonly DatasetV2Candidate[]) => fingerprint(ordered(candidates).map(canonicalCandidate));
export const datasetV2PoolFingerprint = (candidates: readonly DatasetV2Candidate[], pool: DatasetV2Pool) => datasetV2ManifestFingerprint(candidates.filter((x) => x.pool === pool));
const makeManifest = (candidates: readonly DatasetV2Candidate[]): DatasetV2Manifest => ({ schemaVersion: "STHN_DATASET_V2_INTAKE_V1", candidates: ordered(candidates), fingerprint: datasetV2ManifestFingerprint(candidates), poolFingerprints: { DEVELOPMENT: datasetV2PoolFingerprint(candidates, "DEVELOPMENT"), HOLDOUT: datasetV2PoolFingerprint(candidates, "HOLDOUT") } });

export const dHash = async (bytes: Buffer) => {
  const raw = await sharp(bytes, { failOn: "error" }).rotate().removeAlpha().resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer();
  let bits = ""; for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits += raw[y * 9 + x] > raw[y * 9 + x + 1] ? "1" : "0";
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
};
export const hamming = (a: string, b: string) => { let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`); let count = 0; while (value) { count += Number(value & 1n); value >>= 1n; } return count; };
const imageExtension = (format: string) => format === "jpeg" ? "jpg" : format;
const sourceGroup = (value?: string) => value?.trim().slice(0, 120) || "UNASSIGNED";
const batch = (value?: string) => value?.trim().slice(0, 120) || "LOCAL_INTAKE";

export const repositorySafeDatasetV2Manifest = (manifest: DatasetV2Manifest) => ({ schemaVersion: manifest.schemaVersion, fingerprint: manifest.fingerprint, poolFingerprints: manifest.poolFingerprints, candidates: manifest.candidates.map(({ relativeAsset: _asset, ...candidate }) => candidate) });
export const loadDatasetV2Manifest = async (root = datasetV2Root()): Promise<DatasetV2Manifest> => { try { const parsed = JSON.parse(await readFile(manifestFile(root), "utf8")) as DatasetV2Manifest; return parsed.schemaVersion === "STHN_DATASET_V2_INTAKE_V1" ? makeManifest(parsed.candidates) : makeManifest([]); } catch { return makeManifest([]); } };

export const intakeDatasetV2 = async (input: Readonly<{ root?: string; files: readonly DatasetV2Input[]; existing?: readonly DatasetV2Candidate[]; references?: readonly DatasetV2Reference[]; nearDistance?: number }>) => {
  const root = input.root ?? datasetV2Root(); const existing = [...(input.existing ?? [])]; const references = input.references ?? []; const admitted: DatasetV2Candidate[] = []; const nearDistance = input.nearDistance ?? 8;
  for (const file of input.files) try {
    const metadata = await sharp(file.bytes, { failOn: "error" }).metadata();
    if (!metadata.format || !metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format) || file.bytes.length > 10 * 1024 * 1024) throw new Error("Unsupported or invalid image");
    const sha256 = createHash("sha256").update(file.bytes).digest("hex"); const hash = await dHash(file.bytes); const all = [...existing, ...admitted];
    const exact = all.filter((x) => x.sha256 === sha256); const near = all.filter((x) => x.sha256 !== sha256 && hamming(x.dHash, hash) <= nearDistance); const referenceExact = references.filter((x) => x.sha256 === sha256); const referenceNear = references.filter((x) => x.dHash && hamming(x.dHash, hash) <= nearDistance);
    const flags = new Set<DatasetV2Flag>(); if (exact.length) flags.add("EXACT_DUPLICATE"); if (near.length || referenceNear.length) flags.add("NEAR_DUPLICATE_CANDIDATE"); if (referenceExact.length) flags.add("V1_REFERENCE_COLLISION"); if ([...exact, ...near].some((x) => x.pool !== file.pool)) flags.add("CROSS_POOL_LEAKAGE");
    const groups = new Set<string>([`EXACT:${sha256}`, `SOURCE:${sourceGroup(file.sourceGroup)}`]); for (const match of near) groups.add(`NEAR:${[hash, match.dHash].sort().join(":")}`);
    admitted.push({ candidateId: `v2-${sha256.slice(0, 24)}`, pool: file.pool, sha256, dHash: hash, format: metadata.format, width: metadata.width, height: metadata.height, bytes: file.bytes.length, sourceGroup: sourceGroup(file.sourceGroup), acquisitionBatch: batch(file.acquisitionBatch), state: "REVIEW_REQUIRED", relativeAsset: `assets/${sha256.slice(0, 24)}.${imageExtension(metadata.format)}`, flags: [...flags].sort(), leakageGroups: [...groups].sort() });
  } catch { /* invalid files are reported, not admitted */ }
  const manifest = makeManifest([...existing, ...admitted]); await mkdir(root, { recursive: true }); await writeFile(manifestFile(root), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, discovered: input.files.length, valid: admitted.length, invalid: input.files.length - admitted.length, exactDuplicates: admitted.filter((x) => x.flags.includes("EXACT_DUPLICATE")).length, nearDuplicates: admitted.filter((x) => x.flags.includes("NEAR_DUPLICATE_CANDIDATE")).length, crossPoolLeakage: admitted.filter((x) => x.flags.includes("CROSS_POOL_LEAKAGE")).length, admittedReviewRequired: admitted.filter((x) => x.state === "REVIEW_REQUIRED").length };
};

export const applyManualLeakageGroup = (manifest: DatasetV2Manifest, candidateIds: readonly string[], group: string): DatasetV2Manifest => {
  const ids = new Set(candidateIds); const name = group.trim().slice(0, 120); if (!name || !ids.size || !manifest.candidates.filter((x) => ids.has(x.candidateId)).length) throw new Error("A non-empty known candidate group is required");
  const selected = manifest.candidates.filter((x) => ids.has(x.candidateId)); const crossPool = new Set(selected.map((x) => x.pool)).size > 1;
  return makeManifest(manifest.candidates.map((candidate) => !ids.has(candidate.candidateId) ? candidate : { ...candidate, leakageGroups: [...new Set([...candidate.leakageGroups, `MANUAL:${name}`])].sort(), flags: crossPool ? [...new Set([...candidate.flags, "CROSS_POOL_LEAKAGE" as const])].sort() : candidate.flags }));
};

export const scanDatasetV2Incoming = async (root = datasetV2Root()): Promise<DatasetV2Input[]> => {
  const result: DatasetV2Input[] = [];
  for (const [folder, pool] of [["development", "DEVELOPMENT"], ["holdout", "HOLDOUT"]] as const) { const directory = path.join(root, "incoming", folder); let entries: import("node:fs").Dirent[] = []; try { entries = await readdir(directory, { withFileTypes: true }); } catch { continue; } for (const entry of entries.filter((x) => x.isFile()).sort((a, b) => a.name.localeCompare(b.name))) result.push({ pool, name: entry.name, bytes: await readFile(path.join(directory, entry.name)), sourceGroup: folder, acquisitionBatch: "LOCAL_INTAKE" }); }
  return result;
};
