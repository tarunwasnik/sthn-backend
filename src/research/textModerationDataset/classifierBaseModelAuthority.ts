import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Tokenizer } from "tokenizers";

import { canonicalJson } from "./manifest";
import { E5_SMALL_MODEL_REPOSITORY, E5_SMALL_MODEL_REVISION } from "./semanticSimilarity/e5SmallExportContract";

export const CLASSIFIER_BASE_AUTHORITY_SCHEMA = "STHN_TEXT_MODERATION_CLASSIFIER_BASE_MODEL_AUTHORITY_V1" as const;
export const CLASSIFIER_BASE_AUTHORITY_VERSION = "XLM_ROBERTA_BASE_CLASSIFIER_AUTHORITY_V1" as const;
export const CLASSIFIER_BASE_AUTHORITY_FILENAME = "xlm-roberta-base-classifier-authority-v1.json" as const;
export const CLASSIFIER_BASE_AUTHORITY_SHA256 = "ca9cd876c9facd4b310a5cd9f09385113ce3e8c1376d2e5fd0a3b654ff2a17f1" as const;
export const CLASSIFIER_BASE_AUTHORITY_PAYLOAD_DIGEST = "7b4b87ad743613f453932d67661c563fa9d6c820229d4f94d1999e34b2cab9d0" as const;
export const CLASSIFIER_BASE_REPOSITORY = "FacebookAI/xlm-roberta-base" as const;
export const CLASSIFIER_BASE_REVISION = "e73636d4f797dec63c3081bb6ed5c7b0bb3f2089" as const;
export const CLASSIFIER_BASE_PURPOSE = "TEXT_MODERATION_BINARY_CLASSIFIER_BASE" as const;
export const CLASSIFIER_BASE_CACHE_RELATIVE_PATH = `evaluation-cache/text-moderation/classifier/facebookai-xlm-roberta-base/${CLASSIFIER_BASE_REVISION}` as const;

export const CLASSIFIER_BASE_ARTIFACTS = Object.freeze({
  "config.json": { byteSize: 615, sha256: "d66ed8cd4f2a93b358c245e50736fa389ed4f35c0bae7aad0b32abb20c62b579" },
  "sentencepiece.bpe.model": { byteSize: 5069051, sha256: "cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865" },
  "tokenizer.json": { byteSize: 9096718, sha256: "a898ea75433890f6610f4e470b8ebeb0c21dce5c8dd61f892eb09eb5919d2e2c" },
  "tokenizer_config.json": { byteSize: 25, sha256: "994f46754c5bf4014f1aa92d34b1374319c3a6b3f702105cd5b742beaecd18ce" },
} as const);

type ClassifierArtifactName = keyof typeof CLASSIFIER_BASE_ARTIFACTS;
interface ArtifactIdentity { readonly filename: ClassifierArtifactName; readonly sourceUrl: string; readonly byteSize: number; readonly sha256: string }

