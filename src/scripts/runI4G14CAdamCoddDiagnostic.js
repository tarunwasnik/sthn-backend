require("ts-node/register");
const { createHash } = require("node:crypto");
const { mkdir, readFile, writeFile, access, constants } = require("node:fs/promises");
const path = require("node:path");
const ort = require("onnxruntime-node");
const { ADAMCODD_RUNTIME_AUTHORITY, preprocessAdamCodd, interpretAdamCoddLogits, validateAdamCoddTensorContract } = require("../evaluation/imageModeration/adamCoddRuntimeAuthority");

const root = process.cwd();
const phase = "i4-g14c-adamcodd-consumed-unseen-v1-diagnostic";
const out = path.join(root, "evaluation-output", "image-moderation", phase);
const cache = path.join(root, "evaluation-cache", "image-moderation", "unseen-test-v1");
const f3Path = path.join(cache, "frozen-unseen-corpus.json");
const modelPath = path.join(root, "evaluation-cache", "image-moderation", "adamcodd-vit-base-nsfw-detector", ADAMCODD_RUNTIME_AUTHORITY.revision, ADAMCODD_RUNTIME_AUTHORITY.artifactPath);
const preregPath = path.join(out, "preregistration.json");
const mappingPath = path.join(out, "candidate-image-mapping-authority.json");
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value);
const once = (name, value) => writeFile(path.join(out, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const outputNames = ["candidate-results.json", "disagreement-inventory.json", "aggregate-diagnostic-report.json", "g14c-adamcodd-325-human-model-review.html", "visual-review-manifest.json"];
const decision = native => native === "sfw" ? "PASS" : native === "nsfw" ? "BLOCK" : (() => { throw new Error("Unexpected native AdamCodd class"); })();
const comparison = (human, model) => `HUMAN_${human}_MODEL_${model}`;
const metric = (numerator, denominator) => denominator ? numerator / denominator : null;
const sortObject = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));

