import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const fingerprint = (value: unknown) => sha256(JSON.stringify(value));
const expected = {
  g1: "2ff448628b2568fd8a8f6b4a5cc38ecaf026976337515284f6629bc45ec88fa1", g2: "8e6a7defcf7aa1560bdb6ad984a5f48559277a338b9ad3e1f1af1a822bc26d1b",
  g3: "dd5cd6113c7aa5d789377bd0a7496ca3b5631913b6f9a40ff97a105ceee43be6", g3Review: "3f1c852d579a7ed6f291061a2a0dc40345a6e7fd821caad45eee307399dfb560",
  g4: "5b8fb1fa2762a71bc0d4d63a8d6370d9069fdfcb7ad610f9f299b4070dc107b7", g5: "7783faf8ed2d4f56c9a5e105a472e4ad0067a9247177c0b157d231a00ffd3b96",
  g6: "94faa90e63e30a79625493f1e6f391ce170ac6ad92d6f86c003eeed41b4d0cca", f3: "6ea1d8b7094991d507563388d220ce2835040dc1991e84e614b155b38d101641", f4: "09e37002e201c3406a892b449b00c5ef2a1e09a415ad80f2f7165eba3d981af4",
} as const;
const wheel = { filename: "nudenet-3.4.2-py3-none-any.whl", sha256: "5937dbd84e5d8e5de038f08ffea5a1bb50a08475776bf2b4795914ce0eaf0331", bytes: 10595223 } as const;
const sdist = { filename: "nudenet-3.4.2.tar.gz", sha256: "b20645d5f06bbb10006e6d4dc8a9513cf684269bbcffb0557a3ed6831aa90d75", bytes: 10596676 } as const;
const model = { path: "nudenet/320n.onnx", sha256: "c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f", uncompressedBytes: 12150158, compressedBytes: 10565412 } as const;
const sources = [
  { id: "pypi-project", url: "https://pypi.org/project/nudenet/3.4.2/", type: "official PyPI project", primary: true, version: "3.4.2", scope: "package", evidenceQuality: "VERIFIED", claim: "Official NudeNet release metadata identifies project nudenet, version 3.4.2, project URL notAI-tech/NudeNet, MIT metadata/classifier, and wheel/sdist hashes." },
  { id: "pypi-json", url: "https://pypi.org/pypi/nudenet/3.4.2/json", type: "official PyPI JSON API", primary: true, version: "3.4.2", scope: "package", evidenceQuality: "VERIFIED", claim: "Official release-file URLs, sizes, hashes, upload metadata, and package metadata were retrieved from PyPI." },
  { id: "wheel", url: "https://files.pythonhosted.org/packages/1c/ee/1aa02d44ba958cc77e16ff1e41a0aac5e721037db7bf62b9c9d124917f87/nudenet-3.4.2-py3-none-any.whl", type: "official PyPI wheel", primary: true, version: "3.4.2", scope: "package and model weights", evidenceQuality: "VERIFIED", claim: "Hash-verified static archive contains nudenet/320n.onnx, package metadata, AGPL license files, and record data." },
  { id: "sdist", url: "https://files.pythonhosted.org/packages/04/8f/9e4862f004f648d240039ebffda2441d230741c164efaa25038051b56c60/nudenet-3.4.2.tar.gz", type: "official PyPI source distribution", primary: true, version: "3.4.2", scope: "package and model weights", evidenceQuality: "VERIFIED", claim: "Hash-verified static archive contains 320n and packaging configuration deliberately including it." },
  { id: "canonical-source", url: "https://github.com/notAI-tech/NudeNet/tree/v3", type: "canonical repository", primary: true, version: "v3", scope: "code", evidenceQuality: "VERIFIED", claim: "Canonical v3 source identifies 320n as the default model route and repository LICENSE is AGPL-3.0." },
  { id: "canonical-license", url: "https://github.com/notAI-tech/NudeNet/blob/v3/LICENSE", type: "canonical repository license", primary: true, version: "v3", scope: "code", evidenceQuality: "VERIFIED", claim: "Current v3 source tree carries GNU AGPL-3.0 text." },
] as const;