export interface ClassifierBaseAuthorityPayload {
  readonly schemaVersion: typeof CLASSIFIER_BASE_AUTHORITY_SCHEMA;
  readonly authorityVersion: typeof CLASSIFIER_BASE_AUTHORITY_VERSION;
  readonly phase: "T6L-6A-X";
  readonly authorizationDecision: "AUTHORIZE_XLM_ROBERTA_BASE_CLASSIFIER_AUTHORITY_V1";
  readonly purpose: typeof CLASSIFIER_BASE_PURPOSE;
  readonly source: {
    readonly repository: typeof CLASSIFIER_BASE_REPOSITORY;
    readonly revision: typeof CLASSIFIER_BASE_REVISION;
    readonly revisionKind: "IMMUTABLE_HUGGING_FACE_COMMIT";
    readonly resolutionSource: string;
    readonly resolvedAt: string;
    readonly license: "MIT";
  };
  readonly artifacts: readonly ArtifactIdentity[];
  readonly architecture: {
    readonly configClass: "XLMRobertaConfig";
    readonly upstreamArchitecture: "XLMRobertaForMaskedLM";
    readonly futureClassifierArchitecture: "XLMRobertaForSequenceClassification";
    readonly modelType: "xlm-roberta";
    readonly hiddenSize: 768;
    readonly numHiddenLayers: 12;
    readonly numAttentionHeads: 12;
    readonly intermediateSize: 3072;
    readonly vocabSize: 250002;
    readonly maxPositionEmbeddings: 514;
    readonly usableModelMaxLength: 512;
    readonly typeVocabSize: 1;
    readonly layerNormEps: 0.00001;
    readonly hiddenDropoutProbability: 0.1;
    readonly attentionDropoutProbability: 0.1;
    readonly configTokenIds: { readonly bos: 0; readonly pad: 1; readonly eos: 2 };
  };
  readonly tokenizer: {
    readonly tokenizerClass: "XLMRobertaTokenizerFast";
    readonly backend: "HUGGING_FACE_TOKENIZERS_UNIGRAM_SENTENCEPIECE";
    readonly fast: true;
    readonly vocabularySize: 250002;
    readonly modelMaxLength: 512;
    readonly modelInputNames: readonly ["input_ids", "attention_mask"];
    readonly tokenTypeIdsRequired: false;
    readonly defaultPaddingSide: "right";
    readonly defaultTruncationSide: "right";
    readonly artifactDefaultPadding: null;
    readonly artifactDefaultTruncation: null;
    readonly specialTokens: {
      readonly bos: { readonly token: "<s>"; readonly id: 0 };
      readonly cls: { readonly token: "<s>"; readonly id: 0 };
      readonly pad: { readonly token: "<pad>"; readonly id: 1 };
      readonly eos: { readonly token: "</s>"; readonly id: 2 };
      readonly sep: { readonly token: "</s>"; readonly id: 2 };
      readonly unk: { readonly token: "<unk>"; readonly id: 3 };
      readonly mask: { readonly token: "<mask>"; readonly id: 250001 };
    };
    readonly sequenceConstruction: {
      readonly single: "<s> A </s>";
      readonly pair: "<s> A </s> </s> B </s>";
      readonly allTypeIds: 0;
    };
  };
  readonly futureClassifierTask: {
    readonly task: "BINARY_ALLOW_BLOCK";
    readonly numLabels: 2;
    readonly label2id: { readonly ALLOW: 0; readonly BLOCK: 1 };
    readonly id2label: { readonly "0": "ALLOW"; readonly "1": "BLOCK" };
    readonly upstreamConfigMutated: false;
  };
  readonly semanticModelSeparation: {
    readonly classifierRepository: typeof CLASSIFIER_BASE_REPOSITORY;
    readonly classifierRevision: typeof CLASSIFIER_BASE_REVISION;
    readonly semanticRepository: typeof E5_SMALL_MODEL_REPOSITORY;
    readonly semanticRevision: typeof E5_SMALL_MODEL_REVISION;
    readonly authoritiesIndependent: true;
    readonly tokenizerAuthoritiesIndependent: true;
    readonly preprocessingContractsIndependent: true;
  };
  readonly toolchain: {
    readonly isolation: "UV_MANAGED_IGNORED_VENV";
    readonly python: "3.12.10";
    readonly transformers: "4.42.4";
    readonly pythonTokenizers: "0.19.1";
    readonly huggingfaceHub: "0.23.4";
    readonly sentencepiece: "0.2.0";
    readonly safetensors: "0.4.3";
    readonly numpy: "1.26.4";
    readonly node: "v20.19.6";
    readonly nodeTokenizers: "0.23.2";
  };
  readonly cache: { readonly relativePath: typeof CLASSIFIER_BASE_CACHE_RELATIVE_PATH; readonly ignored: true };
  readonly offlineReplay: { readonly configLoaded: true; readonly tokenizerLoaded: true; readonly networkRequiredAfterPinning: false; readonly status: "PASSED" };
  readonly boundaries: {
    readonly modelWeightsDownloaded: false;
    readonly classifierCheckpointProduced: false;
    readonly sthnDataAccessed: false;
    readonly sthnDataTokenized: false;
    readonly internalTestAccessed: false;
    readonly frozen140Accessed: false;
    readonly trainingPerformed: false;
    readonly weightsModified: false;
    readonly evaluationPerformed: false;
  };
  readonly generatedAt: string;
}

