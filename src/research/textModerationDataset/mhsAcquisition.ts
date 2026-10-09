import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { AcquisitionArtifactRecord, AcquisitionManifest, SourceScalar } from "./contracts";
import { canonicalJson, verifyArtifactRecord } from "./manifest";
import { requireTrainingSource } from "./registries";
import { stageMeasuringHateSpeech } from "./staging";
import { MeasuringHateSpeechRecord } from "./validators";

const ROOT = path.resolve(process.cwd(), "dataset-research", "text-moderation");
const SOURCE_ROOT = path.join(ROOT, "MEASURING_HATE_SPEECH");
const REQUIRED_COLUMNS = ["comment_id", "annotator_id", "text", "hate_speech_score", "hatespeech", "violence", "genocide", "dehumanize", "insult", "humiliate", "attack_defend"] as const;
type HyparquetModule = typeof import("hyparquet") & { asyncBufferFromFile(filename: string): Promise<import("hyparquet").AsyncBuffer> };

// TypeScript's CommonJS transform rewrites import(); this fixed-specifier bridge preserves native ESM isolation.
const loadHyparquet = (): Promise<HyparquetModule> => (new Function("return import('hyparquet')") as () => Promise<HyparquetModule>)();
const assertGeneratedPath = (target: string): void => { const resolved = path.resolve(target); if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error(`Generated path escaped research root: ${resolved}`); };
const writeJsonAtomic = (filename: string, value: unknown): void => { assertGeneratedPath(filename); const temporary = `${filename}.partial`; fs.writeFileSync(temporary, canonicalJson(value)); fs.renameSync(temporary, filename); };
const writeJsonlAtomic = async (filename: string, rows: readonly unknown[]): Promise<void> => { assertGeneratedPath(filename); const temporary = `${filename}.partial`; const output = fs.createWriteStream(temporary, { encoding: "utf8" });
  for (const row of rows) if (!output.write(`${JSON.stringify(row)}\n`)) await once(output, "drain"); output.end(); await once(output, "finish"); fs.renameSync(temporary, filename); };

const fileEvidence = async (filename: string): Promise<{ byteSize: number; sha256: string }> => {
  const hash = crypto.createHash("sha256"); let byteSize = 0; const input = fs.createReadStream(filename);
  for await (const chunk of input) { const bytes = chunk as Buffer; byteSize += bytes.length; hash.update(bytes); }
  return { byteSize, sha256: hash.digest("hex") };
};
const downloadArtifact = async (url: string, filename: string): Promise<void> => {
  assertGeneratedPath(filename); const temporary = `${filename}.partial`; const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "STHN-T6L-6H-mhs-acquisition/1" } });
  if (!response.ok || !response.body) throw new Error(`MHS artifact download failed: HTTP ${response.status}`);
  const output = fs.createWriteStream(temporary, { flags: "w" }); const reader = response.body.getReader();
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; if (!output.write(Buffer.from(chunk.value))) await once(output, "drain"); } output.end(); await once(output, "finish"); fs.renameSync(temporary, filename); }
  catch (error) { output.destroy(); fs.rmSync(temporary, { force: true }); throw error; }
};

export interface MhsParquetProof { readonly rowCount: number; readonly rowGroupCount: number; readonly commentCount: number | null; readonly columns: readonly string[]; readonly codecs: readonly string[]; }
export const inspectMhsParquet = async (filename: string): Promise<MhsParquetProof> => {
  const parquet = await loadHyparquet(); const file = await parquet.asyncBufferFromFile(filename); const metadata = await parquet.parquetMetadataAsync(file); const schema = parquet.parquetSchema(metadata);
  const columns = schema.children.map((child) => child.element.name); REQUIRED_COLUMNS.forEach((column) => { if (!columns.includes(column)) throw new Error(`MHS Parquet missing required column ${column}`); });
  const codecs = [...new Set(metadata.row_groups.flatMap((group) => group.columns.map((column) => String(column.meta_data?.codec ?? "UNKNOWN"))))].sort();
  return { rowCount: Number(metadata.num_rows), rowGroupCount: metadata.row_groups.length, commentCount: null, columns, codecs };
};

const normalizeScalar = (value: unknown, key: string): SourceScalar => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint" && value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) return Number(value);
  throw new Error(`MHS unsupported decoded value for ${key}: ${typeof value}`);
};

