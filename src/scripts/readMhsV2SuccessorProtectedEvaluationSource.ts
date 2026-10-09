import fs from "node:fs";
import path from "node:path";

import {
  loadAuthorizedExternalBenchmarkRows,
  loadAuthorizedInternalTestRows,
  MhsV2ProtectedEvaluationSource,
  serializeProtectedRowsForPipe,
} from "../research/textModerationDataset/mhsV2ProtectedEvaluationSources";

const CYCLE_ID = "mhs-v2-successor-reused-protected-evaluation-cycle-v1-51ce8fb5f4cc29a4f6fed21f";
const CANDIDATE_SHA = "9c6f3e1033e5146bbd1eed3df6c68be2e2be9b1b5815afda3d41baa5a739ac3f";
const CONTRACT_SHA = "5c0053213dc3993424ab687d2800f2ed9716ba7f10dfbaa34fd863f5afaecb02";
const OUTPUT_ROOT = "evaluation-cache/text-moderation/classifier-evaluation/mhs-v2-xlm-roberta-category-aware-reused-protected-evaluation-v1";

const source = process.argv[2] as MhsV2ProtectedEvaluationSource | undefined;
if (process.argv.length !== 3 || !source || !["INTERNAL_TEST", "EXTERNAL_BENCHMARK"].includes(source)) throw new Error("Exactly one authorized successor protected source is required");
const backend = process.cwd(), output = path.resolve(backend, OUTPUT_ROOT), ledger = path.join(output, "run/protected-exposure-ledger.jsonl");
if (!output.startsWith(path.resolve(backend) + path.sep) || !fs.existsSync(ledger)) throw new Error("Successor protected access requires initialized authorized lifecycle");
const events = fs.readFileSync(ledger, "utf8").trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
const expected = source === "INTERNAL_TEST" ? "INTERNAL_TEST_ACCESS_STARTED" : "EXTERNAL_BENCHMARK_ACCESS_STARTED";
if (!events.some((event) => event.event === expected && event.source === source && event.cycleId === CYCLE_ID && event.candidateSha256 === CANDIDATE_SHA && event.contractSha256 === CONTRACT_SHA && event.rawTextIncluded === false)) throw new Error(`Durable successor exposure authority missing for ${source}`);

// The established 8D loader remains the sole protected-data path. This bridge
// adds the successor-cycle guard and delegates without importing source files.
const rows = source === "INTERNAL_TEST" ? loadAuthorizedInternalTestRows(backend) : loadAuthorizedExternalBenchmarkRows(backend);
process.stdout.write(serializeProtectedRowsForPipe(rows));
