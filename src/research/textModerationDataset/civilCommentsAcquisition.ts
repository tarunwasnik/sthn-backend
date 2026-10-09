import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { AcquisitionArtifactRecord, AcquisitionManifest } from "./contracts";
import { canonicalJson, sha256, verifyArtifactRecord } from "./manifest";
import { requireTrainingSource } from "./registries";
import { stageCivilComment } from "./staging";
import { streamCsv } from "./streamCsv";

const ROOT = path.resolve(process.cwd(), "dataset-research", "text-moderation");
const SOURCE_ROOT = path.join(ROOT, "CIVIL_COMMENTS_1_2_4");
const LABELS = ["toxicity", "severe_toxicity", "obscene", "threat", "insult", "identity_attack", "sexual_explicit"] as const;
const IDENTITY_LABELS = ["male", "female", "transgender", "other_gender", "heterosexual", "homosexual_gay_or_lesbian", "bisexual", "other_sexual_orientation", "christian", "jewish", "muslim", "hindu", "buddhist", "atheist", "other_religion", "black", "white", "asian", "latino", "other_race_or_ethnicity", "physical_disability", "intellectual_or_learning_disability", "psychiatric_or_mental_illness", "other_disability"] as const;
const EXPECTED_SPLITS: Readonly<Record<string, number>> = { train: 1804874, test_public: 97320, test_private: 97320 };

const assertGeneratedPath = (target: string): void => {
  const resolved = path.resolve(target); if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error(`Generated path escaped research root: ${resolved}`);
};
const writeJsonAtomic = (filename: string, value: unknown): void => { const temporary = `${filename}.partial`; fs.writeFileSync(temporary, canonicalJson(value)); fs.renameSync(temporary, filename); };

const downloadHttps = (url: string, target: string): Promise<{ byteSize: number; sha256: string }> => new Promise((resolve, reject) => {
  const temporary = `${target}.partial`; assertGeneratedPath(temporary); const hash = crypto.createHash("sha256"); let byteSize = 0;
  const request = https.get(url, { headers: { "user-agent": "STHN-T6L-6F-civil-comments/1" } }, (response) => {
    if (response.statusCode !== 200) { response.resume(); fs.rmSync(temporary, { force: true }); reject(new Error(`HTTP ${response.statusCode ?? "unknown"} for ${url}`)); return; }
    const output = fs.createWriteStream(temporary, { flags: "w" });
    response.on("data", (chunk: Buffer) => { byteSize += chunk.length; hash.update(chunk); }); response.pipe(output);
    output.on("finish", () => { output.close(); fs.renameSync(temporary, target); resolve({ byteSize, sha256: hash.digest("hex") }); });
    output.on("error", reject); response.on("error", reject);
  }); request.on("error", reject);
});

const stageArchive = async (csvPath: string, retrievedAt: string, outputPath: string): Promise<Readonly<Record<string, number>>> => {
  const temporary = `${outputPath}.partial`; fs.rmSync(temporary, { force: true }); const output = fs.createWriteStream(temporary, { encoding: "utf8" });
  const counts: Record<string, number> = { train: 0, test_public: 0, test_private: 0 }; const ids = new Set<string>();
  try {
    for await (const sourceRow of streamCsv(csvPath)) {
      const split = sourceRow.split; if (!(split in EXPECTED_SPLITS)) throw new Error(`Civil Comments unexpected split ${split}`);
      if (LABELS.some((label) => sourceRow[label] === "")) continue;
      if (!sourceRow.id?.trim() || !sourceRow.comment_text?.trim()) throw new Error("Civil Comments missing stable id or text");
      if (ids.has(sourceRow.id)) throw new Error(`Civil Comments duplicate id ${sourceRow.id}`); ids.add(sourceRow.id);
      const numeric = Object.fromEntries(LABELS.map((label) => { const value = Number(sourceRow[label]); if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`Civil Comments invalid ${label}`); return [label, value]; })) as Record<typeof LABELS[number], number>;
      const staged = stageCivilComment({ id: sourceRow.id, text: sourceRow.comment_text, ...numeric }, split, retrievedAt);
      const identityLabels = Object.fromEntries(IDENTITY_LABELS.filter((label) => sourceRow[label] !== "").map((label) => [`identity.${label}`, Number(sourceRow[label])]));
      const serialized = JSON.stringify({ ...staged, originalLabels: { ...staged.originalLabels, ...identityLabels } });
      if (!output.write(`${serialized}\n`)) await once(output, "drain"); counts[split] += 1;
    }
    for (const [split, expected] of Object.entries(EXPECTED_SPLITS)) if (counts[split] !== expected) throw new Error(`Civil Comments ${split} row-count drift: expected ${expected}, received ${counts[split]}`);
    output.end(); await once(output, "finish"); fs.renameSync(temporary, outputPath); return counts;
  } catch (error) { output.destroy(); fs.rmSync(temporary, { force: true }); throw error; }
};