const markdown = (report: { reportFingerprint: string; decision: string }) => `# I4-G6-R1 NudeNet 320n Weight-Licensing & Distribution Resolution

## Executive summary

**${report.decision}** for the exact NudeNet 3.4.2 PyPI-bundled \`nudenet/320n.onnx\` artifact, limited to a later controlled local technical evaluation. Production remains **LEGAL_DEPLOYMENT_REVIEW_REQUIRED**. This is not model capability approval or production approval.

## Exact distribution and hash chain

Official PyPI project \`nudenet\`, version 3.4.2, distributes \`${wheel.filename}\`. Its PyPI-published SHA-256 and locally calculated SHA-256 both equal \`${wheel.sha256}\`. Static archive inspection found \`${model.path}\`, ${model.uncompressedBytes} bytes uncompressed, SHA-256 \`${model.sha256}\`. The official sdist \`${sdist.filename}\` likewise hash-matched \`${sdist.sha256}\`.

## Evidence and reconciliation

The wheel metadata and \`setup.py\` declare MIT and an MIT classifier. However, both distributed \`LICENSE\` and \`LICENSE.md\` files are standard GNU AGPL-3.0 text. The sdist deliberately includes the model: \`MANIFEST.in\` contains \`include nudenet/320n.onnx\`, while \`setup.py\` declares it as package data. The exact package README states that the bundled 320n model is the default. No bundled model-specific license, exclusion, notice, or third-party weight term was found. The canonical current v3 repository is AGPL-3.0.

This is a package-level MIT/AGPL discrepancy, not evidence of a separate adverse term for 320n. The report does not decide which general package license ultimately governs. For controlled local evaluation, neither declared license prohibits use; preserve the full official archives and both licensing records, and treat AGPL obligations as the conservative deployment/legal-review posture. The project only states that 320n is based on Ultralytics YOLOv8n; it does not provide a separate upstream-weight license or establish a separate model copyright origin. Architecture lineage is therefore recorded as **REPORTED/UNRESOLVED**, not converted into a weight-license conclusion.

## Decision and G7 implication

The official release-to-wheel-to-bundled-model hash chain and intentional package inclusion are sufficient for controlled evaluation. A later G7 may consider NudeNet 320n as a separate track, retaining normal legal review before any deployment. No acquisition beyond the inspected official archives, installation, import, model loading, inference, training, tuning, or production change occurred here.

Fingerprint: ${report.reportFingerprint}
`;

