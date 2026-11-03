import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import { Qwen3VlEvaluationImagePreparation, Qwen3VlOfflineRuntime, Qwen3VlRuntimePerformance, Qwen3VlRuntimeResult, QWEN3_VL_EVALUATION_JSON_SCHEMA } from "./qwen3VlOfflineEvaluation";

export interface LocalProcessResult { readonly exitCode: number | null; readonly stdout: string; readonly stderr: string; readonly timedOut: boolean; readonly spawnError: boolean; }
export type LocalProcessRunner = (executablePath: string, arguments_: readonly string[], timeoutMs: number) => Promise<LocalProcessResult>;

export interface Qwen3VlLlamaCppRuntimeConfig {
  readonly executablePath: string;
  readonly buildId: string;
  readonly commandTimeoutMs: number;
  readonly contextSize: number;
}

const bounded = (value: string, maximum = 65_536) => value.length > maximum ? value.slice(0, maximum) : value;
const QWEN3_VL_EVALUATION_MAXIMUM_IMAGE_DIMENSION = 1024;
const QWEN3_VL_EVALUATION_MAXIMUM_INPUT_PIXELS = 64_000_000;
const sha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const localPath = (value: string, name: string) => {
  if (!value || /^(?:https?|file):/i.test(value) || value.startsWith("//")) throw new Error(`${name} must be a local filesystem path`);
  return path.resolve(value);
};

