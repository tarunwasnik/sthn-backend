import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { calculateAuditMetrics, calculateIdentitySensitivePrecision, calculateSourceTargetBreakdown, MappingAuditRow, selectMappingAuditSample, validateAuditRow } from "../research/textModerationDataset/audit";
import { applyPublicMappingAuditReviewV1 } from "../research/textModerationDataset/auditReviewV1";
import { ProvenanceStagingRow } from "../research/textModerationDataset/contracts";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation");
const run = async (): Promise<void> => {
  const rows: ProvenanceStagingRow[] = [];
  for (const source of ["HATEMOJI_BUILD", "TOXIGEN_ANNOTATED"]) {
    const reader = readline.createInterface({ input: fs.createReadStream(path.join(root, source, "provenance-staging.jsonl"), "utf8"), crlfDelay: Infinity });
    for await (const line of reader) if (line.trim()) rows.push(JSON.parse(line) as ProvenanceStagingRow);
  }
  const sample = selectMappingAuditSample(rows); const audit = applyPublicMappingAuditReviewV1(sample); audit.forEach((row) => validateAuditRow(row));
  const auditRoot = path.join(root, "mapping-audit"); fs.mkdirSync(auditRoot, { recursive: true });
  const output = path.join(auditRoot, "audit-completed.jsonl"); const temporary = `${output}.partial`;
  fs.writeFileSync(temporary, `${audit.map((row: MappingAuditRow) => JSON.stringify(row)).join("\n")}\n`); fs.renameSync(temporary, output);
  const counts = Object.fromEntries([...new Set(audit.map((row) => row.sourceId))].sort().map((source) => [source, audit.filter((row) => row.sourceId === source).length]));
  const decisions = Object.fromEntries(["ALLOW", "BLOCK", "NEEDS_ADJUDICATION", "EXCLUDE"].map((decision) => [decision, audit.filter((row) => row.humanDecision === decision).length]));
  const reasons = Object.fromEntries([...new Set(audit.map((row) => row.auditReasonCode))].sort().map((reason) => [String(reason), audit.filter((row) => row.auditReasonCode === reason).length]));
  const report = { auditVersion: audit[0]?.auditVersion, auditSeed: audit[0]?.auditSeed, reviewerCount: 1, total: audit.length, counts, decisions, reasons, perRule: calculateAuditMetrics(audit), identitySensitivePrecision: calculateIdentitySensitivePrecision(audit), sourceTargetBreakdown: calculateSourceTargetBreakdown(audit) };
  fs.writeFileSync(path.join(auditRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
};
run().catch((error) => { console.error(error); process.exitCode = 1; });
