import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { NUDENET_320N } from "../../evaluation/imageModeration/specialistRuntimeFeasibility";
test("G8-A freezes V1-only authority before development inference", async () => { const root=process.cwd(), source=await readFile(path.join(root,"src","scripts","evaluateNudeNet320nDevelopment.ts"),"utf8"); assert.match(source,/NUDENET_320N.*specialistRuntimeFeasibility/); assert.equal(NUDENET_320N.modelSha256,"c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f"); assert.match(source,/c38c21141d65e25b2a0dbf5c1fc90847a3920f8fe4dfe437a9cc9cdf2deb5c5b/); assert.match(source,/71f6d79fe1a0249d7085029f37211da4573a746378818f826da3e21afc0fb42f/); assert.match(source,/NOT_APPLICABLE_TO_V1_DEVELOPMENT_CORPUS/); assert.doesNotMatch(source,/^import .*?(?:unseenTestV1|gantman|e5o|owenElliott|production)\//im); });