export const runLocalProcess: LocalProcessRunner = async (executablePath, arguments_, timeoutMs) => new Promise((resolve) => {
  let child;
  try { child = spawn(executablePath, [...arguments_], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); } catch { resolve({ exitCode: null, stdout: "", stderr: "", timedOut: false, spawnError: true }); return; }
  let stdout = ""; let stderr = ""; let settled = false;
  const finish = (result: LocalProcessResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
  child.stdout.on("data", (chunk: Buffer) => { stdout = bounded(`${stdout}${chunk.toString("utf8")}`); });
  child.stderr.on("data", (chunk: Buffer) => { stderr = bounded(`${stderr}${chunk.toString("utf8")}`); });
  child.once("error", () => finish({ exitCode: null, stdout, stderr, timedOut: false, spawnError: true }));
  child.once("close", (exitCode) => finish({ exitCode, stdout, stderr, timedOut: false, spawnError: false }));
  const timer = setTimeout(() => { try { child.kill(); } catch { /* Best-effort owned-child termination. */ } finish({ exitCode: null, stdout, stderr, timedOut: true, spawnError: false }); }, timeoutMs);
});

/** Creates a non-authoritative, orientation-correct local JPEG input for Qwen only. */
export const prepareQwen3VlEvaluationImage = async (source: Buffer): Promise<Readonly<{ bytes: Buffer; metadata: Qwen3VlEvaluationImagePreparation }>> => {
  const original = await sharp(source, { failOn: "error", limitInputPixels: QWEN3_VL_EVALUATION_MAXIMUM_INPUT_PIXELS, pages: 1, animated: false }).metadata();
  if (!original.width || !original.height) throw new Error("Qwen evaluation image dimensions are unavailable");
  const output = await sharp(source, { failOn: "error", limitInputPixels: QWEN3_VL_EVALUATION_MAXIMUM_INPUT_PIXELS, pages: 1, animated: false })
    .rotate()
    .resize({ width: QWEN3_VL_EVALUATION_MAXIMUM_IMAGE_DIMENSION, height: QWEN3_VL_EVALUATION_MAXIMUM_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  if (!output.info.width || !output.info.height || output.info.width > QWEN3_VL_EVALUATION_MAXIMUM_IMAGE_DIMENSION || output.info.height > QWEN3_VL_EVALUATION_MAXIMUM_IMAGE_DIMENSION) throw new Error("Qwen evaluation derivative dimensions are invalid");
  return Object.freeze({ bytes: output.data, metadata: Object.freeze({ id: "STHN_QWEN3_VL_EVALUATION_DERIVATIVE_V1", originalContentSha256: sha256(source), derivativeSha256: sha256(output.data), originalWidth: original.width, originalHeight: original.height, width: output.info.width, height: output.info.height, format: "jpeg" }) });
};

/** Local llama.cpp mtmd-cli bridge. It starts no HTTP listener and has no network path. */
export class Qwen3VlLlamaCppRuntime implements Qwen3VlOfflineRuntime {
  public readonly identity = "llama.cpp llama-mtmd-cli";
  public readonly version: string;
  private availabilityError: string | null = null;
  private initialized = false;
  private modelPath: string | null = null;
  private multimodalProjectorPath: string | null = null;

  public constructor(private readonly config: Qwen3VlLlamaCppRuntimeConfig, private readonly processRunner: LocalProcessRunner = runLocalProcess) {
    if (!/^[A-Za-z0-9._-]{3,160}$/.test(config.buildId)) throw new Error("llama.cpp build ID must be explicit");
    if (!Number.isInteger(config.commandTimeoutMs) || config.commandTimeoutMs < 1_000 || config.commandTimeoutMs > 300_000) throw new Error("llama.cpp command timeout must be from 1000 through 300000 ms");
    if (!Number.isInteger(config.contextSize) || config.contextSize < 512 || config.contextSize > 16_384) throw new Error("llama.cpp context size must be from 512 through 16384");
    this.version = config.buildId;
  }

  public async initialize(input: Readonly<{ modelPath: string; multimodalProjectorPath: string; prompt: string; temperature: 0; maxOutputTokens: number }>): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const executablePath = localPath(this.config.executablePath, "llama.cpp executable");
    try { const metadata = await stat(executablePath); if (!metadata.isFile()) { this.availabilityError = "QWEN_RUNTIME_UNAVAILABLE"; return; } } catch { this.availabilityError = "QWEN_RUNTIME_UNAVAILABLE"; return; }
    const version = await this.processRunner(executablePath, ["--version"], Math.min(this.config.commandTimeoutMs, 15_000));
    const versionOutput = `${version.stdout}\n${version.stderr}`;
    if (version.spawnError || version.timedOut || version.exitCode !== 0 || !versionOutput.includes(this.config.buildId.replace(/^b/, ""))) { this.availabilityError = "QWEN_RUNTIME_UNAVAILABLE"; return; }
    for (const artifact of [input.modelPath, input.multimodalProjectorPath]) try { await access(artifact); } catch { this.availabilityError = "QWEN_RUNTIME_UNAVAILABLE"; return; }
    this.modelPath = input.modelPath;
    this.multimodalProjectorPath = input.multimodalProjectorPath;
  }

  public async evaluate(input: Readonly<{ bytes: Buffer; prompt: string; temperature: 0; maxOutputTokens: number }>): Promise<Qwen3VlRuntimeResult> {
    if (!this.initialized) throw new Error("Qwen llama.cpp runtime was not initialized");
    if (this.availabilityError || !this.modelPath || !this.multimodalProjectorPath) return { status: "UNAVAILABLE", errorCode: this.availabilityError ?? "QWEN_RUNTIME_UNAVAILABLE" };
    const directory = await mkdtemp(path.join(os.tmpdir(), "sthn-qwen-v2b1-"));
    const imagePath = path.join(directory, `${randomUUID()}.jpg`);
    const logPath = path.join(directory, "llama-mtmd.log");
    const started = performance.now();
    try {
      let prepared: Awaited<ReturnType<typeof prepareQwen3VlEvaluationImage>>;
      try { prepared = await prepareQwen3VlEvaluationImage(input.bytes); } catch { return { status: "UNAVAILABLE", errorCode: "QWEN_RUNTIME_IMAGE_PREPARATION_FAILED" }; }
      await writeFile(imagePath, prepared.bytes, { flag: "wx" });
      const executablePath = localPath(this.config.executablePath, "llama.cpp executable");
      const args = ["-m", this.modelPath, "--mmproj", this.multimodalProjectorPath, "--image", imagePath, "-p", input.prompt, "--jinja", "--temp", "0", "-n", String(input.maxOutputTokens), "-c", String(this.config.contextSize), "--json-schema", JSON.stringify(QWEN3_VL_EVALUATION_JSON_SCHEMA), "--log-file", logPath];
      const result = await this.processRunner(executablePath, args, this.config.commandTimeoutMs);
      const runtimePerformance: Qwen3VlRuntimePerformance = { inferenceLatencyMs: Math.max(0, performance.now() - started), processRssBytes: process.memoryUsage().rss, freeSystemMemoryBytes: os.freemem() };
      if (result.spawnError) return { status: "UNAVAILABLE", errorCode: "QWEN_RUNTIME_UNAVAILABLE" };
      if (result.timedOut) return { status: "UNAVAILABLE", errorCode: "QWEN_RUNTIME_TIMEOUT" };
      if (result.exitCode !== 0) return { status: "UNAVAILABLE", errorCode: "QWEN_RUNTIME_NONZERO_EXIT" };
      return { status: "COMPLETED", rawOutput: bounded(result.stdout || result.stderr, 4_096), performance: runtimePerformance, imagePreparation: prepared.metadata };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
