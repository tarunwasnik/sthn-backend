import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "./manifest";
import { EXTERNAL_DATASET_INTAKE_VERSION, EXTERNAL_DATASET_ROOT, ExternalSourceDefinition, externalSourceRegistry, assertExternalIntakePath } from "./externalDatasetIntake";
import { inventoryZipArchive } from "./externalZipInventory";

const VERSION = "T6L_8G_A2_EXTERNAL_DATASET_CERTIFICATION_V1";
type Json = Record<string, unknown>;
const hash = (bytes: Buffer | string): string => crypto.createHash("sha256").update(bytes).digest("hex");
const payloadDigest = (value: unknown): string => hash(canonicalJson(value));
const readJson = (filename: string): Json => JSON.parse(fs.readFileSync(filename, "utf8")) as Json;
const writeAtomic = (filename: string, value: unknown): void => { assertExternalIntakePath(filename); fs.mkdirSync(path.dirname(filename), { recursive: true }); const partial = `${filename}.${process.pid}.partial`; fs.writeFileSync(partial, canonicalJson(value)); fs.renameSync(partial, filename); };
const sourceRoot = (source: ExternalSourceDefinition): string => path.join(EXTERNAL_DATASET_ROOT, source.sourceId);
const manifestPath = (source: ExternalSourceDefinition): string => path.join(sourceRoot(source), "inventory", "source-manifest.json");
const artifactEvidence = (filename: string): { byteSize: number; sha256: string } => { const bytes = fs.readFileSync(filename); return { byteSize: bytes.length, sha256: hash(bytes) }; };
const noRawText = (value: Json): boolean => value.rawTextEmbedded === false && !JSON.stringify(value).includes("\"text\":");

export const validateExternalSourceManifest = (source: ExternalSourceDefinition, manifest: Json): { valid: boolean; warnings: readonly string[] } => {
  const warnings: string[] = []; if (manifest.sourceId !== source.sourceId || manifest.canonicalIdentity !== source.canonicalIdentity) warnings.push("identity mismatch");
  if (manifest.roleCandidate !== source.roleCandidate || manifest.annotationProvenance !== source.annotationProvenance) warnings.push("role or annotation-provenance mismatch");
  if (!Array.isArray(manifest.rawArtifacts) || !Array.isArray(manifest.inventories) || !noRawText(manifest)) warnings.push("required bounded manifest shape missing or raw text embedded");
  const artifacts = Array.isArray(manifest.rawArtifacts) ? manifest.rawArtifacts as Json[] : [];
  if (!artifacts.length || artifacts.some((artifact) => typeof artifact.name !== "string" || typeof artifact.byteSize !== "number" || !/^[a-f0-9]{64}$/.test(String(artifact.sha256)))) warnings.push("artifact evidence malformed");
  return { valid: warnings.length === 0, warnings };
};

const recovery = [
  { sourceId: "CONSTRAINT_HINDI_HOSTILITY", oldIdentity: "github:hate-alert/Hate-Speech-Data", recoveryStatus: "UNRESOLVED", evidence: "The official CONSTRAINT shared-task project identifies the Hindi Hostility Detection Dataset, but no publisher-controlled public raw artifact was established." },
  { sourceId: "SOCIAL_BIAS_FRAMES", oldIdentity: "huggingface:allenai/social_bias_frames via raw siblings", recoveryIdentity: "huggingface:allenai/social_bias_frames via datasets-server Parquet export", recoveryStatus: "RECOVERED", evidence: "Hugging Face dataset card documents official train/validation/test splits and CC-BY-4.0; its host-native Parquet export replaces the unsupported loading-script path." },
  { sourceId: "OLID_OFFENSEVAL", oldIdentity: "github:USC-NLP/OLID", recoveryStatus: "UNRESOLVED", evidence: "The configured repository is absent. Public copies exist, but no publisher-controlled replacement was established, so no mirror is substituted." },
] as const;

export const prepareExternalDatasetCertification = (): { preparationPath: string; preparationSha256: string; payloadDigest: string } => {
  const registryPath = path.join(EXTERNAL_DATASET_ROOT, "acquisition-registry.json"); const prior = fs.existsSync(registryPath) ? readJson(registryPath) : null;
  const sourceChecks = externalSourceRegistry.map((source) => { const filename = manifestPath(source); if (!fs.existsSync(filename)) return { sourceId: source.sourceId, manifestFound: false, structurallyValid: null }; const manifest = readJson(filename); return { sourceId: source.sourceId, manifestFound: true, structurallyValid: validateExternalSourceManifest(source, manifest).valid, manifestSha256: hash(fs.readFileSync(filename)) }; });
  const payload = { authority: "LOCAL_EXTERNAL_DATASET_CERTIFICATION_AND_RECOVERY_READY", certificationVersion: VERSION, priorRegistryVersion: prior?.registryVersion ?? null, sourceChecks, recovery, targetedSourceIds: ["CONSTRAINT_HINDI_HOSTILITY", "SOCIAL_BIAS_FRAMES", "OLID_OFFENSEVAL"], reuseExistingAcquiredArtifacts: true, resourceDiagnostics: { authoritativeForEligibility: false }, protectedSourceAccess: false, modelLoads: 0, forwardPasses: 0, trainingRuns: 0, thresholdSelections: 0 };
  const preparationPath = path.join(EXTERNAL_DATASET_ROOT, "a2-certification-preparation.json"); writeAtomic(preparationPath, payload); return { preparationPath, preparationSha256: hash(fs.readFileSync(preparationPath)), payloadDigest: payloadDigest(payload) };
};

