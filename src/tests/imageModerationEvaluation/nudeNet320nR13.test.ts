import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { G8C_R8_STAGE_A_IDS } from "../../evaluation/imageModeration/nudeNet320nR8Contract";
test("R13 helper is preprocessing-only",async()=>{const s=await readFile(path.join(process.cwd(),"src","scripts","g8cR13HistoricalPreprocess.py"),"utf8");assert.doesNotMatch(s,/onnxruntime|InferenceSession|NudeDetector|\.run\(/);assert.match(s,/blobFromImage/)});
test("R13 preserves exact frozen16 scope",()=>{assert.equal(G8C_R8_STAGE_A_IDS.length,16);assert.equal(new Set(G8C_R8_STAGE_A_IDS).size,16)});
