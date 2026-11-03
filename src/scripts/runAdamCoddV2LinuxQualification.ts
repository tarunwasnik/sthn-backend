import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const CONFIRMATION = path.join(ROOT, "dist", "scripts", "runAdamCoddV2MemoryConfirmation.js");
const DEFAULT_OUTPUT = path.join(ROOT, "evaluation-output", "image-moderation", "i3b-5f-linux-qualification", "latest");

const argument = (argv: readonly string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const atomicJson = async (file: string, value: unknown) => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
};
const optionalText = async (file: string) => {
  try { return (await readFile(file, "utf8")).trim(); } catch { return null; }
};

const sharpImpact = `# Sharp cache integration impact\n\nNo production \`sharp.cache(...)\` or \`sharp.concurrency(...)\` call exists. The experimental worker is the only cache mutation site. Sharp cache is process-global, so changing it at V2 request/service scope would also affect these consumers:\n\n| Path | Direct use | Potential impact | Existing focused coverage |\n|---|---|---|---|\n| \`src/services/imageModeration/imageTemporaryUpload.service.ts\` | Byte metadata validation | Decode/validation throughput and retained libvips memory | \`imageTemporaryUpload.service.test.ts\` |\n| \`src/services/imageModeration/imageModerationProcessingDerivative.service.ts\` | V1 derivative resize/JPEG | V1 moderation input latency/memory | \`imageModerationProcessingDerivative.service.test.ts\` |\n| \`src/services/imageModeration/adamCoddImageSafety.service.ts\` | V1 preprocessing | V1 inference preparation | \`adamCoddImageSafety.service.test.ts\` |\n| \`src/services/imageModeration/adamCoddV2Preprocessing.service.ts\` | V2 resize/normalization | V2 candidate latency/memory | \`adamCoddV2Preprocessing.service.test.ts\` |\n| \`src/services/profile/profileVerificationFaceEmbedding.service.ts\` | Face-evidence decode | Face Verification processing memory/latency | Profile verification runtime tests |\n| \`src/services/profile/profileVerificationYuNetRunner.ts\` | Face image conversion | YuNet input processing | Profile verification runtime tests |\n\n## Assessment\n\n1. Process-wide disabled cache may reduce retained Sharp/libvips memory, but affects every consumer above. It requires whole-service regression and Linux/container evidence.\n2. A separate image worker could isolate Sharp settings, but no production worker architecture is introduced by this qualification.\n3. Retaining defaults is safest until a production-wide memory/performance decision is separately approved.\n\nThis report does not authorize a global Sharp setting.\n`;

void (async () => {
  const smoke = process.argv.includes("--smoke");
  const outputArgument = argument(process.argv.slice(2), "--output-dir");
  if (outputArgument === undefined && process.argv.includes("--output-dir")) throw new Error("--output-dir requires a value");
  const outputDirectory = path.resolve(ROOT, outputArgument ?? DEFAULT_OUTPUT);
  await readFile(CONFIRMATION);
  const confirmationDirectory = path.join(outputDirectory, "confirmation");
  const args = [CONFIRMATION, ...(smoke ? ["--smoke"] : []), "--output-dir", confirmationDirectory];
  const childExitCode = await new Promise<number | null>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: "inherit", windowsHide: true });
    child.once("exit", resolve);
    child.once("error", () => resolve(null));
  });
  const confirmationPath = path.join(confirmationDirectory, "confirmation-report.json");
  let confirmation: Record<string, unknown> | null = null;
  try { confirmation = JSON.parse(await readFile(confirmationPath, "utf8")) as Record<string, unknown>; } catch { /* captured as incomplete */ }
  const cgroup = {
    memoryMax: await optionalText("/sys/fs/cgroup/memory.max"),
    memoryCurrent: await optionalText("/sys/fs/cgroup/memory.current"),
    memoryEvents: await optionalText("/sys/fs/cgroup/memory.events"),
  };
  const runtime = {
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    node: process.version,
    sharp: sharp.versions,
    onnxRuntime: (() => { try { return require("onnxruntime-node/package.json").version as string; } catch { return null; } })(),
    containerMarker: process.env.STHN_LINUX_QUALIFICATION_CONTAINER === "true",
    cgroup,
  };
  const completed = childExitCode === 0 && confirmation?.status === "COMPLETED" && process.platform === "linux";
  const report = {
    schemaVersion: "STHN_I3B_5F_LINUX_QUALIFICATION_V1",
    generatedAt: new Date().toISOString(),
    status: completed ? "COMPLETED" : "INCOMPLETE",
    runtime,
    commands: { entrypoint: `node dist/scripts/runAdamCoddV2LinuxQualification.js${smoke ? " --smoke" : ""} --output-dir ${outputDirectory}` },
    frozenAuthority: {
      model: "STHN_ADAMCODD_V2_INT8",
      artifactSha256: "ce69ce3cfbcb62655c386fc3223fe7e38c23bdf1f58eb356767566a72d275da0",
      artifactBytes: 89972519,
      preprocessing: "STHN_ADAMCODD_V2_ORIGINAL_SHARP_LINEAR_V1",
      nsfwBlockThreshold: 0.3362914399272772,
    },
    confirmationChild: { exitCode: childExitCode, reportPath: confirmationPath, reportStatus: confirmation?.status ?? null },
    integrationImpactReport: "sharp-integration-impact.md",
    limitations: [
      "Container OOM termination may prevent this process from writing a final report; the host Docker wrapper records inspect-based exit/OOM evidence.",
      "A completed Linux container run is qualification evidence only and does not authorize V2 activation or global Sharp configuration.",
    ],
  };
  await atomicJson(path.join(outputDirectory, "qualification-report.json"), report);
  await writeFile(path.join(outputDirectory, "qualification-report.md"), `# AdamCodd V2 Linux qualification\n\nStatus: **${report.status}**\n\n- Platform: ${runtime.platform} ${runtime.release} (${runtime.architecture})\n- Node: ${runtime.node}\n- Container marker: ${runtime.containerMarker}\n- Confirmation child exit: ${childExitCode ?? "unavailable"}\n- Cgroup memory.max: ${cgroup.memoryMax ?? "unavailable"}\n\nSee \`confirmation/confirmation-report.json\` for per-configuration memory, queue, saturation, recovery, and decision-parity evidence.\n`, "utf8");
  await writeFile(path.join(outputDirectory, "sharp-integration-impact.md"), sharpImpact, "utf8");
  console.info(JSON.stringify({ status: report.status, outputDirectory, platform: process.platform, childExitCode }, null, 2));
  if (!completed) process.exitCode = 1;
})().catch((error: unknown) => {
  console.error(`AdamCodd V2 Linux qualification failed: ${error instanceof Error ? error.message : "Unknown failure"}`);
  process.exitCode = 1;
});
