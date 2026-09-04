import crypto from "node:crypto";
import path from "node:path";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { evaluateY4Sample, type Y4Sample } from "./y4ProfileMediaCalibration.service";
import { classifyY4EMedia, evaluateY4EPolicy, summarizeY4EProfile, type Y4EMediaEvidence } from "./y4ProfileMediaPolicy.service";

export const Y4F_FAMILIES = ["HOLDOUT_GENUINE_CLEAN","HOLDOUT_GENUINE_NO_FACE","HOLDOUT_GENUINE_GROUP","HOLDOUT_GENUINE_DIFFICULT_NATURAL","HOLDOUT_MIXED_SINGLE_FOREIGN","HOLDOUT_MIXED_MULTIPLE_FOREIGN","HOLDOUT_IMPERSONATION_SINGLE_PERSON","HOLDOUT_IMPERSONATION_GROUP_ABSENT","HOLDOUT_LOW_EVIDENCE","HOLDOUT_CONTRADICTORY_BALANCED"] as const;
export type Y4FFamily=typeof Y4F_FAMILIES[number];
export type Y4FMedia={ role:"AVATAR"|"COVER"|"PROFILE_PHOTO"; sample:Y4Sample|"NO_FACE" };
export type Y4FProfile={scenarioId:string;family:Y4FFamily;live:[string,string,string,string,string];media:Y4FMedia[]};
export type Y4FManifest={schemaVersion:"STHN_Y4F_HOLDOUT_V1";profiles:Y4FProfile[];calibrationSourceMedia:string[]};
const image=/\.(jpe?g|png)$/i;
const semantic=(family:Y4FFamily)=>family.startsWith("HOLDOUT_GENUINE")?"GENUINE":family.startsWith("HOLDOUT_IMPERSONATION")?"IMPERSONATION":family==="HOLDOUT_LOW_EVIDENCE"?"INSUFFICIENT":"CONFLICTING";
const canonical=(value:unknown)=>JSON.stringify(value);
export const y4fManifestHash=(manifest:Y4FManifest)=>crypto.createHash("sha256").update(canonical(manifest)).digest("hex");
export const calibrationExclusion=async(manifestPath:string)=>{const value=JSON.parse(await readFile(manifestPath,"utf8")) as {samples:Y4Sample[]};return new Set(value.samples.flatMap(sample=>[...sample.live,...sample.profile]));};
export const generateY4FManifest=async(input:{datasetRoot:string;calibrationManifest:string;perFamily:number})=>{
 if(process.env.NODE_ENV==="production")throw new Error("Y4F evaluation is development-only");const excluded=await calibrationExclusion(input.calibrationManifest);const dirs=(await readdir(input.datasetRoot,{withFileTypes:true})).filter(x=>x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name));
 const ids=await Promise.all(dirs.map(async d=>({files:(await readdir(path.join(input.datasetRoot,d.name))).filter(x=>image.test(x)).sort().map(x=>path.join(input.datasetRoot,d.name,x)).filter(x=>!excluded.has(x))})));const usable=ids.filter(x=>x.files.length>=11);if(usable.length<4)throw new Error("Insufficient fresh VGGFace2 media");let n=0;const profiles:Y4FProfile[]=[];
 for(const family of Y4F_FAMILIES)for(let i=0;i<input.perFamily;i++){const a=usable[i%usable.length],b=usable[(i+1)%usable.length],c=usable[(i+2)%usable.length];const live=a.files.slice(0,5) as Y4FProfile["live"];const single=(files:string[]):Y4Sample=>({sampleId:`Y4F_MEDIA_${n}_${files.length}`,scenario:files.length>1?"MULTI_TARGET_PRESENT":"SINGLE_SAME",live,profile:files,targetTile:files.length>1?1:undefined});let source:string[][];
  if(family==="HOLDOUT_GENUINE_CLEAN"||family==="HOLDOUT_GENUINE_DIFFICULT_NATURAL")source=[[a.files[5]],[a.files[6]],[a.files[7]],[a.files[8]]];
  else if(family==="HOLDOUT_GENUINE_NO_FACE")source=[[a.files[5]],[a.files[6]],[a.files[7]]];
  else if(family==="HOLDOUT_GENUINE_GROUP")source=[[a.files[5]],[b.files[5],a.files[6],c.files[5]],[a.files[7]],[a.files[8]]];
  else if(family==="HOLDOUT_MIXED_SINGLE_FOREIGN")source=[[a.files[5]],[a.files[6]],[a.files[7]],[b.files[5]]];
  else if(family==="HOLDOUT_MIXED_MULTIPLE_FOREIGN"||family==="HOLDOUT_CONTRADICTORY_BALANCED")source=[[a.files[5]],[a.files[6]],[b.files[5]],[c.files[5]]];
  else if(family==="HOLDOUT_IMPERSONATION_SINGLE_PERSON")source=[[b.files[5]],[b.files[6]],[b.files[7]],[b.files[8]]];
  else if(family==="HOLDOUT_IMPERSONATION_GROUP_ABSENT")source=[[b.files[5],c.files[5],b.files[6]],[b.files[7],c.files[6],b.files[8]],[c.files[7]],[b.files[9]]];
  else source=[];
  const roles:Array<"AVATAR"|"COVER"|"PROFILE_PHOTO"> = ["AVATAR","COVER","PROFILE_PHOTO","PROFILE_PHOTO"];
  const media:Y4FMedia[]=family==="HOLDOUT_LOW_EVIDENCE"?[{role:"AVATAR",sample:"NO_FACE"},{role:"COVER",sample:"NO_FACE"},{role:"PROFILE_PHOTO",sample:"NO_FACE"},{role:"PROFILE_PHOTO",sample:"NO_FACE"}]:source.map((files,index)=>({role:roles[index],sample:single(files)}));profiles.push({scenarioId:`Y4F_${family}_${String(++n).padStart(4,"0")}`,family,live,media});}
 return {schemaVersion:"STHN_Y4F_HOLDOUT_V1",profiles,calibrationSourceMedia:[...excluded]} as Y4FManifest;
};
export const auditY4FOverlap=(manifest:Y4FManifest)=>{const all=manifest.profiles.flatMap(p=>[...p.live,...p.media.flatMap(m=>m.sample==="NO_FACE"?[]:m.sample.profile)]);const excluded=new Set(manifest.calibrationSourceMedia);return {sourceMediaOverlap:all.filter(x=>excluded.has(x)).length,holdoutDistinctSourceMedia:new Set(all).size,identityOverlap:"EXPECTED_UNAVOIDABLE",exactProfileCompositionOverlap:new Set(manifest.profiles.map(p=>canonical(p.media))).size===manifest.profiles.length?0:null};};
export const evaluateY4F=async(manifest:Y4FManifest,work:string,limit?:number)=>{if(process.env.NODE_ENV==="production")throw new Error("Y4F evaluation is development-only");const noFace=await sharp({create:{width:256,height:256,channels:3,background:"black"}}).png().toBuffer();const profiles=[];for(const profile of manifest.profiles.slice(0,limit)){const media:Y4EMediaEvidence[]=[];for(const entry of profile.media){if(entry.sample==="NO_FACE"){media.push({state:"FACE_NOT_PRESENT"});continue}const result=await evaluateY4Sample({...entry.sample,live:profile.live},work);const item=result.media[0];media.push(classifyY4EMedia({status:item.status,candidateCount:item.candidateCount,bestScore:item.bestCandidate?.medianSimilarity,margin:item.bestVsSecondMargin}));}const evidence=summarizeY4EProfile(media);profiles.push({scenarioId:profile.scenarioId,family:profile.family,semantic:semantic(profile.family),states:media.map(x=>x.state),evidence,outcome:evaluateY4EPolicy(evidence,{minimumUsable:2,minimumMatches:2,matchRatio:.67,mismatchRatioForLikelyMismatch:1,requireNoMismatch:true})});}return {manifestHash:y4fManifestHash(manifest),requested:limit??manifest.profiles.length,profiles};};
export const writeJson=async(file:string,value:unknown)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2));};
