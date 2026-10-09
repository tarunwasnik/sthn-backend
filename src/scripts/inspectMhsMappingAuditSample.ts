import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { ProvenanceStagingRow } from "../research/textModerationDataset/contracts";
import { mhsAuditMembershipDigest, selectMhsMappingAuditSample } from "../research/textModerationDataset/mhsMappingAudit";

const main = async (): Promise<void> => {
  const root = path.resolve(process.cwd(), "dataset-research", "text-moderation", "MEASURING_HATE_SPEECH");
  const reader = readline.createInterface({ input: fs.createReadStream(path.join(root, "provenance-staging.jsonl"), "utf8"), crlfDelay: Infinity });
  const staged: ProvenanceStagingRow[] = [];
  for await (const line of reader) if (line.trim()) staged.push(JSON.parse(line) as ProvenanceStagingRow);
  const sample = selectMhsMappingAuditSample(staged);
  const start = Number(process.argv[2] ?? 0); const count = Number(process.argv[3] ?? 50);
  console.log(JSON.stringify({ size: sample.length, digest: mhsAuditMembershipDigest(sample), start, count }));
  sample.slice(start, start + count).forEach((row, offset) => {
    const c = row.sourceSummary.constructs;
    console.log(JSON.stringify({ i: start + offset, assigned: Math.floor((start + offset) / 20) < 15 ? require("../research/textModerationDataset/mhsMappingAudit").MHS_AUDIT_STRATA[Math.floor((start + offset) / 20)] : null,
      score: row.sourceSummary.hateSpeechScore, ann: row.sourceSummary.annotationCount, disagreement: row.sourceSummary.disagreement,
      constructs: { hate: c.hatespeech.mean, dehumanize: c.dehumanize.mean, insult: c.insult.mean, humiliate: c.humiliate.mean, violence: c.violence.mean, genocide: c.genocide.mean, attackDefend: c.attack_defend.mean },
      target: row.sourceSummary.target, text: row.textPreview }));
  });
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
