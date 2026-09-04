import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { createProfileVerificationSubmittedMediaSnapshot } from "../services/profile/profileVerificationSubmittedMedia.service";
import { analyseLiveCaptureProfileMediaShadow } from "../services/profile/profileVerificationLiveMediaShadowAnalysis.service";
import { alignFaceEvidence, cosineSimilarity, normalizeFaceEmbeddingL2 } from "../services/profile/profileVerificationFaceEmbedding.service";
import { getProductionFaceEmbeddingAdapter, SFACE_FACE_EMBEDDING_SPECIFICATION } from "../services/profile/profileVerificationFaceEmbeddingAdapter";
import { medianSFaceSimilarity } from "../services/profile/profileVerificationSFaceShadowAnalysis.service";
import { detectYuNetFaces } from "../services/profile/profileVerificationYuNetRunner";
import { YuNetDetection } from "../services/profile/profileVerificationYuNet.types";

export type Y4Scenario = "SINGLE_SAME" | "SINGLE_DIFFERENT" | "MULTI_TARGET_PRESENT" | "MULTI_TARGET_ABSENT";
export type Y4Sample = { sampleId: string; scenario: Y4Scenario; live: [string,string,string,string,string]; profile: string[]; targetTile?: number };
export type Y4Manifest = { schemaVersion: "STHN_Y4_PROFILE_MEDIA_CALIBRATION_V1"; samples: Y4Sample[] };
const ext = new Set([".jpg", ".jpeg", ".png"]);
const identities = async (root: string) => (await readdir(root, { withFileTypes: true })).filter(x => x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)).map(async d => ({ dir: path.join(root,d.name), files: (await readdir(path.join(root,d.name))).filter(f=>ext.has(path.extname(f).toLowerCase())).sort().map(f=>path.join(root,d.name,f)) })).reduce(async (a,p)=>{const all=await a;const x=await p;if(x.files.length>=7)all.push(x);return all;}, Promise.resolve([] as {dir:string;files:string[]}[]));
/** Deterministic lexical, score-independent selection. */
export const prepareY4Manifest = async (root: string, counts: Partial<Record<Y4Scenario,number>> = {}): Promise<Y4Manifest> => {
  const ids=await identities(root); const target={SINGLE_SAME:300,SINGLE_DIFFERENT:500,MULTI_TARGET_PRESENT:300,MULTI_TARGET_ABSENT:500,...counts}; if(ids.length<10)throw new Error("Insufficient eligible VGGFace2 identities"); const samples:Y4Sample[]=[]; let n=0;
  for(const scenario of Object.keys(target) as Y4Scenario[]) for(let i=0;i<target[scenario];i++){const a=ids[i%ids.length], b=ids[(i+1)%ids.length], c=ids[(i+2)%ids.length], d=ids[(i+3)%ids.length]; const live=a.files.slice(0,5) as Y4Sample["live"]; const profile=scenario==="SINGLE_SAME"?[a.files[5]]:scenario==="SINGLE_DIFFERENT"?[b.files[5]]:scenario==="MULTI_TARGET_PRESENT"?[b.files[5],a.files[5],c.files[5]]:[b.files[5],c.files[5],d.files[5]]; samples.push({sampleId:`Y4_${scenario}_${String(++n).padStart(4,"0")}`,scenario,live,profile,targetTile:scenario==="MULTI_TARGET_PRESENT"?1:undefined});} return {schemaVersion:"STHN_Y4_PROFILE_MEDIA_CALIBRATION_V1",samples};
};
export const createY4Composite = async (files:string[], destination:string) => { const tiles=await Promise.all(files.map(async file=>sharp(file).resize(256,256,{fit:"cover"}).png().toBuffer())); await mkdir(path.dirname(destination),{recursive:true}); await sharp({create:{width:256*tiles.length,height:256,channels:3,background:"black"}}).composite(tiles.map((input,i)=>({input,left:i*256,top:0}))).png().toFile(destination); return destination; };
/** Evaluation-only truth mapping: the YuNet bbox centre must fall inside one 256×256 tile. */
export const mapYuNetFacesToCompositeTiles=(detection:YuNetDetection,tileCount:number)=>detection.faces.map((face,candidateIndex)=>{const center=face.x+face.width/2;const tile=Math.floor(center/256);return {candidateIndex,tileIndex:tile>=0&&tile<tileCount?tile:null};});
const embed=async(bytes:Buffer)=>{const d=await detectYuNetFaces(bytes,"UNSPECIFIED",false);if(d.faces.length!==1)return null;return normalizeFaceEmbeddingL2(await getProductionFaceEmbeddingAdapter().infer(await alignFaceEvidence({bytes,landmarks:d.faces[0].landmarks,preprocessing:SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing})),128)};
export type Y4LiveCaptureInspection = {
  captures: Array<{ index: number; usable: boolean }>;
  pairs: Array<{ left: number; right: number; similarity: number }>;
  statistics?: ReturnType<typeof boundedStats>;
};
export type Y4LiveAnchorSummary = {
  usableCaptureCount: number;
  pairwiseComparisonCount: number;
  pairwise: ReturnType<typeof boundedStats> & { p25: number } | null;
  weakestPeerMedian: number | null;
  strongestPeerMedian: number | null;
};
const percentile = (values: readonly number[], value: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) throw new Error("Cannot calculate a percentile of no values");
  const index = (sorted.length - 1) * value;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
};
/** The evaluation harness is never an authority available to a production request. */
export const assertY4EvaluationOnly = () => {
  if (process.env.NODE_ENV === "production") throw new Error("Y4 calibration is development-only");
};
/** Pure bounded summary used by the Gate-1 calibration report and its tests. */
export const summarizeY4LiveCaptureInspection = (inspection: Y4LiveCaptureInspection): Y4LiveAnchorSummary => {
  const values = inspection.pairs.map(pair => pair.similarity);
  const peerMedians = inspection.captures.filter(capture => capture.usable).map(capture => {
    const peers = inspection.pairs.filter(pair => pair.left === capture.index || pair.right === capture.index).map(pair => pair.similarity);
    return peers.length ? medianSFaceSimilarity(peers) : null;
  }).filter((value): value is number => value !== null);
  return {
    usableCaptureCount: inspection.captures.filter(capture => capture.usable).length,
    pairwiseComparisonCount: values.length,
    pairwise: values.length ? { ...boundedStats(values), p25: percentile(values, 0.25) } : null,
    weakestPeerMedian: peerMedians.length ? Math.min(...peerMedians) : null,
    strongestPeerMedian: peerMedians.length ? Math.max(...peerMedians) : null,
  };
};
/** Stable opaque identifier for reports; it never serializes media paths or dataset identities. */
export const y4OpaqueLiveAnchorId = (files: readonly string[]) => `Y4_LIVE_ANCHOR_${crypto.createHash("sha256").update(JSON.stringify([...files])).digest("hex").slice(0, 16).toUpperCase()}`;
/** Bounded evaluation-only live telemetry; never returns embeddings or source references. */
export const inspectY4LiveCaptureSet=async(files:readonly string[]):Promise<Y4LiveCaptureInspection>=>{assertY4EvaluationOnly();const embeddings: Array<number[]|null>=[];for(const file of files)try{embeddings.push(await embed(await readFile(file)))}catch{embeddings.push(null)}const pairs:Array<{left:number;right:number;similarity:number}>=[];for(let left=0;left<embeddings.length;left+=1)for(let right=left+1;right<embeddings.length;right+=1)if(embeddings[left]&&embeddings[right])pairs.push({left,right,similarity:cosineSimilarity(embeddings[left]!,embeddings[right]!,SFACE_FACE_EMBEDDING_SPECIFICATION.expectedDimensions)});const inspection={captures:embeddings.map((value,index)=>({index,usable:value!==null})),pairs,...(pairs.length?{statistics:boundedStats(pairs.map(pair=>pair.similarity))}:{})};return inspection;};
const boundedStats=(values:number[])=>({minimumSimilarity:Math.min(...values),maximumSimilarity:Math.max(...values),meanSimilarity:values.reduce((sum,value)=>sum+value,0)/values.length,medianSimilarity:medianSFaceSimilarity(values)});
/**
 * Evaluation-only detail for preselected Y4 report rows. It returns no media,
 * identity, path, embedding, landmark, or bounding-box data.
 */
