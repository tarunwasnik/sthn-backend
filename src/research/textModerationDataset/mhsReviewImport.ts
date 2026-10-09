import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson, sha256 } from "./manifest";
import {
  ImportedPilotReview, MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST, MHS_REVIEW_PILOT_SIZE, MHS_REVIEW_PILOT_VERSION,
  parseCompletedMhsPilotPacket, selectMhsReviewPilot,
} from "./mhsReviewPilot";
import {
  MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, MHS_REVIEW_TRANCHE_SIZE, MHS_REVIEW_TRANCHE_VERSION,
  MhsReviewTrancheRow, mhsReviewTrancheMembershipDigest, validateMhsReviewTrancheRow,
} from "./mhsReviewTranche";

export const MHS_REVIEW_IMPORT_SCHEMA_VERSION = "STHN_TEXT_MODERATION_MHS_REVIEW_IMPORT_V1" as const;
export const MHS_REVIEWER_A_ID = "reviewer_a_01" as const;
export const MHS_REVIEWER_A_PACKET_SHA256 = "7b474f5025c8175111cf86130222e63a7a023330f0061845f935a9c055a3a6fc" as const;
export const MHS_REVIEWER_A_IMPORT_FILENAME = "mhs-review-pilot-v1-reviewer-a-validated.json" as const;

export interface PersistedMhsPilotReview extends ImportedPilotReview {
  readonly pilotRowNumber: number;
}

export interface MhsPilotReviewImportPayload {
  readonly schemaVersion: typeof MHS_REVIEW_IMPORT_SCHEMA_VERSION;
  readonly validationStatus: "VALIDATED";
  readonly pilotVersion: typeof MHS_REVIEW_PILOT_VERSION;
  readonly parentTrancheVersion: typeof MHS_REVIEW_TRANCHE_VERSION;
  readonly pilotMembershipDigest: typeof MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST;
  readonly parentTrancheMembershipDigest: typeof MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST;
  readonly reviewerRole: "A";
  readonly sourcePacketRole: "A";
  readonly reviewerId: typeof MHS_REVIEWER_A_ID;
  readonly importedPacketFilename: string;
  readonly packetSha256: typeof MHS_REVIEWER_A_PACKET_SHA256;
  readonly importedAt: string;
  readonly rowCount: typeof MHS_REVIEW_PILOT_SIZE;
  readonly reviews: readonly PersistedMhsPilotReview[];
}

export interface MhsPilotReviewImportArtifact extends MhsPilotReviewImportPayload {
  readonly payloadIntegrityDigest: string;
}

type AtomicPublisher = (temporaryPath: string, targetPath: string) => void;
export interface ImportMhsReviewerAOptions {
  readonly packetPath: string;
  readonly parentTranchePath: string;
  readonly outputDirectory: string;
  readonly expectedPacketSha256?: string;
  readonly importedAt?: string;
  readonly publishAtomic?: AtomicPublisher;
}

const artifactPayloadDigest = (payload: MhsPilotReviewImportPayload): string => sha256(Buffer.from(canonicalJson(payload), "utf8"));

export const validateMhsPilotReviewImportArtifact = (artifact: MhsPilotReviewImportArtifact): void => {
  const { payloadIntegrityDigest, ...payload } = artifact;
  if (payload.schemaVersion !== MHS_REVIEW_IMPORT_SCHEMA_VERSION || payload.validationStatus !== "VALIDATED"
    || payload.pilotVersion !== MHS_REVIEW_PILOT_VERSION || payload.parentTrancheVersion !== MHS_REVIEW_TRANCHE_VERSION
    || payload.pilotMembershipDigest !== MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST || payload.parentTrancheMembershipDigest !== MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST
    || payload.reviewerRole !== "A" || payload.sourcePacketRole !== "A" || payload.reviewerId !== MHS_REVIEWER_A_ID
    || payload.packetSha256 !== MHS_REVIEWER_A_PACKET_SHA256 || payload.rowCount !== MHS_REVIEW_PILOT_SIZE
    || payload.reviews.length !== MHS_REVIEW_PILOT_SIZE || !Number.isFinite(Date.parse(payload.importedAt))) throw new Error("Invalid Reviewer A import artifact identity");
  if (payload.reviews.some((item, index) => item.pilotRowNumber !== index + 1 || item.review.slot !== "A" || item.review.reviewerId !== MHS_REVIEWER_A_ID)) throw new Error("Reviewer A import artifact contains a role or row identity mismatch");
  if (payloadIntegrityDigest !== artifactPayloadDigest(payload)) throw new Error("Reviewer A import artifact integrity mismatch");
};