export const certifyExternalDatasetAcquisition = (): Json => {
  const sources = externalSourceRegistry.map((source) => { const filename = manifestPath(source); if (!fs.existsSync(filename)) return { sourceId: source.sourceId, status: source.sourceId === "JIGSAW_TOXIC_COMMENT_CHALLENGE" ? "AUTH_REQUIRED" : "UNAVAILABLE", roleCandidate: source.roleCandidate, warnings: ["source manifest absent"] }; const manifest = readJson(filename); const validation = validateExternalSourceManifest(source, manifest); const artifacts = manifest.rawArtifacts as Json[]; const artifactChecks = artifacts.map((artifact) => { const artifactPath = path.join(sourceRoot(source), "raw", String(artifact.name)); if (!fs.existsSync(artifactPath)) return { name: artifact.name, valid: false, reason: "raw artifact missing" }; const actual = artifactEvidence(artifactPath); return { name: artifact.name, valid: actual.byteSize === artifact.byteSize && actual.sha256 === artifact.sha256, ...actual }; }); const overlayPath = path.join(sourceRoot(source), "inventory", "archive-inventory-v1.json"); const overlay = fs.existsSync(overlayPath) ? readJson(overlayPath) : null; const inventory = overlay ? ((overlay.inventory as Json).selectedMembers as Json[]) : manifest.inventories as Json[]; const schemaSupported = inventory.every((item) => item.schemaStatus !== "NOT_YET_SUPPORTED"); return { sourceId: source.sourceId, status: !validation.valid || artifactChecks.some((item) => !item.valid) ? "INTEGRITY_FAILED" : schemaSupported ? "ACQUIRED" : "SCHEMA_UNSUPPORTED", roleCandidate: source.roleCandidate, annotationProvenance: source.annotationProvenance, manifestSha256: hash(fs.readFileSync(filename)), archiveOverlaySha256: overlay ? hash(fs.readFileSync(overlayPath)) : null, artifactChecks, inventory, warnings: validation.warnings }; });
  const inventory = { inventoryVersion: "T6L_8G_A2R_FINAL_INVENTORY_V1", sourceStatuses: sources, recovery, rawTextEmbedded: false, resourceDiagnostics: { authoritativeForEligibility: false } }; const inventoryPath = path.join(EXTERNAL_DATASET_ROOT, "external-dataset-final-inventory-v1.json"); writeAtomic(inventoryPath, inventory);
  const payload = { certificationVersion: "T6L_8G_A2R_FINAL_CERTIFICATION_V1", status: sources.every((source) => source.status !== "INTEGRITY_FAILED") ? "EXTERNAL_DATASET_INVENTORY_CERTIFIED" : "EXTERNAL_DATASET_INVENTORY_INTEGRITY_FAILURE", a2HistoricalCertificationPath: path.join(EXTERNAL_DATASET_ROOT, "external-dataset-acquisition-certification-v1.json"), finalInventoryPath: inventoryPath, finalInventorySha256: hash(fs.readFileSync(inventoryPath)), sourceStatuses: sources, recovery, protectedSourceAccess: false, modelLoads: 0, forwardPasses: 0, trainingRuns: 0, thresholdSelections: 0, resourceDiagnostics: { authoritativeForEligibility: false }, rawTextEmbedded: false };
  const filename = path.join(EXTERNAL_DATASET_ROOT, "external-dataset-inventory-certification-a2r-v1.json"); writeAtomic(filename, payload); return { certificationPath: filename, certificationSha256: hash(fs.readFileSync(filename)), payloadDigest: payloadDigest(payload), finalInventoryPayloadDigest: payloadDigest(inventory), ...payload };
};

const archiveRepairIds = ["DYNAHATE", "ETHOS_HATE_SPEECH", "HATECHECK", "MULTILINGUAL_HATECHECK"] as const;
export const repairExternalDatasetArchives = (): Json => {
  const repaired = archiveRepairIds.map((sourceId) => { const source = externalSourceRegistry.find((item) => item.sourceId === sourceId); if (!source) throw new Error(`Missing archive repair source ${sourceId}`); const manifest = readJson(manifestPath(source)); const artifact = (manifest.rawArtifacts as Json[])[0]; const archive = path.join(sourceRoot(source), "raw", String(artifact.name)); const evidence = artifactEvidence(archive); if (evidence.byteSize !== artifact.byteSize || evidence.sha256 !== artifact.sha256) throw new Error(`${sourceId} archive integrity mismatch`); const inventory = inventoryZipArchive(archive, source); const payload = { repairVersion: "T6L_8G_A2R_ARCHIVE_INVENTORY_V1", sourceId, roleCandidate: source.roleCandidate, annotationProvenance: source.annotationProvenance, archiveEvidence: { name: artifact.name, ...evidence }, inventory, rawTextEmbedded: false, modelLoads: 0, forwardPasses: 0, trainingRuns: 0, thresholdSelections: 0 }; const output = path.join(sourceRoot(source), "inventory", "archive-inventory-v1.json"); writeAtomic(output, payload); return { sourceId, inventoryPath: output, inventorySha256: hash(fs.readFileSync(output)) }; });
  const payload = { authority: "LOCAL_EXTERNAL_DATASET_ARCHIVE_REPAIR_READY", repairVersion: "T6L_8G_A2R_ARCHIVE_INVENTORY_V1", repaired, sbicRecoveryTarget: "SOCIAL_BIAS_FRAMES", reuseExistingArchiveBytes: true, protectedSourceAccess: false, modelLoads: 0, forwardPasses: 0, trainingRuns: 0, thresholdSelections: 0, resourceDiagnostics: { authoritativeForEligibility: false } }; const output = path.join(EXTERNAL_DATASET_ROOT, "a2r-archive-repair-result.json"); writeAtomic(output, payload); return { repairPath: output, repairSha256: hash(fs.readFileSync(output)), payloadDigest: payloadDigest(payload), ...payload };
};
