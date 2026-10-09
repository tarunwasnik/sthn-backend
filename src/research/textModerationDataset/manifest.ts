import crypto from "node:crypto";
import fs from "node:fs";
import { AcquisitionArtifactRecord, AcquisitionManifest, ACQUISITION_MANIFEST_VERSION } from "./contracts";
import { requireTrainingSource } from "./registries";

const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)])) : value;
export const canonicalJson = (value: unknown): string => `${JSON.stringify(ordered(value), null, 2)}\n`;
export const sha256 = (bytes: Buffer): string => crypto.createHash("sha256").update(bytes).digest("hex");

export const verifyArtifactRecord = (root: string, artifact: AcquisitionArtifactRecord): void => {
  const source = requireTrainingSource(artifact.sourceId);
  const expected = source.expectedArtifacts.find((item) => item.artifactId === artifact.artifactId);
  if (!expected || expected.authoritativeUrl !== artifact.authoritativeUrl || source.revision !== artifact.revision) throw new Error(`Unregistered artifact ${artifact.artifactId}`);
  if (expected.expectedByteSize !== undefined && artifact.byteSize !== expected.expectedByteSize) throw new Error(`Registered byte-size mismatch for ${artifact.artifactId}`);
  if (expected.expectedSha256 !== undefined && artifact.sha256 !== expected.expectedSha256) throw new Error(`Registered checksum mismatch for ${artifact.artifactId}`);
  const bytes = fs.readFileSync(`${root}/${artifact.sourceId}/${artifact.filename}`);
  if (bytes.length !== artifact.byteSize || sha256(bytes) !== artifact.sha256) throw new Error(`Integrity mismatch for ${artifact.artifactId}`);
};
export const buildManifest = (artifacts: readonly AcquisitionArtifactRecord[], createdAt: string): AcquisitionManifest => ({
  manifestVersion: ACQUISITION_MANIFEST_VERSION, createdAt, artifacts: [...artifacts].sort((a, b) => a.artifactId.localeCompare(b.artifactId)),
});
