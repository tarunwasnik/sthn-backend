import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { alignFaceEvidence, cosineSimilarity } from "../services/profile/profileVerificationFaceEmbedding.service";
import { getProductionFaceEmbeddingAdapter, SFACE_ARTIFACT, SFACE_FACE_EMBEDDING_SPECIFICATION } from "../services/profile/profileVerificationFaceEmbeddingAdapter";
import { detectYuNetFaces } from "../services/profile/profileVerificationYuNetRunner";
import { CalibrationSample } from "../evaluation/sfaceCalibration.types";

if (process.env.NODE_ENV === "production") throw new Error("OpenCV equivalence certification is development-only");
const [manifestPath, oracleRoot] = process.argv.slice(2);
if (!manifestPath || !oracleRoot) throw new Error("Usage: certifySFaceOpenCvEquivalence <manifest> <oracle-root>");
const hash = (value: Uint8Array) => crypto.createHash("sha256").update(value).digest("hex");

(async () => {
  const base = path.dirname(path.resolve(manifestPath)); const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { samples: CalibrationSample[] };
  const lookup = (id: string) => { const sample = manifest.samples.find((item) => item.sampleId === id); if (!sample) throw new Error("Required opaque sample is absent"); return sample; };
  const temp = path.join(path.resolve(oracleRoot), "temp"); await mkdir(temp, { recursive: true }); const items: Array<{ id: string; png: string; sthn: number[]; pixelHash: string }> = [];
  const add = async (id: string, relativePath: string) => { const bytes = await readFile(path.resolve(base, relativePath)); const detection = await detectYuNetFaces(bytes, "UNSPECIFIED", false); if (detection.faces.length !== 1) throw new Error("Oracle sample has no single detected face"); const aligned = await alignFaceEvidence({ bytes, landmarks: detection.faces[0].landmarks, preprocessing: SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing }); const png = path.join(temp, `${id}.png`); await sharp(aligned.pixels, { raw: { width: 112, height: 112, channels: 3 } }).png().toFile(png); items.push({ id, png, sthn: Array.from(await getProductionFaceEmbeddingAdapter().infer(aligned)), pixelHash: hash(aligned.pixels) }); };
  const matchIds = ["VGG2_TA_M_001", "VGG2_TA_M_002", "VGG2_TA_M_007", "VGG2_TA_M_008", "VGG2_TA_M_009"]; const nonMatchIds = ["VGG2_TA_N_001", "VGG2_TA_N_002", "VGG2_TA_N_003", "VGG2_TA_N_004", "VGG2_TA_N_005"];
  for (let index = 0; index < 5; index += 1) { const sample = lookup(matchIds[index]); await add(`M${index}R`, sample.reference); await add(`M${index}C`, sample.captures[0]); }
  for (let index = 0; index < 5; index += 1) { const sample = lookup(nonMatchIds[index]); await add(`N${index}R`, sample.reference); await add(`N${index}C`, sample.captures[0]); }
  const byId = new Map(items.map((item) => [item.id, item])); const pairs = [{ id: "ORACLE_SELF_001", label: "SELF", a: "M0R", b: "M0R" }, ...matchIds.map((_, index) => ({ id: `ORACLE_MATCH_${String(index + 1).padStart(3, "0")}`, label: "MATCH", a: `M${index}R`, b: `M${index}C` })), ...nonMatchIds.map((_, index) => ({ id: `ORACLE_NONMATCH_${String(index + 1).padStart(3, "0")}`, label: "NON_MATCH", a: `N${index}R`, b: `N${index}C` }))].map((pair) => ({ ...pair, sthnCosine: cosineSimilarity(byId.get(pair.a)!.sthn, byId.get(pair.b)!.sthn, 128) }));
  const input = path.join(temp, "input.json"); await writeFile(input, JSON.stringify({ model: path.resolve(process.cwd(), SFACE_ARTIFACT.relativePath), items, pairs }));
  const output = await new Promise<string>((resolve, reject) => { const child = spawn(path.join(oracleRoot, "venv", "Scripts", "python.exe"), [path.join(oracleRoot, "oracle.py"), input]); let stdout = "", stderr = ""; child.stdout.on("data", (value) => { stdout += value; }); child.stderr.on("data", (value) => { stderr += value; }); child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || "OpenCV oracle failed"))); });
  await rm(temp, { recursive: true, force: true }); console.log(output);
})().catch(async (error) => { await rm(path.join(path.resolve(oracleRoot), "temp"), { recursive: true, force: true }); console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
