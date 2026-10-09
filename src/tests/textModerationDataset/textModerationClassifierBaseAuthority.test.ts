import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CLASSIFIER_BASE_ARTIFACTS,
  CLASSIFIER_BASE_AUTHORITY_FILENAME,
  CLASSIFIER_BASE_AUTHORITY_PAYLOAD_DIGEST,
  CLASSIFIER_BASE_AUTHORITY_SCHEMA,
  CLASSIFIER_BASE_AUTHORITY_SHA256,
  CLASSIFIER_BASE_AUTHORITY_VERSION,
  CLASSIFIER_BASE_CACHE_RELATIVE_PATH,
  CLASSIFIER_BASE_REPOSITORY,
  CLASSIFIER_BASE_REVISION,
  createClassifierBaseAuthority,
  readClassifierBaseAuthority,
  validateClassifierBaseAuthority,
} from "../../research/textModerationDataset/classifierBaseModelAuthority";
import {
  E5_SMALL_MODEL_REPOSITORY,
  E5_SMALL_MODEL_REVISION,
} from "../../research/textModerationDataset/semanticSimilarity/e5SmallExportContract";

const sha256 = (value: Buffer | string): string => crypto.createHash("sha256").update(value).digest("hex");
const backend = process.cwd();
const cacheDirectory = path.resolve(backend, CLASSIFIER_BASE_CACHE_RELATIVE_PATH);
const authorityPath = path.resolve(backend, "dataset-research", "text-moderation", "model-authority", CLASSIFIER_BASE_AUTHORITY_FILENAME);
const authority = readClassifierBaseAuthority(authorityPath);

test("6A-X published authority is exact and canonical", async (t) => {
  await t.test("pins the authority file SHA-256", () => assert.equal(sha256(fs.readFileSync(authorityPath)), CLASSIFIER_BASE_AUTHORITY_SHA256));
  await t.test("pins the canonical payload digest", () => assert.equal(authority.authorityPayloadDigest, CLASSIFIER_BASE_AUTHORITY_PAYLOAD_DIGEST));
  await t.test("uses the bounded schema", () => assert.equal(authority.schemaVersion, CLASSIFIER_BASE_AUTHORITY_SCHEMA));
  await t.test("uses the versioned classifier authority", () => assert.equal(authority.authorityVersion, CLASSIFIER_BASE_AUTHORITY_VERSION));
  await t.test("records the 6A-X authorization decision", () => assert.equal(authority.authorizationDecision, "AUTHORIZE_XLM_ROBERTA_BASE_CLASSIFIER_AUTHORITY_V1"));
  await t.test("passes the full authority validator", () => assert.doesNotThrow(() => validateClassifierBaseAuthority(authority)));
});

