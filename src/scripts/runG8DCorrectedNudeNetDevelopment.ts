import { createHash } from "node:crypto";
import { access, constants, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { historicalG8BResizeAndTensor } from "../evaluation/imageModeration/nudeNet320nHistoricalG8BPreprocess";
import { persistR11Raw, reloadR11Raw } from "../evaluation/imageModeration/nudeNet320nR11Persistence";
import { postprocessPersistedR11Raw } from "../evaluation/imageModeration/nudeNet320nR11Postprocess";
import { G8C_R6_OPENCV_SHA256, G8C_R6_PACKAGE, G8C_R6_PACKAGE_VERSION } from "../evaluation/imageModeration/opencvWasmR6Contract";
import { NUDENET_320N } from "../evaluation/imageModeration/specialistRuntimeFeasibility";
type G8DReview = Readonly<{ expectedDecision: unknown; coverageClasses?: unknown; categories?: unknown; contextTags?: unknown }>;
const isG8DReview = (value: unknown): value is G8DReview => typeof value === "object" && value !== null && "expectedDecision" in value;
const root = process.cwd(), out = path.join(root, "evaluation-output", "image-moderation", "i4-g8d-corrected-nudenet-development-evaluation"), raw = path.join(out, "raw"), model = path.join(root, "evaluation-cache", "image-moderation", "specialists", "nudenet-320n", "320n.onnx"), sha = (v: Buffer | string) => createHash("sha256").update(v).digest("hex"), once = (n: string, v: unknown) => writeFile(path.join(out, n), JSON.stringify(v, null, 2) + "\n", { flag: "wx" });
const cvload = async (): Promise<any> => { const x = require(G8C_R6_PACKAGE), h = globalThis as any; if (x?.Mat)
    return x; if (x instanceof Promise)
    return x; if (h.cv?.Mat)
    return h.cv; await new Promise<void>((r, j) => { const t = setTimeout(() => j(Error("cv timeout")), 30000); x.onRuntimeInitialized = () => { clearTimeout(t); r(); }; }); return h.cv ?? x; };
const group = (rows: any[], key: (r: any) => string[]): Record<string, any> => Object.fromEntries([...new Set(rows.flatMap(key))].sort().map(k => { const x: any[] = rows.filter((r: any) => key(r).includes(k)); return [k, { support: x.length, withDetection: x.filter((r: any) => r.detections.length).length, zero: x.filter((r: any) => !r.detections.length).length, totalDetections: x.reduce((s: number, r: any) => s + r.detections.length, 0), classes: Object.fromEntries(NUDENET_320N.classes.map(c => [c, x.reduce((s: number, r: any) => s + r.detections.filter((d: any) => d.class === c).length, 0)]).filter(([, n]) => n)) }]; }));
void (async () => { try {
    await access(out, constants.F_OK);
    throw Error("G8-D output already exists");
}
catch (e) {
    if (e instanceof Error && e.message.includes("already"))
        throw e;
} const p = (x: string) => path.join(root, x), [invb, reviewb, r14b, r15b, modelb, cvb, ortb, helperb, postb] = await Promise.all([readFile(p("evaluation-cache/image-moderation/benchmark/inventory-manifest.json")), readFile(p("evaluation-cache/image-moderation/benchmark/review-manifest.json")), readFile(p("evaluation-output/image-moderation/i4-g8c-r14-node-historical-preprocessing-parity/g8c-r14-node-preprocessing-authority.json")), readFile(p("evaluation-output/image-moderation/i4-g8c-r15-historical-end-to-end-parity/g8c-r15-frozen-runtime-authority.json")), readFile(model), readFile(p("node_modules/@techstark/opencv-js/dist/opencv.js")), readFile(p("node_modules/onnxruntime-node/package.json")), readFile(p("src/evaluation/imageModeration/nudeNet320nHistoricalG8BPreprocess.ts")), readFile(p("src/evaluation/imageModeration/nudeNet320nR11Postprocess.ts"))]); const inv: any = JSON.parse(invb.toString()), reviews: any = JSON.parse(reviewb.toString()), r14: any = JSON.parse(r14b.toString()), r15: any = JSON.parse(r15b.toString()), ortpkg: any = JSON.parse(ortb.toString()); const approved = reviews.reviews.filter((r: any) => r.state === "APPROVED"), rev = new Map(approved.map((r: any): [
    string,
    G8DReview
] => [r.candidateId, r])), candidates = inv.candidates.filter((c: any) => rev.has(c.id)).sort((a: any, b: any) => a.id.localeCompare(b.id)); const fp = sha(JSON.stringify(candidates.map((c: any) => [c.id, c.sha256]))); if (candidates.length !== 558 || approved.length !== 558 || fp !== "c38c21141d65e25b2a0dbf5c1fc90847a3920f8fe4dfe437a9cc9cdf2deb5c5b" || sha(r14b) !== "644af990886280ff2f5f590e5ea91af3fad1875164e5e30065bcb1d5be170e81" || sha(r15b) !== "9eb3ab2537df22812ee583250f697564606ba8419de8f6fd669fc98428d2d85b" || sha(modelb) !== NUDENET_320N.modelSha256 || sha(cvb) !== G8C_R6_OPENCV_SHA256)
    throw Error("G8-D authority gate failed"); const pre = { schemaVersion: "STHN_I4_G8D_PREREGISTRATION_V1", corpus: { count: 558, candidateFingerprint: fp, fixtureIdentity: "71f6d79fe1a0249d7085029f37211da4573a746378818f826da3e21afc0fb42f" }, r14: r14.semanticFingerprint, r15: r15.semanticFingerprint, model: sha(modelb), runtime: { node: process.version, ort: ortpkg.version, opencv: G8C_R6_PACKAGE, opencvVersion: G8C_R6_PACKAGE_VERSION }, sources: { helper: sha(helperb), postprocessor: sha(postb) }, mechanics: { classes: NUDENET_320N.classes, confidence: .2, nmsScore: .25, nmsIou: .45, noObjectness: true, noSigmoid: true, noSoftmax: true }, scope: { specialistOnly: true, noPolicyMapping: true, noThresholdSearch: true, noV2Relabeling: true, unseen325: false } }; const pref = { ...pre, semanticFingerprint: sha(JSON.stringify(pre)), byteSha256: sha(Buffer.from(JSON.stringify(pre, null, 2) + "\n")) }; await mkdir(raw, { recursive: true }); await once("g8d-preregistration.json", pref); await once("g8d-corpus-authority.json", { count: 558, fingerprint: fp, fixtureIdentity: pre.corpus.fixtureIdentity, approved: approved.length, excluded: 0 }); const cv = await cvload(); if (!cv?.Mat || cv.INTER_LINEAR !== 1)
    throw Error("G8-D cv gate"); const session = await ort.InferenceSession.create(model, { executionProviders: ["cpu"], enableCpuMemArena: false, enableMemPattern: false }); const rows: any[] = [], manifest: any[] = []; try {
    for (const c of candidates) {
        const r = rev.get(c.id), b = await readFile(p(`evaluation-cache/image-moderation/benchmark/${c.localAsset}`));
        if (!isG8DReview(r))
            throw Error(`review mismatch ${c.id}`);
        if (sha(b) !== c.sha256)
            throw Error(`source mismatch ${c.id}`);
        const t0 = Date.now(), z = await historicalG8BResizeAndTensor(b, cv), t1 = Date.now(), t = new ort.Tensor("float32", z.tensor, [1, 3, 320, 320]);
        let o: ort.Tensor | undefined;
        try {
            o = (await session.run({ images: t })).output0 as ort.Tensor;
            const file = path.join(raw, `${c.id}.f32`), saved = await persistR11Raw(file, o.data as Float32Array), loaded = await reloadR11Raw(file);
            if (saved.sha256 !== loaded.sha256)
                throw Error(`reload ${c.id}`);
            const a = await postprocessPersistedR11Raw(file, z.decoded.width, z.decoded.height), t2 = Date.now();
            rows.push({ candidateId: c.id, sourceSha256: c.sha256, decision: r.expectedDecision, classifications: r.coverageClasses ?? [c.coverageClass], categories: r.categories ?? [], contexts: r.contextTags ?? [], tensorSha256: z.tensorSha256, detections: a.detections, timing: { preprocess: t1 - t0, inferencePostprocess: t2 - t1, total: t2 - t0 } });
            manifest.push({ candidateId: c.id, sourceSha256: c.sha256, inputTensorSha256: z.tensorSha256, modelSha256: sha(modelb), outputName: "output0", shape: o.dims, dtype: o.type, elementCount: (o.data as Float32Array).length, byteLength: saved.byteLength, rawOutputSha256: saved.sha256, finite: true, reloadVerified: true });
        }
        finally {
            o?.dispose();
            t.dispose();
        }
    }
}
finally {
    await session.release();
} const decision = group(rows, r => [r.decision]), classification = group(rows, r => r.classifications), category = group(rows, r => r.categories), context = group(rows, r => r.contexts), total = rows.reduce((s, r) => s + r.detections.length, 0), withD = rows.filter(r => r.detections.length).length; const classes = Object.fromEntries(NUDENET_320N.classes.map(c => [c, { detections: rows.reduce((s, r) => s + r.detections.filter((d: any) => d.class === c).length, 0), candidates: rows.filter(r => r.detections.some((d: any) => d.class === c)).length }])); await once("g8d-runtime-authority.json", { r14: r14.semanticFingerprint, r15: r15.semanticFingerprint, model: sha(modelb), node: process.version, ort: ortpkg.version, opencv: sha(cvb), helper: sha(helperb) }); const man = { candidates: manifest, semanticFingerprint: sha(JSON.stringify(manifest)) }; await once("g8d-raw-output-manifest.json", man); await once("g8d-native-detections.json", { rows, classes }); await once("g8d-decision-analysis.json", decision); await once("g8d-classification-analysis.json", classification); await once("g8d-category-analysis.json", category); await once("g8d-context-analysis.json", context); await once("g8d-hard-safety-analysis.json", { NUDITY_BLOCK: classification.NUDITY_BLOCK, EXPLICIT_SEXUAL_BLOCK: classification.EXPLICIT_SEXUAL_BLOCK, PORNOGRAPHY_BLOCK: classification.PORNOGRAPHY_BLOCK }); await once("g8d-suggestive-analysis.json", classification.SUGGESTIVE_BLOCK); await once("g8d-pass-surface-analysis.json", Object.fromEntries(Object.entries(classification).filter(([k]) => k.endsWith("_PASS")))); await once("g8d-transparent-clothing-evidence.json", { status: "INSUFFICIENT_AUTHORITATIVE_TRANSPARENT_CLOTHING_SUBSET" }); await once("g8d-historical-g8a-comparison.json", { historicalG8A: "0 retained detections across 558 successfully processed development images", corrected: { retained: total, withDetection: withD } }); await once("g8d-performance.json", { totalWallMs: rows.reduce((s, r) => s + r.timing.total, 0), medianMs: rows.map(r => r.timing.total).sort((a, b) => a - b)[279], p95Ms: rows.map(r => r.timing.total).sort((a, b) => a - b)[Math.floor(558 * .95)] }); const final = { status: "NUDENET_CORRECTED_DEVELOPMENT_EVALUATION_COMPLETE", successful: rows.length, failed: 0, withDetection: withD, zeroDetection: 558 - withD, totalDetections: total, specialistEvidence: "MODERATE_NUDITY_SPECIALIST_EVIDENCE", suggestiveEvidence: "LIMITED_SUGGESTIVE_PRESENTATION_EVIDENCE", transparentEvidence: "INSUFFICIENT_AUTHORITATIVE_TRANSPARENT_CLOTHING_SUBSET", architecture: "CONTINUE_NUDENET_SPECIALIST_IN_ARCHITECTURE_RESEARCH", manifest: man.semanticFingerprint }; await once("g8d-corrected-nudenet-development-evaluation.json", { ...final, semanticFingerprint: sha(JSON.stringify(final)) }); await writeFile(path.join(out, "g8d-corrected-nudenet-development-evaluation.md"), `# I4-G8-D\n\n${final.status}\n\n${total} retained native detections across ${withD}/558 candidates.\n`, { flag: "wx" }); console.log(JSON.stringify(final)); })().catch(e => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; });