async function noExistingOutputs() {
  for (const name of outputNames) {
    try { await access(path.join(out, name), constants.F_OK); throw new Error(`Refusing to overwrite existing ${name}`); }
    catch (error) { if (error instanceof Error && error.message.startsWith("Refusing")) throw error; }
  }
}
function breakdown(rows, field) {
  const values = [...new Set(rows.flatMap(row => row[field]))].sort();
  return Object.fromEntries(values.map(value => {
    const subset = rows.filter(row => row[field].includes(value));
    const counts = confusion(subset);
    return [value, { candidates: subset.length, humanPass: subset.filter(r => r.humanDecision === "PASS").length, humanBlock: subset.filter(r => r.humanDecision === "BLOCK").length, adamPass: subset.filter(r => r.evaluationDecision === "PASS").length, adamBlock: subset.filter(r => r.evaluationDecision === "BLOCK").length, ...counts }];
  }));
}
function confusion(rows) {
  const PP = rows.filter(r => r.humanDecision === "PASS" && r.evaluationDecision === "PASS").length;
  const PB = rows.filter(r => r.humanDecision === "PASS" && r.evaluationDecision === "BLOCK").length;
  const BP = rows.filter(r => r.humanDecision === "BLOCK" && r.evaluationDecision === "PASS").length;
  const BB = rows.filter(r => r.humanDecision === "BLOCK" && r.evaluationDecision === "BLOCK").length;
  return { PP, PB, BP, BB };
}
function htmlPage(cards, summary) {
  const data = JSON.stringify(cards).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>G14-C AdamCodd consumed unseen-V1 diagnostic</title><style>body{font:14px system-ui;margin:0;background:#f3f5f7;color:#17212b}header{position:sticky;top:0;z-index:2;background:#fff;padding:16px;box-shadow:0 1px 7px #0003}.bad{color:#9b2020;font-weight:700}.chips{display:flex;gap:6px;flex-wrap:wrap}.chips span{background:#e8edf2;padding:4px 7px;border-radius:5px}button,input,select{margin:3px;padding:7px;border:1px solid #aab7c4;border-radius:5px;background:#fff}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:13px;padding:16px}.card{background:#fff;border:1px solid #d5dde5;border-radius:8px;overflow:hidden}.card img{display:block;width:100%;height:320px;object-fit:contain;background:#16191d}.body{padding:10px}.match{border-left:5px solid #338353}.dis{border-left:5px solid #d18400}.pass{color:#186c37;font-weight:700}.block{color:#a02121;font-weight:700}.small{font-size:12px;color:#586674}</style><header><h1>G14-C — AdamCodd Consumed Unseen-V1 Retrospective Diagnostic</h1><p class="bad">325 IMAGES · CONSUMED CORPUS · NOT CLEAN UNSEEN VALIDATION · ORIGINAL FROZEN V1 HUMAN REVIEW · G3 V2 DECISIONS NOT USED · FROZEN ADAMCODD NATIVE ARGMAX DECISION</p><div class="chips"><span>Human PASS ${summary.humanPass}</span><span>Human BLOCK ${summary.humanBlock}</span><span>Adam PASS ${summary.adamPass}</span><span>Adam BLOCK ${summary.adamBlock}</span><span>PASS/PASS ${summary.PP}</span><span>PASS/BLOCK ${summary.PB}</span><span>BLOCK/PASS ${summary.BP}</span><span>BLOCK/BLOCK ${summary.BB}</span></div><div><input id="q" placeholder="Candidate ID search"><select id="state"><option value="ALL">ALL</option><option value="MATCH">MATCHES</option><option value="DIS">DISAGREEMENTS</option><option value="HP">HUMAN PASS</option><option value="HB">HUMAN BLOCK</option><option value="AP">ADAM PASS</option><option value="AB">ADAM BLOCK</option><option value="PP">PASS/PASS</option><option value="PB">PASS/BLOCK</option><option value="BP">BLOCK/PASS</option><option value="BB">BLOCK/BLOCK</option></select><select id="cls"><option value="">All classifications</option></select><select id="cat"><option value="">All categories</option></select><select id="sort"><option value="frozen">Frozen order</option><option value="id">Candidate ID</option><option value="human">Human decision</option><option value="adam">Adam decision</option><option value="comparison">Comparison state</option><option value="classification">Classification</option></select><b id="shown"></b></div></header><main class="grid" id="grid"></main><script>const D=${data},$=id=>document.getElementById(id),esc=x=>String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));for(const[id,vals]of[['cls',[...new Set(D.flatMap(x=>x.classifications))].sort()],['cat',[...new Set(D.flatMap(x=>x.categories))].sort()]])for(const v of vals){let o=document.createElement('option');o.value=v;o.textContent=v;$(id).append(o)}function ok(x){let s=$('state').value,b=s==='ALL'||s==='MATCH'&&x.humanDecision===x.adamDecision||s==='DIS'&&x.humanDecision!==x.adamDecision||s==='HP'&&x.humanDecision==='PASS'||s==='HB'&&x.humanDecision==='BLOCK'||s==='AP'&&x.adamDecision==='PASS'||s==='AB'&&x.adamDecision==='BLOCK'||s==='PP'&&x.comparison==='HUMAN_PASS_MODEL_PASS'||s==='PB'&&x.comparison==='HUMAN_PASS_MODEL_BLOCK'||s==='BP'&&x.comparison==='HUMAN_BLOCK_MODEL_PASS'||s==='BB'&&x.comparison==='HUMAN_BLOCK_MODEL_BLOCK';return b&&(!$('q').value||x.candidateId.includes($('q').value))&&(!$('cls').value||x.classifications.includes($('cls').value))&&(!$('cat').value||x.categories.includes($('cat').value))}function draw(){let a=D.filter(ok),s=$('sort').value;a.sort((x,y)=>s==='frozen'?x.frozenOrder-y.frozenOrder:s==='id'?x.candidateId.localeCompare(y.candidateId):s==='human'?x.humanDecision.localeCompare(y.humanDecision):s==='adam'?x.adamDecision.localeCompare(y.adamDecision):s==='comparison'?x.comparison.localeCompare(y.comparison):x.classifications.join(',').localeCompare(y.classifications.join(',')));$('shown').textContent='Showing '+a.length+' cards';$('grid').innerHTML=a.map(x=>'<article class="card '+(x.humanDecision===x.adamDecision?'match':'dis')+'"><img loading="lazy" src="'+x.image+'" alt="Local candidate '+esc(x.candidateId)+'"><div class="body"><b>'+esc(x.candidateId)+'</b><p class="'+x.humanDecision.toLowerCase()+'">Frozen V1 human: '+x.humanDecision+'</p><p class="'+x.adamDecision.toLowerCase()+'">AdamCodd: '+x.adamDecision+'</p><p><b>'+esc(x.comparison)+'</b></p><p class="small">Classifications: '+esc(x.classifications.join(', ')||'None')+'<br>Categories: '+esc(x.categories.join(', ')||'None')+'<br>Native: '+esc(x.nativeClass)+' · logits: ['+x.rawLogits.map(n=>Number(n).toFixed(6)).join(', ')+']</p></div></article>').join('')}['q','state','cls','cat','sort'].forEach(id=>$(id).oninput=draw);draw()</script></html>`;
}

void (async () => {
  await noExistingOutputs();
  const [preregBytes, mappingBytes, f3Bytes, modelBytes] = await Promise.all([readFile(preregPath), readFile(mappingPath), readFile(f3Path), readFile(modelPath)]);
  if (sha(preregBytes) !== "bb56d721dd62698690a5312c3546e092dd899af120ea6c5914f3b348cb2e8d74") throw new Error("Frozen preregistration SHA mismatch");
  if (sha(mappingBytes) !== "fd85703b65becabfc7a804d5551adf6298601e0bc218ca9101d6f15c6e45358a") throw new Error("Frozen mapping authority SHA mismatch");
  if (sha(f3Bytes) !== "6ea1d8b7094991d507563388d220ce2835040dc1991e84e614b155b38d101641") throw new Error("F3 authority SHA mismatch");
  if (sha(modelBytes) !== ADAMCODD_RUNTIME_AUTHORITY.artifactSha256 || modelBytes.length !== ADAMCODD_RUNTIME_AUTHORITY.artifactBytes) throw new Error("AdamCodd model integrity mismatch");
  const prereg = JSON.parse(preregBytes), mapping = JSON.parse(mappingBytes), f3 = JSON.parse(f3Bytes);
  if (prereg.classification !== "CONSUMED_UNSEEN_V1_RETROSPECTIVE_DIAGNOSTIC" || prereg.semanticFingerprint !== "436296ebb100176faed2759b780d4bd3c0acc2e5c1ac6dedce405d339e9f5812" || mapping.semanticFingerprint !== "295704717b7a026c43ce7ee74ab6f4bb703e62a172e68219daf6ff4cb6c859c9" || mapping.counts.mapped !== 325 || mapping.g3Used !== false) throw new Error("Frozen prerequisite semantic authority mismatch");
  const candidates = f3.candidates || f3.rows || [];
  const reviews = new Map(candidates.map(c => [c.candidateId, c]));
  const rowsToRun = mapping.rows;
  if (rowsToRun.length !== 325 || new Set(rowsToRun.map(r => r.candidateId)).size !== 325 || candidates.length !== 325) throw new Error("Candidate mapping count mismatch");
  const humanPass = candidates.filter(c => c.decision === "PASS").length, humanBlock = candidates.filter(c => c.decision === "BLOCK").length;
  if (humanPass !== 156 || humanBlock !== 169) throw new Error("Frozen V1 decision totals mismatch");
  for (const mapped of rowsToRun) { const c = reviews.get(mapped.candidateId); if (!c || c.sha256 !== mapped.canonicalImageSha256) throw new Error(`Frozen mapping mismatch ${mapped.candidateId}`); }
  await mkdir(out, { recursive: true });
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"], enableCpuMemArena: false, enableMemPattern: false });
  try {
    const inputIndex = session.inputNames.indexOf(ADAMCODD_RUNTIME_AUTHORITY.inputName), outputIndex = session.outputNames.indexOf(ADAMCODD_RUNTIME_AUTHORITY.outputName);
    const input = inputIndex < 0 ? undefined : session.inputMetadata[inputIndex], output = outputIndex < 0 ? undefined : session.outputMetadata[outputIndex];
    if (!input || !output || !input.isTensor || !output.isTensor) throw new Error("AdamCodd named tensor metadata unavailable");
    validateAdamCoddTensorContract({ name: ADAMCODD_RUNTIME_AUTHORITY.inputName, type: input.type, shape: input.shape }, { name: ADAMCODD_RUNTIME_AUTHORITY.outputName, type: output.type, shape: output.shape });
    const results = [];
    for (let index = 0; index < rowsToRun.length; index += 1) {
      const mapped = rowsToRun[index], frozen = reviews.get(mapped.candidateId), imageBytes = await readFile(mapped.resolvedLocalPath);
      if (sha(imageBytes) !== mapped.canonicalImageSha256) throw new Error(`Mapped source SHA mismatch ${mapped.candidateId}`);
      const prepared = await preprocessAdamCodd(imageBytes), outputResult = await session.run({ [ADAMCODD_RUNTIME_AUTHORITY.inputName]: new ort.Tensor("float32", prepared.data, [...prepared.shape]) });
      const tensor = outputResult[ADAMCODD_RUNTIME_AUTHORITY.outputName];
      if (!tensor || tensor.type !== "float32" || !(tensor.data instanceof Float32Array) || tensor.data.length !== 2 || ![...tensor.data].every(Number.isFinite)) throw new Error(`Invalid AdamCodd logits ${mapped.candidateId}`);
      const evidence = interpretAdamCoddLogits([...tensor.data]), modelDecision = decision(evidence.nativeClass);
      results.push({ candidateId: mapped.candidateId, frozenOrder: index, canonicalImageSha256: mapped.canonicalImageSha256, relativeAsset: mapped.relativeAsset, verifiedImageSha256: sha(imageBytes), humanDecision: frozen.decision, classifications: frozen.classification ? [frozen.classification] : [], categories: frozen.categories || [], contexts: frozen.contexts || [], modelNativeClass: evidence.nativeClass, nativeClassIndex: evidence.nativeClassIndex, rawLogits: [...evidence.logits], evaluationDecision: modelDecision, comparison: comparison(frozen.decision, modelDecision), success: true });
      if ((index + 1) % 25 === 0) console.log(JSON.stringify({ progress: index + 1, total: 325 }));
    }
    const ids = new Set(results.map(r => r.candidateId));
    if (results.length !== 325 || ids.size !== 325 || results.some(r => r.verifiedImageSha256 !== r.canonicalImageSha256)) throw new Error("Post-inference result integrity validation failed");
    const counts = confusion(results), adamPass = results.filter(r => r.evaluationDecision === "PASS").length, adamBlock = results.filter(r => r.evaluationDecision === "BLOCK").length;
    if (counts.PP + counts.PB !== 156 || counts.BP + counts.BB !== 169 || counts.PP + counts.PB + counts.BP + counts.BB !== 325 || adamPass + adamBlock !== 325) throw new Error("Confusion-matrix integrity validation failed");
    const metrics = { accuracy: metric(counts.PP + counts.BB, 325), blockRecall: metric(counts.BB, counts.BB + counts.BP), passSpecificity: metric(counts.PP, counts.PP + counts.PB), blockPrecision: metric(counts.BB, counts.BB + counts.PB), balancedAccuracy: (metric(counts.BB, counts.BB + counts.BP) + metric(counts.PP, counts.PP + counts.PB)) / 2, blockF1: metric(2 * counts.BB, 2 * counts.BB + counts.BP + counts.PB) };
    const classBreakdown = breakdown(results, "classifications"), categoryBreakdown = breakdown(results, "categories");
    const candidateBase = { status: "G14C_ADAMCODD_CONSUMED_UNSEEN_V1_CANDIDATE_RESULTS_COMPLETE", classification: prereg.classification, attempted: 325, successful: 325, failed: 0, skipped: 0, decisionRule: "native_argmax_raw_logits_only; sfw->PASS; nsfw->BLOCK; no threshold", rows: results };
    const candidateArtifact = { ...candidateBase, semanticFingerprint: sha(canonical(candidateBase)) };
    const disagreements = { status: "G14C_DISAGREEMENT_INVENTORY_COMPLETE", classification: prereg.classification, humanPassModelBlock: results.filter(r => r.comparison === "HUMAN_PASS_MODEL_BLOCK"), humanBlockModelPass: results.filter(r => r.comparison === "HUMAN_BLOCK_MODEL_PASS") };
    const reportBase = { status: "G14C_ADAMCODD_CONSUMED_UNSEEN_V1_DIAGNOSTIC_COMPLETE", classification: prereg.classification, authority: { preregistrationSha256: sha(preregBytes), mappingAuthoritySha256: sha(mappingBytes), f3Sha256: sha(f3Bytes), modelSha256: sha(modelBytes), originalV1HumanAuthorityUnchanged: true, g3V2DecisionsUsed: false, futureUnseenV2Accessed: false }, execution: { attempted: 325, successful: 325, failed: 0, skipped: 0, humanPass, humanBlock, adamPass, adamBlock }, confusion: counts, metrics, breakdowns: { classification: classBreakdown, category: categoryBreakdown }, scope: { tuning: false, calibration: false, training: false, fusion: false, otherModelsRan: false, productionModified: false } };
    const report = { ...reportBase, semanticFingerprint: sha(canonical(reportBase)) };
    await once("candidate-results.json", candidateArtifact); await once("disagreement-inventory.json", disagreements); await once("aggregate-diagnostic-report.json", report);
    const cards = results.map(r => ({ candidateId: r.candidateId, frozenOrder: r.frozenOrder, image: path.relative(out, path.join(cache, r.relativeAsset)).split(path.sep).join("/"), humanDecision: r.humanDecision, adamDecision: r.evaluationDecision, comparison: r.comparison, classifications: r.classifications, categories: r.categories, nativeClass: r.modelNativeClass, rawLogits: r.rawLogits }));
    const missing = [];
    for (const card of cards) try { await access(path.resolve(out, card.image), constants.R_OK); } catch { missing.push(card.candidateId); }
    if (cards.length !== 325 || new Set(cards.map(c => c.candidateId)).size !== 325 || missing.length) throw new Error("Visual card/image validation failed");
    const visualSummary = { humanPass, humanBlock, adamPass, adamBlock, ...counts };
    const html = htmlPage(cards, visualSummary); await writeFile(path.join(out, "g14c-adamcodd-325-human-model-review.html"), html, { flag: "wx" });
    const htmlBytes = await readFile(path.join(out, "g14c-adamcodd-325-human-model-review.html"));
    const manifestBase = { status: "G14C_ADAMCODD_325_VISUAL_REVIEW_READY", classification: prereg.classification, localOnly: true, readOnly: true, cards: { total: cards.length, uniqueCandidateIds: new Set(cards.map(c => c.candidateId)).size, missingImages: missing.length, ...visualSummary }, filters: ["ALL", "MATCHES", "DISAGREEMENTS", "HUMAN PASS", "HUMAN BLOCK", "ADAM PASS", "ADAM BLOCK", "PASS/PASS", "PASS/BLOCK", "BLOCK/PASS", "BLOCK/BLOCK", "classification", "category", "candidate-ID search"], sorting: ["frozen order", "candidate ID", "human decision", "Adam decision", "comparison state", "classification"], htmlSha256: sha(htmlBytes), externalImageUrls: false, editableControls: false };
    const manifest = { ...manifestBase, semanticFingerprint: sha(canonical(manifestBase)) }; await once("visual-review-manifest.json", manifest);
    const hashes = {};
    for (const name of outputNames) hashes[name] = sha(await readFile(path.join(out, name)));
    console.log(JSON.stringify({ status: report.status, execution: report.execution, confusion: counts, metrics, hashes, candidateResultsSemanticFingerprint: candidateArtifact.semanticFingerprint, aggregateSemanticFingerprint: report.semanticFingerprint, visualSemanticFingerprint: manifest.semanticFingerprint }));
  } finally { await session.release(); }
})().catch(error => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
