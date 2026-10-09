import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { projectG8FSourceBox, withinG8FContent } from "../../evaluation/imageModeration/g8fPresentationProjection";

test("G8-F source-space projection stays within portrait, landscape, and square content",()=>{
  for(const [box,w,h] of [[[100,200,300,400],4437,7823],[[100,50,200,250],500,455],[[100,100,400,500],1024,1024]] as const){const p=projectG8FSourceBox(box,w,h);assert.ok(withinG8FContent(p));assert.ok(p.widthPercent<=100&&p.heightPercent<=100)}
});
test("G8-F simplified presentation has corrected authority, controls, and no obsolete projection",async()=>{const s=await readFile(path.join(process.cwd(),"src","scripts","runG8FHumanVsNudeNetVisualReview.ts"),"utf8");for(const x of ["3856159823ec82faedd0f5fa9c7070d2419b4cae1f0ed4270e46936dc0958cf5","G8F_SIMPLIFIED_REVIEW_AND_BOX_PROJECTION_FIX_COMPLETE","blockDetected","passExposure","nudityMiss","suggestiveMiss","Human reason: All","Show boxes","Details","projectG8FSourceBox","withinG8FContent","sourceCoordinate / originalSourceDimension"]){assert.ok(s.includes(x),x)}for(const x of ["onnxruntime-node","InferenceSession","session.run","fetch(","http://","https://","NudeNet Decision","thumbnailWidth; top%=100*y/thumbnailHeight"]){assert.equal(s.includes(x),false,x)}});