export interface ClassifierBaseAuthority extends ClassifierBaseAuthorityPayload { readonly authorityPayloadDigest: string }
export interface CreateClassifierBaseAuthorityOptions { readonly cacheDirectory: string; readonly outputDirectory: string; readonly resolvedAt: string; readonly generatedAt?: string; readonly publish?: (temporaryPath: string, targetPath: string) => void }

const sha256 = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const digest = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), "utf8"));
const strictTimestamp = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
const sourceUrl = (filename: ClassifierArtifactName): string => `https://huggingface.co/${CLASSIFIER_BASE_REPOSITORY}/resolve/${CLASSIFIER_BASE_REVISION}/${filename}`;

export const validateClassifierBaseAuthority = (authority: ClassifierBaseAuthority): void => {
  const { authorityPayloadDigest, ...payload } = authority;
  if (payload.schemaVersion !== CLASSIFIER_BASE_AUTHORITY_SCHEMA || payload.authorityVersion !== CLASSIFIER_BASE_AUTHORITY_VERSION
    || payload.phase !== "T6L-6A-X" || payload.authorizationDecision !== "AUTHORIZE_XLM_ROBERTA_BASE_CLASSIFIER_AUTHORITY_V1"
    || payload.purpose !== CLASSIFIER_BASE_PURPOSE || payload.source.repository !== CLASSIFIER_BASE_REPOSITORY
    || payload.source.revision !== CLASSIFIER_BASE_REVISION || ["main", "HEAD", "latest"].includes(payload.source.revision)
    || !/^[a-f0-9]{40}$/.test(payload.source.revision) || payload.source.revisionKind !== "IMMUTABLE_HUGGING_FACE_COMMIT"
    || payload.source.resolutionSource !== `https://huggingface.co/${CLASSIFIER_BASE_REPOSITORY}/commit/${CLASSIFIER_BASE_REVISION}`
    || !strictTimestamp(payload.source.resolvedAt) || payload.source.license !== "MIT" || !strictTimestamp(payload.generatedAt)) throw new Error("Invalid classifier source authority");
  const artifacts = new Map(payload.artifacts.map((artifact) => [artifact.filename, artifact]));
  if (artifacts.size !== Object.keys(CLASSIFIER_BASE_ARTIFACTS).length) throw new Error("Invalid classifier artifact set");
  for (const [filename, expected] of Object.entries(CLASSIFIER_BASE_ARTIFACTS) as [ClassifierArtifactName, { byteSize: number; sha256: string }][]) {
    const artifact = artifacts.get(filename);
    if (!artifact || artifact.sourceUrl !== sourceUrl(filename) || artifact.byteSize !== expected.byteSize || artifact.sha256 !== expected.sha256) throw new Error(`Invalid classifier artifact: ${filename}`);
  }
  const a = payload.architecture;
  if (a.configClass !== "XLMRobertaConfig" || a.upstreamArchitecture !== "XLMRobertaForMaskedLM"
    || a.futureClassifierArchitecture !== "XLMRobertaForSequenceClassification" || a.modelType !== "xlm-roberta"
    || a.hiddenSize !== 768 || a.numHiddenLayers !== 12 || a.numAttentionHeads !== 12 || a.intermediateSize !== 3072
    || a.vocabSize !== 250002 || a.maxPositionEmbeddings !== 514 || a.usableModelMaxLength !== 512 || a.typeVocabSize !== 1
    || a.layerNormEps !== 0.00001 || a.hiddenDropoutProbability !== 0.1 || a.attentionDropoutProbability !== 0.1
    || canonicalJson(a.configTokenIds) !== canonicalJson({bos:0,pad:1,eos:2})) throw new Error("Invalid XLM-R architecture authority");
  const t = payload.tokenizer;
  if (t.tokenizerClass !== "XLMRobertaTokenizerFast" || t.backend !== "HUGGING_FACE_TOKENIZERS_UNIGRAM_SENTENCEPIECE" || !t.fast
    || t.vocabularySize !== 250002 || t.modelMaxLength !== 512 || t.modelInputNames.join(",") !== "input_ids,attention_mask"
    || t.tokenTypeIdsRequired || t.defaultPaddingSide !== "right" || t.defaultTruncationSide !== "right"
    || t.artifactDefaultPadding !== null || t.artifactDefaultTruncation !== null
    || canonicalJson(t.specialTokens) !== canonicalJson(specialTokens())
    || canonicalJson(t.sequenceConstruction) !== canonicalJson({single:"<s> A </s>",pair:"<s> A </s> </s> B </s>",allTypeIds:0})) throw new Error("Invalid XLM-R tokenizer authority");
  if (canonicalJson(payload.futureClassifierTask) !== canonicalJson({task:"BINARY_ALLOW_BLOCK",numLabels:2,label2id:{ALLOW:0,BLOCK:1},id2label:{"0":"ALLOW","1":"BLOCK"},upstreamConfigMutated:false})) throw new Error("Invalid future classifier task");
  const separation = payload.semanticModelSeparation;
  if (separation.classifierRepository !== CLASSIFIER_BASE_REPOSITORY || separation.classifierRevision !== CLASSIFIER_BASE_REVISION
    || separation.semanticRepository !== E5_SMALL_MODEL_REPOSITORY || separation.semanticRevision !== E5_SMALL_MODEL_REVISION
    || !separation.authoritiesIndependent || !separation.tokenizerAuthoritiesIndependent || !separation.preprocessingContractsIndependent) throw new Error("Classifier and semantic authorities conflated");
  const tools = payload.toolchain;
  if (tools.isolation !== "UV_MANAGED_IGNORED_VENV" || tools.python !== "3.12.10" || tools.transformers !== "4.42.4"
    || tools.pythonTokenizers !== "0.19.1" || tools.huggingfaceHub !== "0.23.4" || tools.sentencepiece !== "0.2.0"
    || tools.safetensors !== "0.4.3" || tools.numpy !== "1.26.4" || tools.node !== "v20.19.6" || tools.nodeTokenizers !== "0.23.2"
    || payload.cache.relativePath !== CLASSIFIER_BASE_CACHE_RELATIVE_PATH || !payload.cache.ignored
    || payload.offlineReplay.status !== "PASSED" || !payload.offlineReplay.configLoaded || !payload.offlineReplay.tokenizerLoaded || payload.offlineReplay.networkRequiredAfterPinning
    || Object.values(payload.boundaries).some(Boolean) || authorityPayloadDigest !== digest(payload)) throw new Error("Invalid classifier authority boundary or digest");
};

