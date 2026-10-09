import {
  loadAuthorizedExternalBenchmarkRows,
  loadAuthorizedInternalTestRows,
  MhsV2ProtectedEvaluationSource,
  serializeProtectedRowsForPipe,
} from "../research/textModerationDataset/mhsV2ProtectedEvaluationSources";

const source = process.argv[2] as MhsV2ProtectedEvaluationSource | undefined;
if (process.argv.length !== 3 || !source || !["INTERNAL_TEST", "EXTERNAL_BENCHMARK"].includes(source)) throw new Error("Exactly one authorized protected source is required");
const rows = source === "INTERNAL_TEST" ? loadAuthorizedInternalTestRows() : loadAuthorizedExternalBenchmarkRows();
process.stdout.write(serializeProtectedRowsForPipe(rows));
