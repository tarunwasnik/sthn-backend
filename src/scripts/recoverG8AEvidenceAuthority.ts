import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, validateCurrentG8AEvidence } from "../evaluation/imageModeration/nudeNet320nEvidenceAuthorityRecovery";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
void (async () => {
  const validated = await validateCurrentG8AEvidence();
  const output = path.join(process.cwd(), "evaluation-output", "image-moderation", "i4-g8a-r1-evidence-authority-recovery");
  const semanticManifest = { ...validated.semanticPayload, semanticEvidenceFingerprint: validated.semanticFingerprint };
  const semanticManifestText = `${canonicalJson(semanticManifest)}\n`;
  const report = {
    schemaVersion: "STHN_I4_G8A_R1_EVIDENCE_AUTHORITY_RECOVERY_V1",
    status: "CURRENT_G8A_EVIDENCE_VALIDATED_AS_NEW_AUTHORITY",
    lineage: {
      originalArtifactRecovered: false,
      originalReportedSha256: "118565cd4823343444c5141bbaa7a04e6aeb2544993d328227ca8f630b2bcdde",
      originalReportedFingerprint: "92d3442218b02586189c16ab95a387200668c99b4b3f771a1624ed7e764c6efd",
      limitation: "The originally reported G8-A files were not recovered; exact semantic equality to that missing execution cannot be proven. This R1 record validates the current available evidence against frozen authorities and establishes a prospective semantic authority.",
    },
    currentG8AByteIdentity: validated.byteHashes,
    semanticEvidenceFingerprint: validated.semanticFingerprint,
    semanticManifestCanonicalPayloadSha256: sha256(canonicalJson(semanticManifest)),
    semanticManifestByteSha256: sha256(semanticManifestText),
    excludedVolatileFields: [
      { field: "execution.totalMs", reason: "elapsed runtime varies between executions without changing evidence meaning" },
      { field: "per-image latencyMs", reason: "per-candidate runtime timing varies without changing evidence meaning" },
      { field: "filesystem timestamps", reason: "storage metadata is not evaluation evidence" },
      { field: "absolute local paths", reason: "environment-specific and absent from the semantic payload" },
      { field: "JSON formatting", reason: "byte presentation is distinct from semantic evidence" },
    ],
    validation: { records: validated.rows.length, successful: 558, failed: 0, pass: 260, block: 298, retainedDetectionCandidates: 0, exposedSignals: 0, coveredSignals: 0, g3V1Overlap: 0, g3Boundary: "NOT_APPLICABLE_TO_V1_DEVELOPMENT_CORPUS" },
    g8bResumptionStatus: "G8B_MAY_BIND_TO_G8A_R1",
  };
  await mkdir(output, { recursive: true });
  const manifestPath = path.join(output, "g8a-r1-semantic-manifest.json");
  const reportPath = path.join(output, "g8a-r1-authority-recovery.json");
  const markdownPath = path.join(output, "g8a-r1-authority-recovery.md");
  await writeFile(manifestPath, semanticManifestText, { flag: "wx" });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  await writeFile(markdownPath, `# I4-G8-A-R1 Evidence Authority Recovery\n\nSemantic evidence fingerprint: ${validated.semanticFingerprint}\n\nThe missing originally reported G8-A artifact was not recovered. This is a new prospective authority over independently validated current evidence.\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: report.status, semanticEvidenceFingerprint: validated.semanticFingerprint, reportSha256: sha256(await (await import("node:fs/promises")).readFile(reportPath)), semanticManifestByteSha256: report.semanticManifestByteSha256 }, null, 2));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
