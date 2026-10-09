import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { calculateRuleCertification, CertificationAuditRow, certificationMembershipDigest, selectCertificationAuditSample, validateCertificationAuditRow } from "../research/textModerationDataset/certification";
import { applyPublicMappingCertificationReviewV1 } from "../research/textModerationDataset/certificationReviewV1";
import { ProvenanceStagingRow } from "../research/textModerationDataset/contracts";

const root = path.resolve(process.cwd(), "dataset-research", "text-moderation");
const run = async (): Promise<void> => {
  const prior = fs.readFileSync(path.join(root, "mapping-audit", "audit-completed.jsonl"), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line) as { sourceRowId: string });
  const priorMembership = new Set(prior.map((row) => row.sourceRowId)); const rows: ProvenanceStagingRow[] = [];
  const reader = readline.createInterface({ input: fs.createReadStream(path.join(root, "HATEMOJI_BUILD", "provenance-staging.jsonl"), "utf8"), crlfDelay: Infinity });
  for await (const line of reader) if (line.trim()) rows.push(JSON.parse(line) as ProvenanceStagingRow);
  const sample = selectCertificationAuditSample(rows, priorMembership); const audit = applyPublicMappingCertificationReviewV1(sample); audit.forEach((row) => validateCertificationAuditRow(row, priorMembership));
  const outputRoot = path.join(root, "mapping-certification"); fs.mkdirSync(outputRoot, { recursive: true });
  const output = path.join(outputRoot, "certification-completed.jsonl"); const temporary = `${output}.partial`;
  fs.writeFileSync(temporary, `${audit.map((row: CertificationAuditRow) => JSON.stringify(row)).join("\n")}\n`); fs.renameSync(temporary, output);
  const rules = [...new Set(audit.map((row) => row.ruleId))].sort().map((ruleId) => calculateRuleCertification(audit.filter((row) => row.ruleId === ruleId)));
  const report = { auditVersion: audit[0]?.auditVersion, auditSeed: audit[0]?.auditSeed, membershipDigest: certificationMembershipDigest(audit), priorAuditOverlap: audit.filter((row) => priorMembership.has(row.sourceRowId)).length, total: audit.length, rules };
  fs.writeFileSync(path.join(outputRoot, "certification-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
};
run().catch((error) => { console.error(error); process.exitCode = 1; });
