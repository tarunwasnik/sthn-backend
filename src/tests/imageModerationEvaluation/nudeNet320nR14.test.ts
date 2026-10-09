import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { historicalG8BTensor } from "../../evaluation/imageModeration/nudeNet320nHistoricalG8BPreprocess";
import { G8C_R8_STAGE_A_IDS } from "../../evaluation/imageModeration/nudeNet320nR8Contract";
test("R14 historical channel order is BGR planes after historical swapRB",()=>{const x=new Uint8Array(320*320*3);x.set([11,73,211]);const t=historicalG8BTensor(x),s=Math.fround(1/255);assert.equal(t[0],Math.fround(Math.fround(211)*s));assert.equal(t[320*320],Math.fround(Math.fround(73)*s));assert.equal(t[2*320*320],Math.fround(Math.fround(11)*s));assert.equal(t.byteLength,1228800)});
test("R14 runner has no inference path and frozen16 scope",async()=>{const s=await readFile(path.join(process.cwd(),"src","scripts","runG8CR14NodeHistoricalPreprocessingParity.ts"),"utf8");assert.doesNotMatch(s,/onnxruntime|InferenceSession|session\.run/);assert.match(s,/full558:false,unseen325:false/);assert.equal(G8C_R8_STAGE_A_IDS.length,16);assert.equal(new Set(G8C_R8_STAGE_A_IDS).size,16)});
