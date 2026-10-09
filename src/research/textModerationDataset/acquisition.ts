import fs from "node:fs";
import path from "node:path";
import { AcquisitionArtifactRecord, SourceId } from "./contracts";
import { parseCsv } from "./csv";
import { buildManifest, canonicalJson, sha256, verifyArtifactRecord } from "./manifest";
import { requireTrainingSource } from "./registries";
import { stageHatemoji, stageToxigen } from "./staging";

export interface SourceAcquisitionResult { sourceId: SourceId; status: "ACQUIRED" | "BLOCKED"; artifactCount: number; rowCount: number; reason: string | null; }
const ROOT = path.resolve(process.cwd(), "dataset-research", "text-moderation");
const writeAtomic = (filename: string, bytes: Buffer | string): void => { const temp = `${filename}.partial`; fs.writeFileSync(temp, bytes); fs.renameSync(temp, filename); };

const download = async (url: string): Promise<Buffer> => {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "STHN-T6L-6E-provenance-acquisition/1" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
};

export const acquireStaticCsvSource = async (sourceId: "HATEMOJI_BUILD" | "TOXIGEN_ANNOTATED", retrievedAt = new Date().toISOString()): Promise<{ result: SourceAcquisitionResult; artifacts: readonly AcquisitionArtifactRecord[] }> => {
  const source = requireTrainingSource(sourceId); const sourceRoot = path.join(ROOT, sourceId); fs.mkdirSync(sourceRoot, { recursive: true });
  const artifacts: AcquisitionArtifactRecord[] = []; const stagedRows = []; const downloads: { filename: string; bytes: Buffer }[] = [];
  for (const expected of source.expectedArtifacts) {
    const bytes = await download(expected.authoritativeUrl); const records = parseCsv(bytes.toString("utf8"));
    if (records.length !== expected.expectedRowCount) throw new Error(`${expected.artifactId} row-count drift: expected ${expected.expectedRowCount}, received ${records.length}`);
    const staged = sourceId === "HATEMOJI_BUILD" ? stageHatemoji(records, expected.expectedSplit, retrievedAt) : stageToxigen(records, expected.expectedSplit, expected.artifactId, retrievedAt);
    downloads.push({ filename: expected.filename, bytes });
    const artifact: AcquisitionArtifactRecord = { sourceId, artifactId: expected.artifactId, filename: expected.filename, authoritativeUrl: expected.authoritativeUrl,
      version: source.version, revision: source.revision, configuration: expected.configuration, expectedSplit: expected.expectedSplit, contentRole: expected.contentRole,
      byteSize: bytes.length, sha256: sha256(bytes), upstreamChecksum: null, retrievedAt };
    artifacts.push(artifact); stagedRows.push(...staged);
  }
  downloads.forEach((item) => writeAtomic(path.join(sourceRoot, item.filename), item.bytes));
  writeAtomic(path.join(sourceRoot, "provenance-staging.jsonl"), `${stagedRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  return { result: { sourceId, status: "ACQUIRED", artifactCount: artifacts.length, rowCount: stagedRows.length, reason: null }, artifacts };
};

export const acquireAuthorizedSources = async (): Promise<{ results: readonly SourceAcquisitionResult[]; artifacts: readonly AcquisitionArtifactRecord[] }> => {
  fs.mkdirSync(ROOT, { recursive: true }); const now = new Date().toISOString(); const results: SourceAcquisitionResult[] = []; const artifacts: AcquisitionArtifactRecord[] = [];
  for (const sourceId of ["HATEMOJI_BUILD", "TOXIGEN_ANNOTATED"] as const) {
    try { const acquired = await acquireStaticCsvSource(sourceId, now); results.push(acquired.result); artifacts.push(...acquired.artifacts); }
    catch (error) { results.push({ sourceId, status: "BLOCKED", artifactCount: 0, rowCount: 0, reason: error instanceof Error ? error.message : String(error) }); }
  }
  results.push({ sourceId: "CIVIL_COMMENTS_1_2_4", status: "BLOCKED", artifactCount: 0, rowCount: 0, reason: "Pinned TFDS 1.2.4 materialization requires an unavailable TensorFlow Datasets runtime; dependency additions are outside T6L-6E." });
  results.push({ sourceId: "MEASURING_HATE_SPEECH", status: "BLOCKED", artifactCount: 0, rowCount: 0, reason: "The pinned publisher revision exposes Parquet artifacts; no repository-native Parquet reader is available and dependency additions are outside T6L-6E." });
  const manifest = buildManifest(artifacts, now); writeAtomic(path.join(ROOT, "acquisition-manifest.json"), canonicalJson(manifest));
  artifacts.forEach((artifact) => verifyArtifactRecord(ROOT, artifact));
  writeAtomic(path.join(ROOT, "acquisition-results.json"), canonicalJson({ createdAt: now, results }));
  return { results, artifacts };
};