export const acquireCivilComments = async (): Promise<{ artifact: AcquisitionArtifactRecord; rowCounts: Readonly<Record<string, number>> }> => {
  const source = requireTrainingSource("CIVIL_COMMENTS_1_2_4"); const expected = source.expectedArtifacts[0]; const retrievedAt = new Date().toISOString();
  fs.mkdirSync(SOURCE_ROOT, { recursive: true }); const archive = path.join(SOURCE_ROOT, expected.filename); assertGeneratedPath(archive);
  let evidence: { byteSize: number; sha256: string };
  if (fs.existsSync(archive)) { const bytes = fs.readFileSync(archive); evidence = { byteSize: bytes.length, sha256: sha256(bytes) }; } else evidence = await downloadHttps(expected.authoritativeUrl, archive);
  if (evidence.byteSize !== expected.expectedByteSize || evidence.sha256 !== expected.expectedSha256) throw new Error(`Civil Comments upstream archive integrity mismatch`);
  const extracted = path.join(SOURCE_ROOT, "extracted"); assertGeneratedPath(extracted); fs.rmSync(extracted, { recursive: true, force: true }); fs.mkdirSync(extracted);
  const extraction = spawnSync("tar", ["-xf", archive, "-C", extracted], { encoding: "utf8", windowsHide: true });
  if (extraction.status !== 0) throw new Error(`Civil Comments archive extraction failed: ${extraction.stderr.trim()}`);
  const csvPath = path.join(extracted, "civil_comments.csv"); if (!fs.existsSync(csvPath)) throw new Error("Civil Comments archive lacks civil_comments.csv");
  const rowCounts = await stageArchive(csvPath, retrievedAt, path.join(SOURCE_ROOT, "provenance-staging.jsonl"));
  const artifact: AcquisitionArtifactRecord = { sourceId: source.sourceId, artifactId: expected.artifactId, filename: expected.filename, authoritativeUrl: expected.authoritativeUrl,
    version: source.version, revision: source.revision, configuration: expected.configuration, expectedSplit: expected.expectedSplit, contentRole: expected.contentRole,
    byteSize: evidence.byteSize, sha256: evidence.sha256, upstreamChecksum: expected.expectedSha256 ?? null, retrievedAt };
  const manifestPath = path.join(ROOT, "acquisition-manifest.json"); const current = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as AcquisitionManifest;
  const artifacts = [...current.artifacts.filter((item) => item.sourceId !== source.sourceId), artifact].sort((a, b) => a.artifactId.localeCompare(b.artifactId));
  writeJsonAtomic(manifestPath, { ...current, createdAt: retrievedAt, artifacts }); verifyArtifactRecord(ROOT, artifact);
  const resultPath = path.join(ROOT, "acquisition-results.json"); const prior = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, "utf8")) as { results: { sourceId: string }[] } : { results: [] };
  const result = { sourceId: source.sourceId, status: "ACQUIRED", artifactCount: 1, rowCount: Object.values(rowCounts).reduce((sum, count) => sum + count, 0), reason: null };
  writeJsonAtomic(resultPath, { createdAt: retrievedAt, results: [...prior.results.filter((item) => item.sourceId !== source.sourceId), result] });
  return { artifact, rowCounts };
};