export const readClassifierBaseAuthority = (authorityPath: string): ClassifierBaseAuthority => {
  const bytes = fs.readFileSync(authorityPath);
  if (sha256(bytes) !== CLASSIFIER_BASE_AUTHORITY_SHA256) throw new Error("Classifier authority artifact hash mismatch");
  const authority = JSON.parse(bytes.toString("utf8")) as ClassifierBaseAuthority;
  validateClassifierBaseAuthority(authority);
  if (authority.authorityPayloadDigest !== CLASSIFIER_BASE_AUTHORITY_PAYLOAD_DIGEST) throw new Error("Classifier authority payload digest mismatch");
  return authority;
};

const specialTokens = () => ({bos:{token:"<s>" as const,id:0 as const},cls:{token:"<s>" as const,id:0 as const},pad:{token:"<pad>" as const,id:1 as const},eos:{token:"</s>" as const,id:2 as const},sep:{token:"</s>" as const,id:2 as const},unk:{token:"<unk>" as const,id:3 as const},mask:{token:"<mask>" as const,id:250001 as const}});

export const createClassifierBaseAuthority = (options: CreateClassifierBaseAuthorityOptions) => {
  const artifacts = (Object.keys(CLASSIFIER_BASE_ARTIFACTS) as ClassifierArtifactName[]).sort().map((filename) => {
    const artifactPath = path.join(options.cacheDirectory, filename); const bytes = fs.readFileSync(artifactPath); const expected = CLASSIFIER_BASE_ARTIFACTS[filename];
    if (bytes.length !== expected.byteSize || sha256(bytes) !== expected.sha256) throw new Error(`Pinned classifier artifact mismatch: ${filename}`);
    return { filename, sourceUrl: sourceUrl(filename), byteSize: bytes.length, sha256: sha256(bytes) };
  });
  const config = JSON.parse(fs.readFileSync(path.join(options.cacheDirectory,"config.json"),"utf8"));
  const tokenizerJson = JSON.parse(fs.readFileSync(path.join(options.cacheDirectory,"tokenizer.json"),"utf8"));
  const tokenizerConfig = JSON.parse(fs.readFileSync(path.join(options.cacheDirectory,"tokenizer_config.json"),"utf8"));
  const tokenizer = Tokenizer.fromFile(path.join(options.cacheDirectory,"tokenizer.json"));
  if (config.model_type !== "xlm-roberta" || config.architectures?.[0] !== "XLMRobertaForMaskedLM" || config.vocab_size !== 250002
    || config.hidden_size !== 768 || config.num_hidden_layers !== 12 || config.num_attention_heads !== 12 || config.intermediate_size !== 3072
    || config.max_position_embeddings !== 514 || config.type_vocab_size !== 1 || config.layer_norm_eps !== 0.00001
    || config.hidden_dropout_prob !== 0.1 || config.attention_probs_dropout_prob !== 0.1
    || config.bos_token_id !== 0 || config.pad_token_id !== 1 || config.eos_token_id !== 2
    || tokenizerConfig.model_max_length !== 512 || tokenizer.getVocabSize(true) !== 250002 || tokenizerJson.model?.unk_id !== 3
    || tokenizerJson.model?.vocab?.length !== 250002
    || tokenizerJson.padding !== null || tokenizerJson.truncation !== null
    || canonicalJson(tokenizerJson.post_processor?.single) !== canonicalJson([{SpecialToken:{id:"<s>",type_id:0}},{Sequence:{id:"A",type_id:0}},{SpecialToken:{id:"</s>",type_id:0}}])
    || canonicalJson(tokenizerJson.post_processor?.pair) !== canonicalJson([{SpecialToken:{id:"<s>",type_id:0}},{Sequence:{id:"A",type_id:0}},{SpecialToken:{id:"</s>",type_id:0}},{SpecialToken:{id:"</s>",type_id:0}},{Sequence:{id:"B",type_id:0}},{SpecialToken:{id:"</s>",type_id:0}}])
    || tokenizer.tokenToId("<s>") !== 0 || tokenizer.tokenToId("<pad>") !== 1 || tokenizer.tokenToId("</s>") !== 2
    || tokenizer.tokenToId("<unk>") !== 3 || tokenizer.tokenToId("<mask>") !== 250001) throw new Error("Pinned classifier config/tokenizer inspection failed");
  const payload: ClassifierBaseAuthorityPayload = {
    schemaVersion:CLASSIFIER_BASE_AUTHORITY_SCHEMA,authorityVersion:CLASSIFIER_BASE_AUTHORITY_VERSION,phase:"T6L-6A-X",authorizationDecision:"AUTHORIZE_XLM_ROBERTA_BASE_CLASSIFIER_AUTHORITY_V1",purpose:CLASSIFIER_BASE_PURPOSE,
    source:{repository:CLASSIFIER_BASE_REPOSITORY,revision:CLASSIFIER_BASE_REVISION,revisionKind:"IMMUTABLE_HUGGING_FACE_COMMIT",resolutionSource:`https://huggingface.co/${CLASSIFIER_BASE_REPOSITORY}/commit/${CLASSIFIER_BASE_REVISION}`,resolvedAt:options.resolvedAt,license:"MIT"},artifacts,
    architecture:{configClass:"XLMRobertaConfig",upstreamArchitecture:"XLMRobertaForMaskedLM",futureClassifierArchitecture:"XLMRobertaForSequenceClassification",modelType:"xlm-roberta",hiddenSize:768,numHiddenLayers:12,numAttentionHeads:12,intermediateSize:3072,vocabSize:250002,maxPositionEmbeddings:514,usableModelMaxLength:512,typeVocabSize:1,layerNormEps:0.00001,hiddenDropoutProbability:0.1,attentionDropoutProbability:0.1,configTokenIds:{bos:0,pad:1,eos:2}},
    tokenizer:{tokenizerClass:"XLMRobertaTokenizerFast",backend:"HUGGING_FACE_TOKENIZERS_UNIGRAM_SENTENCEPIECE",fast:true,vocabularySize:250002,modelMaxLength:512,modelInputNames:["input_ids","attention_mask"],tokenTypeIdsRequired:false,defaultPaddingSide:"right",defaultTruncationSide:"right",artifactDefaultPadding:null,artifactDefaultTruncation:null,specialTokens:specialTokens(),sequenceConstruction:{single:"<s> A </s>",pair:"<s> A </s> </s> B </s>",allTypeIds:0}},
    futureClassifierTask:{task:"BINARY_ALLOW_BLOCK",numLabels:2,label2id:{ALLOW:0,BLOCK:1},id2label:{"0":"ALLOW","1":"BLOCK"},upstreamConfigMutated:false},
    semanticModelSeparation:{classifierRepository:CLASSIFIER_BASE_REPOSITORY,classifierRevision:CLASSIFIER_BASE_REVISION,semanticRepository:E5_SMALL_MODEL_REPOSITORY,semanticRevision:E5_SMALL_MODEL_REVISION,authoritiesIndependent:true,tokenizerAuthoritiesIndependent:true,preprocessingContractsIndependent:true},
    toolchain:{isolation:"UV_MANAGED_IGNORED_VENV",python:"3.12.10",transformers:"4.42.4",pythonTokenizers:"0.19.1",huggingfaceHub:"0.23.4",sentencepiece:"0.2.0",safetensors:"0.4.3",numpy:"1.26.4",node:"v20.19.6",nodeTokenizers:"0.23.2"},
    cache:{relativePath:CLASSIFIER_BASE_CACHE_RELATIVE_PATH,ignored:true},offlineReplay:{configLoaded:true,tokenizerLoaded:true,networkRequiredAfterPinning:false,status:"PASSED"},boundaries:{modelWeightsDownloaded:false,classifierCheckpointProduced:false,sthnDataAccessed:false,sthnDataTokenized:false,internalTestAccessed:false,frozen140Accessed:false,trainingPerformed:false,weightsModified:false,evaluationPerformed:false},generatedAt:options.generatedAt??new Date().toISOString(),
  };
  const authority: ClassifierBaseAuthority = {...payload,authorityPayloadDigest:digest(payload)}; validateClassifierBaseAuthority(authority);
  fs.mkdirSync(options.outputDirectory,{recursive:true}); const target=path.join(options.outputDirectory,CLASSIFIER_BASE_AUTHORITY_FILENAME); if(fs.existsSync(target))throw new Error("Classifier authority exists; overwrite refused");
  const temporary=`${target}.${process.pid}-${Date.now()}.partial`,text=canonicalJson(authority); try{fs.writeFileSync(temporary,text,{flag:"wx"});(options.publish??fs.renameSync)(temporary,target);if(!fs.existsSync(target))throw new Error("Classifier authority publication incomplete");}catch(error){fs.rmSync(target,{force:true});throw error;}finally{fs.rmSync(temporary,{force:true});}
  return {authorityPath:target,authoritySha256:sha256(Buffer.from(text,"utf8")),authority};
};