export const readMhsAnnotationRows = async (filename: string, rowEnd?: number): Promise<readonly MeasuringHateSpeechRecord[]> => {
  const parquet = await loadHyparquet(); const file = await parquet.asyncBufferFromFile(filename);
  const decoded = await parquet.parquetReadObjects({ file, ...(rowEnd === undefined ? {} : { rowStart: 0, rowEnd }) });
  return decoded.map((row) => {
    const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeScalar(value, key)]));
    if ((typeof normalized.comment_id !== "number" && typeof normalized.comment_id !== "string") || (typeof normalized.annotator_id !== "number" && typeof normalized.annotator_id !== "string") || typeof normalized.text !== "string") throw new Error("MHS decoded structural schema mismatch");
    return normalized as MeasuringHateSpeechRecord;
  });
};

export const acquireMeasuringHateSpeech = async (): Promise<{ artifact: AcquisitionArtifactRecord; proof: MhsParquetProof }> => {
  const source = requireTrainingSource("MEASURING_HATE_SPEECH"); const expected = source.expectedArtifacts[0]; const retrievedAt = new Date().toISOString();
  fs.mkdirSync(SOURCE_ROOT, { recursive: true }); const archive = path.join(SOURCE_ROOT, expected.filename); assertGeneratedPath(archive); if (!fs.existsSync(archive)) await downloadArtifact(expected.authoritativeUrl, archive);
  const evidence = await fileEvidence(archive); if (evidence.byteSize !== expected.expectedByteSize || evidence.sha256 !== expected.expectedSha256) throw new Error("MHS pinned artifact integrity mismatch");
  const metadataProof = await inspectMhsParquet(archive); if (metadataProof.rowCount !== expected.expectedRowCount) throw new Error(`MHS row-count drift: ${metadataProof.rowCount}`);
  if (metadataProof.codecs.some((codec) => codec !== "SNAPPY" && codec !== "UNCOMPRESSED")) throw new Error(`MHS unsupported codec set: ${metadataProof.codecs.join(",")}`);
  const annotations = await readMhsAnnotationRows(archive); if (annotations.length !== expected.expectedRowCount) throw new Error(`MHS decoded row-count drift: ${annotations.length}`);
  const staged = stageMeasuringHateSpeech(annotations, retrievedAt); if (staged.rows.length !== 39565) throw new Error(`MHS comment-group drift: ${staged.rows.length}`);
  if (staged.restrictedSidecars.length !== annotations.length) throw new Error("MHS annotator-sidecar count mismatch");
  if (staged.rows.some((row) => row.decision !== null || row.primaryCategory !== null || row.secondaryCategories.length || row.mappingVersion !== null || row.split !== "UNASSIGNED" || row.semanticGroupId !== null)) throw new Error("MHS staging attempted authoritative mutation");
  await writeJsonlAtomic(path.join(SOURCE_ROOT, "provenance-staging.jsonl"), staged.rows); await writeJsonlAtomic(path.join(SOURCE_ROOT, "restricted-annotator-sidecars.jsonl"), staged.restrictedSidecars);
  const proof: MhsParquetProof = { ...metadataProof, commentCount: staged.rows.length }; writeJsonAtomic(path.join(SOURCE_ROOT, "parser-proof.json"), proof);
  const artifact: AcquisitionArtifactRecord = { sourceId: source.sourceId, artifactId: expected.artifactId, filename: expected.filename, authoritativeUrl: expected.authoritativeUrl, version: source.version, revision: source.revision,
    configuration: expected.configuration, expectedSplit: expected.expectedSplit, contentRole: expected.contentRole, byteSize: evidence.byteSize, sha256: evidence.sha256, upstreamChecksum: expected.expectedSha256 ?? null, retrievedAt };
  const manifestPath = path.join(ROOT, "acquisition-manifest.json"); const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as AcquisitionManifest;
  writeJsonAtomic(manifestPath, { ...manifest, createdAt: retrievedAt, artifacts: [...manifest.artifacts.filter((item) => item.sourceId !== source.sourceId), artifact].sort((a, b) => a.artifactId.localeCompare(b.artifactId)) }); verifyArtifactRecord(ROOT, artifact);
  const resultsPath = path.join(ROOT, "acquisition-results.json"); const prior = JSON.parse(fs.readFileSync(resultsPath, "utf8")) as { results: { sourceId: string }[] };
  const result = { sourceId: source.sourceId, status: "ACQUIRED", artifactCount: 1, rowCount: staged.rows.length, annotationRowCount: annotations.length, reason: null };
  writeJsonAtomic(resultsPath, { createdAt: retrievedAt, results: [...prior.results.filter((item) => item.sourceId !== source.sourceId), result] });
  return { artifact, proof };
};
