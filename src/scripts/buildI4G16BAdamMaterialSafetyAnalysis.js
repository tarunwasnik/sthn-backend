const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const g16a = path.join(root, "evaluation-output", "image-moderation", "i4-g16a-adam-false-pass-materiality-review");
const ownerReviewPath = path.join(g16a, "owner-review.json");
const unionManifestPath = path.join(root, "evaluation-output", "image-moderation", "i4-adam-all-false-pass-owner-review", "adam-all-false-pass-manifest.json");
const devConfusionPath = path.join(root, "evaluation-output", "image-moderation", "i4-g10b-adamcodd-558-evaluation", "confusion-matrix.json");
const unseenReportPath = path.join(root, "evaluation-output", "image-moderation", "i4-g14c-adamcodd-consumed-unseen-v1-diagnostic", "aggregate-diagnostic-report.json");
const output = path.join(root, "evaluation-output", "image-moderation", "i4-g16b-adam-material-safety-analysis");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const json = value => JSON.stringify(value, null, 2) + "\n";
const pct = value => value * 100;
const material = new Set(["MATERIAL_BREAST_EXPOSURE_MISS", "MATERIAL_SUGGESTIVE_PRESENTATION_MISS", "MATERIAL_DIFFICULT_PORNOGRAPHY_MISS"]);
const allowed = new Set([...material, "CURRENT_POLICY_ACCEPTABLE_PASS"]);
const expectedTotals = { MATERIAL_BREAST_EXPOSURE_MISS: 5, MATERIAL_SUGGESTIVE_PRESENTATION_MISS: 5, MATERIAL_DIFFICULT_PORNOGRAPHY_MISS: 1, CURRENT_POLICY_ACCEPTABLE_PASS: 3 };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const counts = records => Object.fromEntries(Object.keys(expectedTotals).map(key => [key, records.filter(record => record.ownerMaterialityAssessment === key).length]));
const rel = file => path.relative(output, file).split(path.sep).join("/");