test("6A-X pins the selected classifier source and only its minimal metadata", async (t) => {
  await t.test("pins FacebookAI/xlm-roberta-base", () => assert.equal(authority.source.repository, CLASSIFIER_BASE_REPOSITORY));
  await t.test("pins an exact forty-character commit", () => assert.match(authority.source.revision, /^[a-f0-9]{40}$/));
  await t.test("never uses a moving revision", () => assert.doesNotMatch(authority.source.revision, /^(main|HEAD|latest)$/));
  await t.test("pins the expected immutable revision", () => assert.equal(authority.source.revision, CLASSIFIER_BASE_REVISION));
  await t.test("records the commit resolution URL", () => assert.equal(authority.source.resolutionSource, `https://huggingface.co/${CLASSIFIER_BASE_REPOSITORY}/commit/${CLASSIFIER_BASE_REVISION}`));
  await t.test("records the MIT upstream license", () => assert.equal(authority.source.license, "MIT"));
  await t.test("uses a revision-addressed ignored cache", () => { assert.equal(authority.cache.relativePath, CLASSIFIER_BASE_CACHE_RELATIVE_PATH); assert.equal(authority.cache.ignored, true); });
  await t.test("contains exactly the four authorized source artifacts", () => assert.deepEqual(authority.artifacts.map(({ filename }) => filename), Object.keys(CLASSIFIER_BASE_ARTIFACTS).sort()));
  for (const [filename, expected] of Object.entries(CLASSIFIER_BASE_ARTIFACTS)) {
    await t.test(`${filename} bytes and hash match`, () => {
      const bytes = fs.readFileSync(path.join(cacheDirectory, filename));
      assert.equal(bytes.length, expected.byteSize);
      assert.equal(sha256(bytes), expected.sha256);
    });
  }
  await t.test("6A-X authority remains minimal after later authorized weight acquisition", () => {
    const files = fs.readdirSync(cacheDirectory, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
    assert.deepEqual(files.sort(), [...Object.keys(CLASSIFIER_BASE_ARTIFACTS),"model.safetensors"].sort());
    assert.deepEqual(authority.artifacts.map((item)=>item.filename).sort(),Object.keys(CLASSIFIER_BASE_ARTIFACTS).sort());
  });
});

test("6A-X freezes architecture, tokenizer, and future label authority", async (t) => {
  const { architecture: model, tokenizer, futureClassifierTask: task } = authority;
  await t.test("identifies XLM-R configuration", () => assert.deepEqual([model.configClass, model.modelType], ["XLMRobertaConfig", "xlm-roberta"]));
  await t.test("preserves the upstream masked-LM identity", () => assert.equal(model.upstreamArchitecture, "XLMRobertaForMaskedLM"));
  await t.test("authorizes the future sequence-classification architecture", () => assert.equal(model.futureClassifierArchitecture, "XLMRobertaForSequenceClassification"));
  await t.test("pins the core layer dimensions", () => assert.deepEqual([model.hiddenSize, model.numHiddenLayers, model.numAttentionHeads, model.intermediateSize], [768, 12, 12, 3072]));
  await t.test("pins vocabulary and position limits", () => assert.deepEqual([model.vocabSize, model.maxPositionEmbeddings, model.usableModelMaxLength], [250002, 514, 512]));
  await t.test("pins dropout and normalization values", () => assert.deepEqual([model.layerNormEps, model.hiddenDropoutProbability, model.attentionDropoutProbability], [0.00001, 0.1, 0.1]));
  await t.test("pins config BOS, PAD, and EOS IDs", () => assert.deepEqual(model.configTokenIds, { bos:0, pad:1, eos:2 }));
  await t.test("pins the fast SentencePiece-backed tokenizer", () => assert.deepEqual([tokenizer.tokenizerClass, tokenizer.backend, tokenizer.fast], ["XLMRobertaTokenizerFast", "HUGGING_FACE_TOKENIZERS_UNIGRAM_SENTENCEPIECE", true]));
  await t.test("pins tokenizer vocabulary and maximum length", () => assert.deepEqual([tokenizer.vocabularySize, tokenizer.modelMaxLength], [250002, 512]));
  await t.test("requires only input IDs and attention mask", () => { assert.deepEqual(tokenizer.modelInputNames, ["input_ids", "attention_mask"]); assert.equal(tokenizer.tokenTypeIdsRequired, false); });
  await t.test("pins right-side runtime defaults without inventing artifact defaults", () => assert.deepEqual([tokenizer.defaultPaddingSide, tokenizer.defaultTruncationSide, tokenizer.artifactDefaultPadding, tokenizer.artifactDefaultTruncation], ["right", "right", null, null]));
  await t.test("pins every special-token identity", () => assert.deepEqual(tokenizer.specialTokens, { bos:{token:"<s>",id:0}, cls:{token:"<s>",id:0}, pad:{token:"<pad>",id:1}, eos:{token:"</s>",id:2}, sep:{token:"</s>",id:2}, unk:{token:"<unk>",id:3}, mask:{token:"<mask>",id:250001} }));
  await t.test("pins single and pair BOS/EOS construction", () => assert.deepEqual(tokenizer.sequenceConstruction, { single:"<s> A </s>", pair:"<s> A </s> </s> B </s>", allTypeIds:0 }));
  await t.test("freezes binary ALLOW/BLOCK label authority without mutating upstream config", () => assert.deepEqual(task, { task:"BINARY_ALLOW_BLOCK", numLabels:2, label2id:{ALLOW:0,BLOCK:1}, id2label:{"0":"ALLOW","1":"BLOCK"}, upstreamConfigMutated:false }));
});

test("6A-X keeps classifier and semantic-model authorities independent", async (t) => {
  const separation = authority.semanticModelSeparation;
  await t.test("names the separate classifier authority", () => assert.deepEqual([separation.classifierRepository, separation.classifierRevision], [CLASSIFIER_BASE_REPOSITORY, CLASSIFIER_BASE_REVISION]));
  await t.test("names the existing E5 semantic authority", () => assert.deepEqual([separation.semanticRepository, separation.semanticRevision], [E5_SMALL_MODEL_REPOSITORY, E5_SMALL_MODEL_REVISION]));
  await t.test("the repositories and revisions are distinct", () => { assert.notEqual(CLASSIFIER_BASE_REPOSITORY, E5_SMALL_MODEL_REPOSITORY); assert.notEqual(CLASSIFIER_BASE_REVISION, E5_SMALL_MODEL_REVISION); });
  await t.test("the three separation gates are closed", () => assert.deepEqual([separation.authoritiesIndependent, separation.tokenizerAuthoritiesIndependent, separation.preprocessingContractsIndependent], [true, true, true]));
  await t.test("the existing E5 export authority remains byte-identical", () => {
    const e5Authority = path.resolve(backend,"evaluation-cache","text-moderation","semantic","intfloat-multilingual-e5-small",E5_SMALL_MODEL_REVISION,"STHN_E5_SMALL_ONNX_EXPORT_MANIFEST.json");
    assert.equal(sha256(fs.readFileSync(e5Authority)), "af28451d28ca3de53d914988536a2ad97ff13b1b03766dd1bfe798ec7671ae12");
  });
  await t.test("rejects E5 revision substitution", () => { const changed: any = structuredClone(authority); changed.source.revision = E5_SMALL_MODEL_REVISION; assert.throws(() => validateClassifierBaseAuthority(changed), /source authority/); });
});

test("6A-X publication is deterministic, immutable, and fail closed", async (t) => {
  const generatedAt = "2026-09-13T12:52:37.981Z";
  const resolvedAt = "2026-09-13T12:45:14.776Z";
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sthn-t6l-6a-x-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  await t.test("same inputs produce identical authority bytes", () => {
    const first = createClassifierBaseAuthority({ cacheDirectory, outputDirectory:path.join(temporaryRoot,"first"), generatedAt, resolvedAt });
    const second = createClassifierBaseAuthority({ cacheDirectory, outputDirectory:path.join(temporaryRoot,"second"), generatedAt, resolvedAt });
    assert.deepEqual(fs.readFileSync(first.authorityPath), fs.readFileSync(second.authorityPath));
  });
  await t.test("refuses an existing authority instead of overwriting", () => {
    const outputDirectory = path.join(temporaryRoot,"overwrite");
    createClassifierBaseAuthority({ cacheDirectory, outputDirectory, generatedAt, resolvedAt });
    assert.throws(() => createClassifierBaseAuthority({ cacheDirectory, outputDirectory, generatedAt, resolvedAt }), /overwrite refused/);
  });
  await t.test("rolls back a failed publication", () => {
    const outputDirectory = path.join(temporaryRoot,"rollback");
    assert.throws(() => createClassifierBaseAuthority({ cacheDirectory, outputDirectory, generatedAt, resolvedAt, publish:() => { throw new Error("injected publication failure"); } }), /injected publication failure/);
    assert.equal(fs.existsSync(path.join(outputDirectory, CLASSIFIER_BASE_AUTHORITY_FILENAME)), false);
    assert.equal(fs.readdirSync(outputDirectory).some((name) => name.endsWith(".partial")), false);
  });
  await t.test("fails closed on authority-file tampering", () => {
    const tampered = path.join(temporaryRoot,"tampered.json");
    const bytes = fs.readFileSync(authorityPath); bytes[bytes.length - 2] ^= 1; fs.writeFileSync(tampered, bytes);
    assert.throws(() => readClassifierBaseAuthority(tampered), /artifact hash mismatch/);
  });
});

test("6A-X boundaries prohibit data access, tokenization, training, and evaluation", async (t) => {
  await t.test("all recorded boundary actions are false", () => assert.equal(Object.values(authority.boundaries).some(Boolean), false));
  await t.test("offline replay needs no network after pinning", () => assert.deepEqual(authority.offlineReplay, { configLoaded:true, tokenizerLoaded:true, networkRequiredAfterPinning:false, status:"PASSED" }));
  await t.test("implementation has no dataset or protected-fixture dependency", () => {
    const files = ["src/research/textModerationDataset/classifierBaseModelAuthority.ts", "src/scripts/createClassifierBaseModelAuthority.ts"];
    const source = files.map((file) => fs.readFileSync(path.resolve(backend,file),"utf8")).join("\n");
    assert.doesNotMatch(source, /from\s+["'][^"']*(mhsMaterialized|developmentProjection|internalTest|frozen140|textModerationFixtures|evaluationFixtures)/i);
  });
  await t.test("implementation contains no training or inference operation", () => {
    const source = fs.readFileSync(path.resolve(backend,"src/research/textModerationDataset/classifierBaseModelAuthority.ts"),"utf8");
    assert.doesNotMatch(source, /optimizer|backward\s*\(|fit\s*\(|train\s*\(|predict\s*\(|inferenceSession/i);
  });
  await t.test("cache has no persistent tokenized corpus artifact", () => {
    const names = fs.readdirSync(cacheDirectory, { withFileTypes:true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
    assert.equal(names.some((name) => /input_ids|attention_mask|tokenized|dataset|corpus/i.test(name)), false);
  });
});