export const writeImmutableFileAtomic = (targetPath: string, contents: string, publishAtomic: AtomicPublisher = fs.linkSync): void => {
  if (fs.existsSync(targetPath)) throw new Error(`Immutable import artifact already exists: ${targetPath}`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.partial`;
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, contents, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = null;
    publishAtomic(temporaryPath, targetPath);
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
};

const assertNoImportConflict = (outputDirectory: string, targetPath: string, packetSha256: string): void => {
  if (fs.existsSync(targetPath)) {
    let detail = "role A is already imported";
    try {
      const existing = JSON.parse(fs.readFileSync(targetPath, "utf8")) as Partial<MhsPilotReviewImportArtifact>;
      if (existing.reviewerId !== MHS_REVIEWER_A_ID || existing.packetSha256 !== packetSha256) detail = "role A is occupied by a different reviewer or packet";
    } catch { detail = "the existing role A artifact cannot be verified"; }
    throw new Error(`Immutable Reviewer A import refused: ${detail}`);
  }
  if (!fs.existsSync(outputDirectory)) return;
  for (const filename of fs.readdirSync(outputDirectory).filter((item) => item.endsWith(".json"))) {
    const candidatePath = path.join(outputDirectory, filename);
    let candidate: { readonly packetSha256?: unknown; readonly reviewerRole?: unknown };
    try { candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as typeof candidate; }
    catch { throw new Error(`Cannot verify existing review import artifact: ${filename}`); }
    if (candidate.packetSha256 === packetSha256 && candidate.reviewerRole !== "A") throw new Error(`Packet hash is already imported under another reviewer role: ${filename}`);
  }
};

export const importMhsReviewerA = (options: ImportMhsReviewerAOptions): { readonly artifactPath: string; readonly artifactSha256: string; readonly artifact: MhsPilotReviewImportArtifact } => {
  const packetBytes = fs.readFileSync(options.packetPath);
  const packetSha256 = sha256(packetBytes);
  const expectedPacketSha256 = options.expectedPacketSha256 ?? MHS_REVIEWER_A_PACKET_SHA256;
  if (packetSha256 !== expectedPacketSha256 || expectedPacketSha256 !== MHS_REVIEWER_A_PACKET_SHA256) throw new Error(`Reviewer A packet SHA-256 mismatch: ${packetSha256}`);

  const parent = fs.readFileSync(options.parentTranchePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as MhsReviewTrancheRow);
  if (parent.length !== MHS_REVIEW_TRANCHE_SIZE) throw new Error("Frozen parent tranche must contain exactly 3,000 rows");
  parent.forEach(validateMhsReviewTrancheRow);
  if (mhsReviewTrancheMembershipDigest(parent) !== MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST) throw new Error("Frozen parent tranche membership changed");
  const pilot = selectMhsReviewPilot(parent);
  const parsed = parseCompletedMhsPilotPacket(packetBytes.toString("utf8"), "A", MHS_REVIEWER_A_ID, pilot);
  if (parsed.length !== MHS_REVIEW_PILOT_SIZE) throw new Error("Reviewer A import requires exactly 100 validated reviews");

  const importedAt = options.importedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(importedAt))) throw new Error("Reviewer A import timestamp is invalid");
  const reviews = parsed.map((item, index) => ({ pilotRowNumber: index + 1, ...item }));
  const payload: MhsPilotReviewImportPayload = {
    schemaVersion: MHS_REVIEW_IMPORT_SCHEMA_VERSION, validationStatus: "VALIDATED", pilotVersion: MHS_REVIEW_PILOT_VERSION,
    parentTrancheVersion: MHS_REVIEW_TRANCHE_VERSION, pilotMembershipDigest: MHS_REVIEW_PILOT_MEMBERSHIP_DIGEST,
    parentTrancheMembershipDigest: MHS_REVIEW_TRANCHE_MEMBERSHIP_DIGEST, reviewerRole: "A", sourcePacketRole: "A",
    reviewerId: MHS_REVIEWER_A_ID, importedPacketFilename: path.basename(options.packetPath), packetSha256: MHS_REVIEWER_A_PACKET_SHA256,
    importedAt, rowCount: MHS_REVIEW_PILOT_SIZE, reviews,
  };
  const artifact: MhsPilotReviewImportArtifact = { ...payload, payloadIntegrityDigest: artifactPayloadDigest(payload) };
  validateMhsPilotReviewImportArtifact(artifact);
  const serialized = canonicalJson(artifact);
  const artifactPath = path.join(options.outputDirectory, MHS_REVIEWER_A_IMPORT_FILENAME);
  assertNoImportConflict(options.outputDirectory, artifactPath, packetSha256);
  writeImmutableFileAtomic(artifactPath, serialized, options.publishAtomic);
  return { artifactPath, artifactSha256: sha256(Buffer.from(serialized, "utf8")), artifact };
};
