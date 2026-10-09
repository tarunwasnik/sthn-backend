import assert from "node:assert/strict";
import test from "node:test";
import { interpretLukeJacob, LUKEJACOB_NATIVE_LABELS, softmaxLukeJacob } from "../../evaluation/imageModeration/lukeJacobRuntimeAuthority";
test("LukeJacob preserves the exact five native labels without an STHN decision",()=>{assert.deepEqual(LUKEJACOB_NATIVE_LABELS,["drawings","hentai","neutral","porn","sexy"]);assert.deepEqual(interpretLukeJacob([0,1,2,3,4]).nativeClass,"sexy");assert.deepEqual(interpretLukeJacob([5,1,2,3,4]).nativeClass,"drawings");});
test("LukeJacob rejects malformed output and uses stable diagnostic softmax",()=>{assert.throws(()=>softmaxLukeJacob([1,2]));assert.throws(()=>softmaxLukeJacob([1,2,3,4,Number.NaN]));const p=softmaxLukeJacob([1000,999,998,997,996]);assert.ok(Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-12);});
