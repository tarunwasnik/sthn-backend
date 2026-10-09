import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const run=path.resolve(process.cwd(),"evaluation-cache","image-moderation","owen-elliott-image-safety-classifier-xs","e5o-nonlinear-head-seed-104729");
test("E5O run remains preregistered, head-only, and split-bound",async()=>{const m=JSON.parse(await readFile(path.join(run,"run-metadata.json"),"utf8")) as Record<string,any>;assert.deepEqual([m.preRegistrationSha256,m.authorities.splitFingerprint,m.model.architecture,m.model.trainableParameters],["417c4509d1df5238a3f700f5faa44739d0fb5876e6a37e6d47114187dad797df","de209dc412f3272c06eaecd2314d882f45c7c3fdfddb1e70a48e68f1bdaa98d2",["Linear(220,64)","ReLU","Dropout(0.20)","Linear(64,2)"],14274]);assert.deepEqual(m.model.classMapping,{PASS:0,BLOCK:1});assert.equal(m.backboneDigestBefore,m.backboneDigestAfter);assert.deepEqual(m.boundaries,{holdoutAccessed:false,productionMutation:false,backboneParametersChanged:false,onlyRegisteredHeadOptimized:true});assert.equal(m.bestValidation.confusion.matrix.flat().reduce((a:number,b:number)=>a+b,0),112);});
