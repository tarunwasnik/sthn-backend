import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd(), "evaluation-cache", "image-moderation", "owen-elliott-image-safety-classifier-xs");
const e4 = path.join(root, "e4o-first-head-seed-104729");
const out = path.join(root, "e5o-preregistration.json");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type ErrorRow = { candidateId: string; humanDecision: "PASS" | "BLOCK"; predictedDecision: "PASS" | "BLOCK"; classification: string[]; categories: string[]; contexts: string[]; split: "VALIDATION" };
const count = (rows: Array<ErrorRow & { groups: string[] }>, field: "classification" | "categories" | "contexts" | "groups") => Object.fromEntries([...new Set(rows.flatMap((row) => row[field]))].sort().map((value) => [value, rows.filter((row) => row[field].includes(value)).length]));

(async () => {
  const [metadata, errors, split, inventory] = await Promise.all([
    readFile(path.join(e4, "run-metadata.json"), "utf8").then(JSON.parse),
    readFile(path.join(e4, "validation-errors.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "e3o-development-split.json"), "utf8").then(JSON.parse),
    readFile(path.resolve(process.cwd(), "evaluation-cache", "image-moderation", "benchmark", "inventory-manifest.json"), "utf8").then(JSON.parse),
  ]);
  if (metadata.runId !== "i4-e4o-first-binary-head-seed-104729" || metadata.bestHeadSha256 !== "f3881a4e1a854c2c8db467b32f50ca0764e60fed36bec0e673302789652bb60a") throw new Error("Frozen E4O baseline identity mismatch");
  if (split.splitFingerprint !== "de209dc412f3272c06eaecd2314d882f45c7c3fdfddb1e70a48e68f1bdaa98d2") throw new Error("Frozen E3O split mismatch");
  const groups = new Map<string, string[]>(inventory.candidates.map((candidate: { id: string; source: { occurrences?: Array<{ collectionGroup: string }> } }) => [candidate.id, [...new Set((candidate.source.occurrences ?? []).map((occurrence) => occurrence.collectionGroup))].sort()]));
  const rows = (errors.errors as ErrorRow[]).map((row) => ({ ...row, groups: groups.get(row.candidateId) ?? [] }));
  if (rows.length !== 14 || rows.filter((row) => row.humanDecision === "PASS" && row.predictedDecision === "BLOCK").length !== 8 || rows.filter((row) => row.humanDecision === "BLOCK" && row.predictedDecision === "PASS").length !== 6) throw new Error("Frozen E4O error population mismatch");
  const breakdown = (rowsForType: typeof rows) => ({ classification: count(rowsForType, "classification"), category: count(rowsForType, "categories"), context: count(rowsForType, "contexts"), acquisitionGroup: count(rowsForType, "groups") });
  const fp = rows.filter((row) => row.humanDecision === "PASS"); const fn = rows.filter((row) => row.humanDecision === "BLOCK");
  const payload = {
    schemaVersion: "STHN_I4_E5O_PREREGISTRATION_V1",
    phase: "I4-E5O",
    status: "PRE_REGISTERED_NO_TRAINING",
    e4Baseline: { runId: metadata.runId, bestEpoch: metadata.bestEpoch, stoppingEpoch: metadata.stoppingEpoch, bestHeadSha256: metadata.bestHeadSha256, finalHeadSha256: metadata.finalHeadSha256, validation: metadata.bestValidation },
    authorities: { candidateFingerprint: metadata.authorities.candidateFingerprint, fixtureIdentity: metadata.authorities.fixtureIdentity, splitFingerprint: split.splitFingerprint },
    errorAnalysis: { total: rows.length, falsePositives: { count: fp.length, ...breakdown(fp) }, falseNegatives: { count: fn.length, ...breakdown(fn) }, overlap: { SWIMWEAR_PASS: rows.filter((row) => row.classification.includes("SWIMWEAR_PASS")).length, BEACH_PASS: rows.filter((row) => row.classification.includes("BEACH_PASS")).length, FASHION_PASS: rows.filter((row) => row.classification.includes("FASHION_PASS")).length, FITNESS_PASS: rows.filter((row) => row.classification.includes("FITNESS_PASS")).length, ORDINARY_PORTRAIT_PASS: rows.filter((row) => row.classification.includes("ORDINARY_PORTRAIT_PASS")).length, SUGGESTIVE_BLOCK: rows.filter((row) => row.classification.includes("SUGGESTIVE_BLOCK")).length, NUDITY_BLOCK: rows.filter((row) => row.classification.includes("NUDITY_BLOCK")).length } },
    representationAssessment: { featureDimension: 220, linearCapacityConclusion: "NOT_PROVEN_BY_DEVELOPMENT_ERRORS_ALONE", evidence: "E4O retained useful signal but made both legitimate-boundary false positives and suggestive/nudity false negatives. This supports testing head capacity without claiming the linear separator is the demonstrated cause.", nonlinearHeadTechnicallyCompatible: true },
    proposedModel: { backbone: "swiftformer_xs", backboneFrozen: true, featurePath: ["model.forward_features(x)", "model.forward_head(features, pre_logits=True)"], architecture: ["Linear(220,64)", "ReLU", "Dropout(0.20)", "Linear(64,2)"], classMapping: { PASS: 0, BLOCK: 1 }, trainableParameters: 14274 },
    training: { seed: 104729, train: { total: 446, PASS: 208, BLOCK: 238 }, validation: { total: 112, PASS: 52, BLOCK: 60 }, preprocessing: metadata.preprocessing, augmentation: metadata.augmentation, optimizer: "AdamW", learningRate: 0.001, weightDecay: 0.0001, batchSize: 32, loss: "CrossEntropyLoss", classWeighting: "NONE", maxEpochs: 50, earlyStoppingPatience: 8, selectionMetric: "validationBalancedAccuracy", tieBreaker: ["validationBlockRecall", "lowerValidationLoss"], decision: "ARGMAX" },
    evaluation: { comparators: ["ORIGINAL_OWEN", "E4O_LINEAR_HEAD", "E5O_NONLINEAR_HEAD"], metrics: ["accuracy", "balancedAccuracy", "macroF1", "passPrecision", "passRecall", "passF1", "blockPrecision", "blockRecall", "blockF1", "confusionMatrix", "falsePositives", "falseNegatives"], slices: ["classification", "category", "historicalOwenDisagreements"] },
    interpretationRules: ["Report FP and FN changes together.", "Report whether BLOCK recall and legitimate PASS recall are preserved.", "Report SWIMWEAR_PASS, SUGGESTIVE_BLOCK, NUDITY_BLOCK, EXPLICIT_SEXUAL_BLOCK, and PORNOGRAPHY_BLOCK changes where support exists.", "Do not claim final generalization from this development validation split."],
    prohibitions: { holdoutAccess: false, thresholdOptimization: false, backboneUnfreezing: false, hyperparameterSweep: false, multipleSeeds: false, dataMutation: false, trainingPerformed: false, checkpointCreated: false, productionMutation: false },
  };
  await writeFile(out, `${JSON.stringify({ ...payload, preRegistrationSha256: hash(payload) }, null, 2)}\n`);
  console.log(JSON.stringify({ out: path.basename(out), preRegistrationSha256: hash(payload), errors: rows.length }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
