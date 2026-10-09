import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const hash = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
void (async () => {
  const authorities = {
    r1: "evaluation-output/image-moderation/i4-g8c-r1-preprocessing-stage-isolation/g8c-r1-preprocessing-stage-isolation.json",
    r2: "evaluation-output/image-moderation/i4-g8c-r2-canonical-resize-parity/g8c-r2-resize-comparison.json",
    r3: "evaluation-output/image-moderation/i4-g8c-r3-opencv-inter-linear-runtime/g8c-r3-synthetic-comparison.json",
  };
  const [r1, r2, r3, packageJson] = await Promise.all([...Object.values(authorities).map((item) => readFile(path.join(root, item))), readFile(path.join(root, "package.json"))]);
  if (hash(r1) !== "bb4442052d79fb9e40f36f269a181b0adf92fe8ed90c8826fbb58357e1ab9a96" || hash(r2) !== "f059afcf97162e13c8e33d2ad3e2521b479c41e7eb3c16e14da1bd62e160fb13") throw new Error("Frozen R4 authority mismatch");
  const payload = {
    schemaVersion: "STHN_I4_G8C_R4_OPENCV_RUNTIME_SELECTION_V1", phase: "I4-G8-C-R4", researchedAt: new Date().toISOString(),
    repository: { node: process.version, typescriptTarget: "ES2020", module: "CommonJS", installedImageRuntime: { sharp: "0.35.3", onnxruntimeNode: "1.27.0" }, candidateDependencyPresent: false, packageJsonSha256: hash(packageJson) },
    authority: { r1Sha256: hash(r1), r2Sha256: hash(r2), r3Sha256: hash(r3), r1Conclusion: "RESIZE_IS_PRIMARY_REMAINING_DIVERGENCE", r2Conclusion: "SHARP_RESIZE_PARITY_NOT_ACHIEVABLE_WITH_EVALUATED_CONFIGURATIONS", r3Conclusion: "TYPESCRIPT_INTER_LINEAR_PARITY_NOT_CONFIRMED" },
    candidates: [
      { id: "NATIVE_OPENCV4NODEJS", package: "@u4/opencv4nodejs", upstream: "https://github.com/UrielCh/opencv4nodejs", license: "MIT (binding; OpenCV separately Apache-2.0)", openCvSemantics: "HIGH: calls native OpenCV resize", node20: "Plausible but ABI-specific", windows: "Requires native toolchain/OpenCV configuration", renderLinux: "Requires system OpenCV or controlled native build", binaries: "Environment-dependent; no repository proof of portable prebuilds", burden: "HIGH", operationalRisk: "HIGH", decision: "REJECT_FOR_FIRST_EVALUATION", reason: "Native system dependency, ABI/build, and Render reproducibility burden exceed bounded evaluation need" },
      { id: "OPENCV_JS_WASM", package: "@techstark/opencv-js@5.0.0-release.1", upstream: "https://github.com/TechStark/opencv-js", license: "Apache-2.0", openCvSemantics: "HIGH but must be measured: OpenCV.js exposes cv.resize and INTER_LINEAR", node20: "Package documents Node use; Node 20 supports WebAssembly", windows: "No native compiler expected", renderLinux: "Portable WASM artifact; initialization/memory must be measured", binaries: "Bundled OpenCV.js/WASM from OpenCV documentation distribution", burden: "MEDIUM", operationalRisk: "MEDIUM", decision: "SELECT_FOR_CONTROLLED_EVALUATION", reason: "Actual OpenCV implementation without native toolchain; test exact synthetic and bounded runtime behavior before any integration" },
      { id: "SMALL_GENERIC_RESIZE", package: "none identified", upstream: null, license: null, openCvSemantics: "LOW", node20: "N/A", windows: "N/A", renderLinux: "N/A", binaries: "N/A", burden: "LOW", operationalRisk: "HIGH semantic risk", decision: "REJECT", reason: "No maintained package was established as OpenCV INTER_LINEAR-compatible; generic bilinear is insufficient" },
      { id: "EXACT_SOURCE_PORT", package: "isolated TypeScript port", upstream: "https://github.com/opencv/opencv", license: "Apache-2.0", openCvSemantics: "UNPROVEN", node20: "YES", windows: "YES", renderLinux: "YES", binaries: "NONE", burden: "MEDIUM-HIGH", operationalRisk: "MEDIUM-HIGH", decision: "REJECT_FOR_NOW", reason: "R3 synthetic ±1 mismatches show coefficient/rounding behavior remains subtle; exact port requires source-level audit and maintenance" },
      { id: "PYTHON_SUBPROCESS", package: "existing evaluation Python/OpenCV", upstream: "https://opencv.org/", license: "Apache-2.0", openCvSemantics: "HIGH", node20: "N/A", windows: "Current evaluation only", renderLinux: "Adds Python/OpenCV deployment stack", binaries: "Python wheels/system libs", burden: "HIGH", operationalRisk: "HIGH", decision: "REJECT_FOR_PRODUCTION_DESIGN", reason: "Retain only as canonical evaluation authority; no Node-to-Python production bridge" },
    ],
    decisionMatrix: { priorities: ["canonical correctness", "reproducibility", "Render deployment reliability", "maintenance/provenance", "performance", "simplicity"], selected: "OPENCV_JS_WASM", rationale: "Only serious non-native candidate that exposes actual OpenCV resize semantics while avoiding native OpenCV installation; exact parity, startup cost, memory, and Node loading remain gated evaluation questions" },
    status: "AUTHORIZE_OPENCV_WASM_EVALUATION", nextPhaseAuthorization: { package: "@techstark/opencv-js@5.0.0-release.1", scope: "install only after explicit controlled-acquisition approval; synthetic OpenCV INTER_LINEAR parity and Node/Render feasibility only", prohibited: ["NudeNet inference", "benchmark/private images", "frozen 16", "558 corpus", "production wiring", "threshold changes"] },
    sources: ["https://docs.opencv.org/5.0/js_tutorials/js_setup/js_nodejs/js_nodejs.html", "https://docs.opencv.org/5.0/js_tutorials/js_setup/js_setup/js_setup.html", "https://www.npmjs.com/package/@techstark/opencv-js", "https://github.com/justadudewhohacks/opencv4nodejs/issues/886"],
    prohibitionsObserved: { dependencyInstalled: false, modelInference: false, benchmarkAccess: false, stageB: false, productionMutation: false },
  };
  const report = { ...payload, reportFingerprint: hash(JSON.stringify(payload)) }; const out = path.join(root, "evaluation-output", "image-moderation", "i4-g8c-r4-opencv-runtime-selection"); await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "g8c-r4-runtime-candidates.json"), `${JSON.stringify({ candidates: report.candidates }, null, 2)}\n`, { flag: "wx" });
  await writeFile(path.join(out, "g8c-r4-runtime-selection.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  await writeFile(path.join(out, "g8c-r4-runtime-selection.md"), `# I4-G8-C-R4\n\n${report.status}: ${report.nextPhaseAuthorization.package}\n`, { flag: "wx" });
  console.log(JSON.stringify({ status: report.status, reportFingerprint: report.reportFingerprint }));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
