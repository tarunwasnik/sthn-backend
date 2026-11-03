import path from "node:path";
import { loadQwen3VlBenchmark558Fixtures, loadQwen3VlBenchmark558Resume, qwen3VlBenchmark558OutputDirectory } from "../evaluation/imageModeration/qwen3VlBenchmark558";

void (async () => {
  const fixtures = await loadQwen3VlBenchmark558Fixtures(path.join(process.cwd(), "evaluation-cache", "image-moderation", "benchmark"));
  const completed = await loadQwen3VlBenchmark558Resume(qwen3VlBenchmark558OutputDirectory(), fixtures);
  console.log(JSON.stringify({ runId: "STHN_QWEN3_VL_V2C_558_V1", completed: completed.length, total: fixtures.length, remaining: fixtures.length - completed.length, nextFixtureId: fixtures[completed.length]?.id ?? null, inferenceStarted: false }, null, 2));
})().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