export const inspectY4Sample=async(sample:Y4Sample,work:string)=>{
  assertY4EvaluationOnly();
  const live=(await Promise.all(sample.live.map(async file=>embed(await readFile(file))))).filter((value):value is number[]=>value!==null);
  const profilePath=sample.profile.length===1?sample.profile[0]:await createY4Composite(sample.profile,path.join(work,`${sample.sampleId}.png`));
  const bytes=await readFile(profilePath);const detection=await detectYuNetFaces(bytes,"UNSPECIFIED",false);
  const geometry=sample.profile.length>1?mapYuNetFacesToCompositeTiles(detection,sample.profile.length):[];
  const candidates:Array<{candidateIndex:number;tileIndex:number|null;comparisonCount:number;minimumSimilarity:number;maximumSimilarity:number;meanSimilarity:number;medianSimilarity:number}>=[];
  for(const [candidateIndex,face] of detection.faces.entries())try{
    const embedding=normalizeFaceEmbeddingL2(await getProductionFaceEmbeddingAdapter().infer(await alignFaceEvidence({bytes,landmarks:face.landmarks,preprocessing:SFACE_FACE_EMBEDDING_SPECIFICATION.preprocessing})),128);
    const values=live.map(reference=>cosineSimilarity(embedding,reference,SFACE_FACE_EMBEDDING_SPECIFICATION.expectedDimensions));
    candidates.push({candidateIndex,tileIndex:geometry.find(entry=>entry.candidateIndex===candidateIndex)?.tileIndex??null,comparisonCount:values.length,...boundedStats(values)});
  }catch{/* The production analyzer likewise excludes non-embeddable detections. */}
  candidates.sort((left,right)=>right.medianSimilarity-left.medianSimilarity||left.candidateIndex-right.candidateIndex);
  const pairwise:number[]=[];for(let left=0;left<live.length;left+=1)for(let right=left+1;right<live.length;right+=1)pairwise.push(cosineSimilarity(live[left],live[right],SFACE_FACE_EMBEDDING_SPECIFICATION.expectedDimensions));
  const target=sample.targetTile===undefined?undefined:candidates.find(candidate=>candidate.tileIndex===sample.targetTile);
  const tileCounts=geometry.reduce<Record<string,number>>((counts,entry)=>{if(entry.tileIndex!==null)counts[String(entry.tileIndex)]=(counts[String(entry.tileIndex)]??0)+1;return counts;},{});
  return {sampleId:sample.sampleId,scenario:sample.scenario,status:live.length>=3?"COMPLETED":"INSUFFICIENT_USABLE_LIVE_CAPTURES",usableLiveCaptureCount:live.length,liveConsistency:pairwise.length?boundedStats(pairwise):null,candidateCount:candidates.length,candidates,targetCandidateIndex:target?.candidateIndex??null,targetRank:target?candidates.findIndex(candidate=>candidate.candidateIndex===target.candidateIndex)+1:null,targetMappingUnambiguous:sample.targetTile===undefined?null:(geometry.filter(entry=>entry.tileIndex===sample.targetTile).length===1),multipleDetectionsPerTile:Object.values(tileCounts).some(count=>count>1)};
};
/** Evaluation-only real-runtime execution; reports retain opaque IDs and bounded scores only. */
export const evaluateY4Sample=async(sample:Y4Sample, work:string)=>{
  assertY4EvaluationOnly();
  const live=(await Promise.all(sample.live.map(async f=>embed(await readFile(f))))).filter((x):x is number[]=>x!==null);
  const profilePath=sample.profile.length===1?sample.profile[0]:await createY4Composite(sample.profile,path.join(work,`${sample.sampleId}.png`));
  const bytes=await readFile(profilePath); const snapshot=createProfileVerificationSubmittedMediaSnapshot({avatar:"local://profile",cover:"local://cover",profilePhotos:["local://one","local://two"]});
  const detector=(input:Buffer)=>detectYuNetFaces(input,"UNSPECIFIED",false);
  const result=await analyseLiveCaptureProfileMediaShadow({snapshot,mediaItems:[snapshot.avatar],usableLiveEmbeddings:live,readMedia:async()=>bytes,detector});
  const geometry=sample.profile.length>1?mapYuNetFacesToCompositeTiles(await detector(bytes),sample.profile.length):[];
  const bestCandidateIndex=result.media[0]?.bestCandidate?.candidateIndex??null;
  const bestCandidateTile=bestCandidateIndex===null?null:(geometry.find(face=>face.candidateIndex===bestCandidateIndex)?.tileIndex??null);
  return {sampleId:sample.sampleId,scenario:sample.scenario,status:result.reasonCode??"COMPLETED",live:result.live,targetTile:sample.targetTile??null,targetDetected:sample.targetTile===undefined?null:geometry.some(face=>face.tileIndex===sample.targetTile),targetRankedFirst:sample.targetTile===undefined?null:bestCandidateTile===sample.targetTile,bestCandidateTile,mappedCandidates:geometry,media:result.media.map(m=>({role:m.role,status:m.status,candidateCount:m.candidateCount,bestCandidate:m.bestCandidate,secondBestMedianSimilarity:m.secondBestMedianSimilarity,bestVsSecondMargin:m.bestVsSecondMargin}))};
};
export const writeY4Manifest=async(root:string,file:string,counts?:Partial<Record<Y4Scenario,number>>)=>{assertY4EvaluationOnly();const manifest=await prepareY4Manifest(root,counts);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(manifest,null,2));return manifest;};