void (async () => {
  const root = process.cwd(); const p = (...segments: string[]) => path.join(root, ...segments);
  const historical = {
    g1: p("evaluation-output", "image-moderation", "i4-g1-professional-image-policy-v2", "professional-image-policy-v2.json"), g2: p("evaluation-output", "image-moderation", "i4-g2-professional-image-policy-v2-impact", "g2-professional-policy-v2-impact.json"),
    g3: p("evaluation-output", "image-moderation", "i4-g3-professional-image-policy-v2-review", "g3-complete-v2-retrospective-analysis.json"), g3Review: p("evaluation-output", "image-moderation", "i4-g3-professional-image-policy-v2-review", "g3-v2-human-review.json"),
    g4: p("evaluation-output", "image-moderation", "i4-g4-architecture-analysis", "g4-architecture-analysis.json"), g5: p("evaluation-output", "image-moderation", "i4-g5-specialist-model-discovery", "g5-specialist-model-discovery.json"), g6: p("evaluation-output", "image-moderation", "i4-g6-specialist-due-diligence", "g6-specialist-due-diligence.json"),
    f3: p("evaluation-cache", "image-moderation", "unseen-test-v1", "frozen-unseen-corpus.json"), f4: p("evaluation-output", "image-moderation", "i4-f4-frozen-unseen-test-v1", "f4-frozen-unseen-evaluation.json"),
  };
  const actual = Object.fromEntries(await Promise.all(Object.entries(historical).map(async ([key, filename]) => [key, sha256(await readFile(filename))])));
  for (const [key, value] of Object.entries(expected)) if (actual[key] !== value) throw new Error(`Frozen authority mismatch: ${key}`);
  const cache = p("evaluation-cache", "image-moderation", "g6-r1-nudenet-license-inspection");
  const [wheelBytes, sdistBytes, pypi] = await Promise.all([readFile(path.join(cache, wheel.filename)), readFile(path.join(cache, sdist.filename)), readFile(path.join(cache, "pypi-nudenet-3.4.2.json"), "utf8")]);
  if (sha256(wheelBytes) !== wheel.sha256 || wheelBytes.length !== wheel.bytes) throw new Error("Official wheel hash/size verification failed");
  if (sha256(sdistBytes) !== sdist.sha256 || sdistBytes.length !== sdist.bytes) throw new Error("Official sdist hash/size verification failed");
  const release = JSON.parse(pypi); const wheelRelease = release.urls.find((item: { filename: string }) => item.filename === wheel.filename);
  if (wheelRelease?.digests?.sha256 !== wheel.sha256) throw new Error("PyPI wheel published hash mismatch");
  const payload = { schemaVersion: "STHN_I4_G6_R1_NUDENET_320N_LICENSE_RESOLUTION_V1", scope: "STATIC_OFFICIAL_PYPI_ARCHIVE_INSPECTION_ONLY_NO_INSTALL_NO_IMPORT_NO_MODEL_LOAD_NO_INFERENCE_NO_TRAINING_NO_PRODUCTION_MUTATION", frozenAuthoritySha256: actual, priorG6: { reportFingerprint: "359f776aacfaeb6bbf7ef8fbbcdaa9f7e141472100478c99f200b8ad93636c69", nudeNetPriorDecision: "HOLD", gantManDecisionUnchanged: "ELIGIBLE_FOR_CONTROLLED_ACQUISITION" }, target: { canonicalProject: "https://github.com/notAI-tech/NudeNet", exactModel: "320n.onnx", excludes: ["640m", "GantMan/NSFWJS"] }, pypi: { project: "nudenet", version: "3.4.2", publisherMetadata: { author: "BEDAPUDI PRANEETH", projectUrl: "https://github.com/notAI-tech/nudenet", trustedPublishing: true }, wheel: { ...wheel, localSha256: sha256(wheelBytes), hashMatched: true }, sdist: { ...sdist, localSha256: sha256(sdistBytes), hashMatched: true } }, packageInventory: { relevantWheelEntries: [model.path, "nudenet/nudenet.py", "nudenet-3.4.2.dist-info/LICENSE", "nudenet-3.4.2.dist-info/LICENSE.md", "nudenet-3.4.2.dist-info/METADATA", "nudenet-3.4.2.dist-info/WHEEL", "nudenet-3.4.2.dist-info/RECORD"], otherModelFiles: [], modelSpecificLicenseFiles: [], recordEntry: "nudenet/320n.onnx,sha256=wV2Cc62tLQqS8BTMaastbDEaBnd6VVRfLE60b1GRHw8,12150158" }, model: { ...model, bundled: true, defaultModelEvidence: "Official package README says 320n is included and used by default.", loadedOrExecuted: false }, licenseEvidence: { packageMetadata: { declaredLicense: "MIT", classifiers: ["License :: OSI Approved :: MIT License"], licenseFilesDeclared: ["LICENSE", "LICENSE.md"] }, bundledLicenseFiles: { paths: ["nudenet-3.4.2.dist-info/LICENSE", "nudenet-3.4.2.dist-info/LICENSE.md"], text: "GNU Affero General Public License v3.0", names320n: false, modelExclusions: false, separateModelTerms: false }, sdistBuildEvidence: { manifest: "include nudenet/320n.onnx", packageData: "nudenet/320n.onnx", deliberateInclusion: true }, canonicalRepository: { revision: "v3 current lineage", license: "AGPL-3.0", exactReleaseRevision: "UNKNOWN: no authoritative source-to-commit mapping was published in the inspected PyPI artifacts" }, reconciliation: "VERIFIED conflict: exact package metadata/setup declares MIT while exact bundled LICENSE files and current canonical v3 tree carry AGPL-3.0. No model-specific contradictory term was found.", modelOrigin: { officialStatement: "320n is based on ultralytics yolov8n", quality: "REPORTED", separateUpstreamWeightTermsFound: false, conclusion: "Architecture lineage does not by itself establish 320n weight terms." } }, commercialUse: { MIT: "MIT metadata does not prohibit commercial use, subject to its notice terms.", AGPL: "AGPL-3.0 text does not inherently prohibit commercial use, but deployment/network-source obligations require legal review.", legalAdvice: false }, decision: "CLEARED_FOR_CONTROLLED_EVALUATION", controlledEvaluationStatus: "CLEARED_FOR_CONTROLLED_EVALUATION", productionDeploymentStatus: "LEGAL_DEPLOYMENT_REVIEW_REQUIRED", caveats: ["Do not represent the MIT/AGPL discrepancy as resolved.", "Preserve official package, license, and hash records for any later acquisition.", "No separate primary statement establishes 320n training-data or upstream-weight provenance.", "Deployment requires legal review; this is not production approval."], reopenCondition: null, g7Implication: "G7 may consider separate controlled runtime feasibility tracks for NudeNet 320n and unchanged GantMan v1.2.0.", sources, prohibitionsObserved: { packageInstalled: false, downloadedCodeExecuted: false, modelLoaded: false, inference: false, trainingOrTuning: false, productionMutation: false } };
  const report = { ...payload, reportFingerprint: fingerprint(payload) }; const out = p("evaluation-output", "image-moderation", "i4-g6-r1-nudenet-license-resolution"); await mkdir(out, { recursive: true });
  await Promise.all([writeFile(path.join(out, "g6-r1-nudenet-license-resolution.json"), `${JSON.stringify(report, null, 2)}\n`), writeFile(path.join(out, "g6-r1-nudenet-license-resolution.md"), markdown(report)), writeFile(path.join(out, "g6-r1-research-sources.json"), `${JSON.stringify({ schemaVersion: "STHN_I4_G6_R1_RESEARCH_SOURCES_V1", sources }, null, 2)}\n`)]);
  console.log(JSON.stringify({ output: out, reportFingerprint: report.reportFingerprint, decision: report.decision, modelSha256: model.sha256 }, null, 2));
})().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
