import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { evaluateY4Sample, Y4Manifest } from "../evaluation/y4ProfileMediaCalibration.service";
if(process.env.NODE_ENV==="production")throw new Error("Y4 calibration is development-only");
const [manifestPath,reportPath]=process.argv.slice(2);if(!manifestPath||!reportPath)throw new Error("Usage: node ... <manifest> <report>");
(async()=>{const manifest=JSON.parse(await readFile(manifestPath,"utf8")) as Y4Manifest;const work=path.join(path.dirname(reportPath),"y4-composites");const results=[];for(const sample of manifest.samples)results.push(await evaluateY4Sample(sample,work));await mkdir(path.dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify({schemaVersion:"STHN_Y4_PROFILE_MEDIA_REPORT_V1",requested:results.length,results},null,2));})().catch(e=>{console.error(e.message);process.exitCode=1});
