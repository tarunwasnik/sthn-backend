/** Offline research contracts. This module performs no I/O and has no production authority. */
import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const shortText = z.string().trim().min(1).max(500);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});
// A locator is metadata only. It is deliberately not resolved or opened by this framework.
const locator = z.string().min(1).max(240).regex(/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*$/)
  .refine(value => value.split("/").every(part => part !== "." && part !== ".."));
const conditions = z.object({
  device: z.enum(["PHONE", "WEBCAM", "OTHER", "UNKNOWN"]),
  lighting: z.enum(["NORMAL", "LOW", "BRIGHT", "BACKLIT", "OTHER", "UNKNOWN"]),
  quality: z.enum(["NORMAL", "LOW", "OCCLUDED", "OTHER", "UNKNOWN"]),
}).strict();
const capture = z.object({ id, artifact: locator }).strict();
const sample = z.object({
  id, target: z.enum(["USER", "CREATOR"]), split: z.enum(["DEVELOPMENT", "CALIBRATION", "HOLDOUT"]),
  subject: id, referenceSubject: id, referenceArtifact: locator,
  truth: z.enum(["GENUINE", "IMPOSTOR"]).nullable(),
  captures: z.array(capture).length(5), conditions,
}).strict();
const presentation = z.object({
  id, subject: id, split: z.enum(["DEVELOPMENT", "CALIBRATION", "HOLDOUT"]),
  truth: z.enum(["ATTACK", "BONA_FIDE"]).nullable(),
  instrument: z.enum(["PRINT", "SCREEN", "REPLAY", "OTHER", "UNKNOWN"]).nullable(),
  artifact: locator, conditions,
}).strict().refine(p => p.truth !== "BONA_FIDE" || p.instrument === null)
  .refine(p => p.truth !== "ATTACK" || p.instrument !== null);

const schema = z.object({
  schemaVersion: z.literal("STHN_BIOMETRIC_EVAL_V1"), datasetId: id,
  provenance: shortText, authorizedUseBasis: shortText, licenseConditions: shortText,
  retention: z.object({ deleteBy: day, deletionRequirements: shortText }).strict(),
  samples: z.array(sample).max(10000), presentations: z.array(presentation).max(10000),
}).strict();

export type Manifest = z.infer<typeof schema>;
export function validateManifest(input: unknown, asOf: string): Manifest {
  const checkedDay = day.safeParse(asOf);
  const parsed = schema.safeParse(input);
  if (!checkedDay.success || !parsed.success) throw new Error("INVALID_MANIFEST");
  const m = parsed.data;
  if (m.retention.deleteBy < asOf) throw new Error("EXPIRED_MANIFEST");
  const ids = new Set<string>();
  const subjects = new Map<string, string>();
  const artifacts = new Map<string, string>();
  const record = (subject: string, split: string) => {
    const previous = subjects.get(subject);
    if (previous && previous !== split) throw new Error("SUBJECT_SPLIT_OVERLAP");
    subjects.set(subject, split);
  };
  const artifact = (value: string, split: string) => {
    const normalized = value.toLowerCase();
    const previous = artifacts.get(normalized);
    if (previous && previous !== split) throw new Error("ARTIFACT_SPLIT_OVERLAP");
    artifacts.set(normalized, split);
  };
  for (const s of m.samples) {
    if (ids.has(s.id)) throw new Error("DUPLICATE_RECORD"); ids.add(s.id);
    if (s.truth === "GENUINE" && s.subject !== s.referenceSubject || s.truth === "IMPOSTOR" && s.subject === s.referenceSubject) throw new Error("TRUTH_CONFLICT");
    if (new Set(s.captures.map(c => c.id)).size !== 5 || new Set(s.captures.map(c => c.artifact.toLowerCase())).size !== 5) throw new Error("DUPLICATE_CAPTURE");
    record(s.subject, s.split); record(s.referenceSubject, s.split);
    artifact(s.referenceArtifact, s.split); s.captures.forEach(c => artifact(c.artifact, s.split));
  }
  for (const p of m.presentations) {
    if (ids.has(p.id)) throw new Error("DUPLICATE_RECORD"); ids.add(p.id);
    record(p.subject, p.split); artifact(p.artifact, p.split);
  }
  return m;
}