void (async () => {
  try { await fs.access(output); throw new Error(`Refusing to overwrite existing output directory: ${output}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const [ownerBytes, unionBytes, devBytes, unseenBytes] = await Promise.all([ownerReviewPath, unionManifestPath, devConfusionPath, unseenReportPath].map(file => fs.readFile(file)));
  const owner = JSON.parse(ownerBytes), union = JSON.parse(unionBytes), developmentConfusion = JSON.parse(devBytes), unseenReport = JSON.parse(unseenBytes);
  const unionIds = union.cards.map(card => card.candidateId).sort();
  const ownerIds = owner.records.map(record => record.candidateId).sort();
  const totals = counts(owner.records);
  const validation = {
    protocol: owner.reviewProtocol === "G16A_ADAM_FALSE_PASS_MATERIALITY_OWNER_REVIEW_V1",
    sourceReviewIdentity: owner.sourceReviewManifestIdentity === union.semanticFingerprint,
    recordCount: owner.records.length === 14,
    uniqueCandidateIds: new Set(owner.records.map(record => record.candidateId)).size === 14,
    exactKnownPopulation: equal(ownerIds, unionIds),
    corpusSplit: owner.records.filter(record => record.corpus === "DEVELOPMENT_558").length === 10 && owner.records.filter(record => record.corpus === "CONSUMED_UNSEEN_V1_325").length === 4,
    historicalDecisionPairs: owner.records.every(record => record.historicalHumanDecision === "BLOCK" && record.adamDecision === "PASS"),
    oneKnownAssessmentEach: owner.records.every(record => allowed.has(record.ownerMaterialityAssessment)),
    expectedTotals: equal(owner.expectedOwnerTotals, expectedTotals) && equal(owner.actualOwnerTotals, expectedTotals) && equal(totals, expectedTotals) && owner.totalsMatchExpected === true
  };
  if (Object.values(validation).some(value => !value)) throw new Error(`Owner review validation failed: ${JSON.stringify(validation)}`);
  const normalizedRecords = owner.records.map(record => ({ candidateId: record.candidateId, corpus: record.corpus, historicalHumanDecision: record.historicalHumanDecision, historicalClassifications: record.historicalClassifications, historicalCategories: record.historicalCategories, adamDecision: record.adamDecision, ownerMaterialityAssessment: record.ownerMaterialityAssessment, ownerNote: record.ownerNote || "", reviewTimestamp: record.reviewTimestamp }));
  const normalizedBase = { status: "G16B_NORMALIZED_OWNER_REVIEW_FROZEN", source: { path: rel(ownerReviewPath), sha256: sha(ownerBytes), reviewProtocol: owner.reviewProtocol, sourceReviewManifestIdentity: owner.sourceReviewManifestIdentity }, population: { total: 14, development558: 10, consumedUnseenV1325: 4 }, records: normalizedRecords };
  const normalized = { ...normalizedBase, semanticFingerprint: sha(JSON.stringify(normalizedBase)) };
  const dev = developmentConfusion.confusion || ("humanPassModelPass" in developmentConfusion ? { PP: developmentConfusion.humanPassModelPass, PB: developmentConfusion.humanPassModelBlock, BP: developmentConfusion.humanBlockModelPass, BB: developmentConfusion.humanBlockModelBlock } : developmentConfusion);
  const unseen = unseenReport.confusion;
  if (![dev, unseen].every(confusion => Number.isInteger(confusion.PP) && Number.isInteger(confusion.PB) && Number.isInteger(confusion.BP) && Number.isInteger(confusion.BB)) || dev.BP !== 10 || dev.BB !== 288 || unseen.BP !== 4 || unseen.BB !== 165) throw new Error("Frozen historical confusion authorities do not match the established Adam evaluations");
  const corpusAnalysis = Object.fromEntries([["DEVELOPMENT_558", dev], ["CONSUMED_UNSEEN_V1_325", unseen]].map(([corpus, confusion]) => {
    const reviewed = normalizedRecords.filter(record => record.corpus === corpus);
    const materialMisses = reviewed.filter(record => material.has(record.ownerMaterialityAssessment));
    const acceptable = reviewed.filter(record => record.ownerMaterialityAssessment === "CURRENT_POLICY_ACCEPTABLE_PASS");
    const historicalBlockSupport = confusion.BP + confusion.BB;
    return [corpus, { totalImages: confusion.PP + confusion.PB + confusion.BP + confusion.BB, historicalBlockSupport, historicalAdamBlock: confusion.BB, historicalAdamFalsePass: confusion.BP, historicalBlockRecall: confusion.BB / historicalBlockSupport, historicalPassSpecificity: confusion.PP / (confusion.PP + confusion.PB), currentPolicyAcceptableHistoricalFalsePasses: acceptable.length, materialSafetyMisses: materialMisses.length, materialMissRateOverHistoricalBlockSupport: materialMisses.length / historicalBlockSupport, descriptiveEffectiveNonMaterialMissRateOverHistoricalBlockSupport: (confusion.BB + acceptable.length) / historicalBlockSupport, materialMissCandidateIds: materialMisses.map(record => record.candidateId), acceptablePassCandidateIds: acceptable.map(record => record.candidateId) }];
  }));
  const historicalBlockSupport = dev.BB + dev.BP + unseen.BB + unseen.BP;
  const historicalAdamBlock = dev.BB + unseen.BB;
  const historicalFalsePass = dev.BP + unseen.BP;
  const acceptable = normalizedRecords.filter(record => record.ownerMaterialityAssessment === "CURRENT_POLICY_ACCEPTABLE_PASS");
  const materialRecords = normalizedRecords.filter(record => material.has(record.ownerMaterialityAssessment));
  const profile = Object.fromEntries([...material, "CURRENT_POLICY_ACCEPTABLE_PASS"].map(assessment => { const rows = normalizedRecords.filter(record => record.ownerMaterialityAssessment === assessment); return [assessment, { count: rows.length, percentageOfElevenMaterialMisses: material.has(assessment) ? rows.length / materialRecords.length : null, candidateIdsByCorpus: Object.fromEntries(["DEVELOPMENT_558", "CONSUMED_UNSEEN_V1_325"].map(corpus => [corpus, rows.filter(record => record.corpus === corpus).map(record => record.candidateId)])) }]; }));
  const historicalPassSupport = dev.PP + dev.PB + unseen.PP + unseen.PB;
  const summary = { status: "G16B_ADAM_MATERIAL_SAFETY_ANALYSIS_COMPLETE", historicalBenchmarkView: { combinedImages: dev.PP + dev.PB + dev.BP + dev.BB + unseen.PP + unseen.PB + unseen.BP + unseen.BB, historicalBlockSupport, historicalAdamBlock, historicalAdamFalsePass: historicalFalsePass, historicalBlockRecall: historicalAdamBlock / historicalBlockSupport, historicalBlockRecallPercent: pct(historicalAdamBlock / historicalBlockSupport), historicalPassSupport, historicalAdamPass: dev.PP + unseen.PP, historicalAdamFalseBlock: dev.PB + unseen.PB, historicalPassSpecificity: (dev.PP + unseen.PP) / historicalPassSupport, historicalPassSpecificityPercent: pct((dev.PP + unseen.PP) / historicalPassSupport) }, currentOwnerMaterialityView: { denominatorSemantics: "The denominator remains all 467 historical Human/Owner BLOCK records. This is a separate owner current-policy diagnostic; it does not rewrite historical ground truth or the frozen confusion matrix.", historicalBlockRecordsExamined: historicalBlockSupport, historicalAdamBlocks: historicalAdamBlock, historicalAdamPasses: historicalFalsePass, currentPolicyAcceptableHistoricalFalsePasses: acceptable.length, materialSafetyMisses: materialRecords.length, materialMissRateOverHistoricalBlockPopulation: materialRecords.length / historicalBlockSupport, materialMissRatePercent: pct(materialRecords.length / historicalBlockSupport), descriptiveEffectiveNonMaterialMissCount: historicalAdamBlock + acceptable.length, descriptiveEffectiveNonMaterialMissRateOverHistoricalBlockPopulation: (historicalAdamBlock + acceptable.length) / historicalBlockSupport, descriptiveEffectiveNonMaterialMissRatePercent: pct((historicalAdamBlock + acceptable.length) / historicalBlockSupport) }, disposition: "ADAM_PRIMARY_BLOCK_GATE_SUPPORTED_WITH_TARGETED_BLIND_SPOTS", dispositionRationale: "Historical BLOCK recall is strong across both frozen corpora, and the owner materiality audit reduces the residual material misses to 11 of 467 historical BLOCK records. The residual misses are concentrated in breast/exposure and suggestive-presentation cases, plus one difficult pornography edge case; these are targeted blind spots that must remain explicit. This is an evidence role assessment only and does not authorize production integration.", scope: { modelInferenceRun: false, otherModelRun: false, thresholdTuning: false, training: false, calibration: false, historicalLabelsModified: false, historicalAdamResultsModified: false } };
  const protocolBase = { status: summary.status, phase: "G16-B", ownerReviewValidation: validation, sourceAuthorities: { ownerReview: { path: rel(ownerReviewPath), sha256: sha(ownerBytes) }, combinedFalsePassManifest: { path: rel(unionManifestPath), sha256: sha(unionBytes), semanticFingerprint: union.semanticFingerprint }, developmentConfusion: { path: rel(devConfusionPath), sha256: sha(devBytes) }, consumedUnseenAggregate: { path: rel(unseenReportPath), sha256: sha(unseenBytes) } }, analysisScope: summary.scope, noHistoricalGroundTruthRewrite: true };
  const protocol = { ...protocolBase, semanticFingerprint: sha(JSON.stringify(protocolBase)) };
  const failureProfile = { status: summary.status, profile, materialMissCandidateIds: materialRecords.map(record => ({ candidateId: record.candidateId, corpus: record.corpus, failureType: record.ownerMaterialityAssessment })), currentPolicyAcceptableCandidateIds: acceptable.map(record => ({ candidateId: record.candidateId, corpus: record.corpus })) };
  await fs.mkdir(output, { recursive: true });
  await Promise.all([["analysis-protocol.json", protocol], ["normalized-owner-review.json", normalized], ["material-safety-summary.json", summary], ["corpus-specific-analysis.json", { status: summary.status, corpora: corpusAnalysis }], ["material-failure-profile.json", failureProfile], ["final-report.json", { status: summary.status, ownerReviewValidation: validation, ownerReviewSha256: sha(ownerBytes), normalizedOwnerReviewSemanticFingerprint: normalized.semanticFingerprint, summary, corpusSpecificAnalysis: corpusAnalysis, materialFailureProfile: failureProfile }]].map(([name, value]) => fs.writeFile(path.join(output, name), json(value), { flag: "wx" })));
  const artifactNames = ["analysis-protocol.json", "normalized-owner-review.json", "material-safety-summary.json", "corpus-specific-analysis.json", "material-failure-profile.json", "final-report.json"];
  const artifactBase = { status: summary.status, sourceAuthorities: protocol.sourceAuthorities, generatedArtifacts: Object.fromEntries(await Promise.all(artifactNames.map(async name => [name, { sha256: sha(await fs.readFile(path.join(output, name))) }]))), scope: summary.scope };
  await fs.writeFile(path.join(output, "artifact-manifest.json"), json({ ...artifactBase, semanticFingerprint: sha(JSON.stringify(artifactBase)) }), { flag: "wx" });
  const allNames = [...artifactNames, "artifact-manifest.json"];
  console.log(JSON.stringify({ status: summary.status, ownerReviewValidation: validation, ownerReviewSha256: sha(ownerBytes), normalizedSemanticFingerprint: normalized.semanticFingerprint, summary: summary.currentOwnerMaterialityView, disposition: summary.disposition, artifactHashes: Object.fromEntries(await Promise.all(allNames.map(async name => [name, sha(await fs.readFile(path.join(output, name)))]))) }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
