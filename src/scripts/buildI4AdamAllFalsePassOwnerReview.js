const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const output = path.join(root, "evaluation-output", "image-moderation", "i4-adam-all-false-pass-owner-review");
const developmentResultsPath = path.join(root, "evaluation-output", "image-moderation", "i4-g10b-adamcodd-558-evaluation", "candidate-results.json");
const developmentGalleryPath = path.join(root, "evaluation-output", "image-moderation", "i4-g8f-human-vs-nudenet-visual-review", "g8f-gallery-manifest.json");
const developmentOverlayPath = path.join(root, "evaluation-output", "image-moderation", "i4-g14b-adamcodd-false-pass-analysis", "g14b-human-review-overlay.json");
const unseenResultsPath = path.join(root, "evaluation-output", "image-moderation", "i4-g14c-adamcodd-consumed-unseen-v1-diagnostic", "candidate-results.json");
const unseenReportPath = path.join(root, "evaluation-output", "image-moderation", "i4-g14c-adamcodd-consumed-unseen-v1-diagnostic", "aggregate-diagnostic-report.json");
const developmentGalleryRoot = path.join(root, "evaluation-output", "image-moderation", "i4-g8f-human-vs-nudenet-visual-review");
const unseenRoot = path.join(root, "evaluation-cache", "image-moderation", "unseen-test-v1");
const expectedDevelopmentIds = ["candidate-40a04b6c32a07a1c", "candidate-4951ac2e6883e18e", "candidate-532fdb0dfe1e6438", "candidate-89025bf2efd24024", "candidate-8b76c631075b0d54", "candidate-a994910f0898d191", "candidate-b326ceee55ea3978", "candidate-bcdfafc294814e73", "candidate-d79fd7895319236e", "candidate-f61caa45e1f4f437"].sort();
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const json = value => JSON.stringify(value, null, 2) + "\n";
const rel = source => path.relative(output, source).split(path.sep).join("/");
const esc = value => String(value).replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

const requireFalsePass = row => row.humanDecision === "BLOCK" && row.evaluationDecision === "PASS";
const sortIds = rows => rows.map(row => row.candidateId).sort();
const same = (first, second) => first.length === second.length && first.every((value, index) => value === second[index]);

function page(cards) {
  const data = JSON.stringify(cards).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AdamCodd complete false-PASS owner review</title><style>body{margin:0;background:#f4f6f8;color:#16212b;font:15px system-ui,sans-serif}header{position:sticky;top:0;z-index:2;padding:14px 18px;background:#fff;box-shadow:0 1px 8px #0002}h1{font-size:21px;margin:0 0 5px}.warning{color:#8b2626;font-weight:700}.controls{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}button{padding:7px 11px;border:1px solid #9eabb7;border-radius:6px;background:#fff;cursor:pointer}button.active{background:#173c61;color:#fff}.summary{font-size:13px;color:#51606e}.section{padding:14px 18px 0;margin:0;font-size:18px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px;padding:14px 18px 24px}.card{overflow:hidden;background:#fff;border-radius:8px;border-left:5px solid #bf6c00;box-shadow:0 1px 4px #0002}.card img{display:block;width:100%;height:390px;object-fit:contain;background:#111;cursor:zoom-in}.body{padding:12px}.id{font-weight:750;word-break:break-all}.tag{display:inline-block;margin:3px 4px 0 0;padding:3px 6px;border-radius:4px;background:#e8edf3;font-size:12px}.block{color:#991f1f;font-weight:750}.pass{color:#176334;font-weight:750}.small{font-size:12px;color:#53616e;line-height:1.45}dialog{max-width:92vw;max-height:92vh;padding:8px;border:0;background:#111}dialog img{display:block;max-width:90vw;max-height:88vh;object-fit:contain}dialog::backdrop{background:#000b}</style></head><body><header><h1>AdamCodd — Complete Known False-PASS Owner Review</h1><div class="warning">Read-only historical audit · every card is owner/Human BLOCK + frozen AdamCodd PASS · no inference is performed by this page.</div><div class="summary">Complete verified union: 14 candidates — DEVELOPMENT_558: 10 · CONSUMED_UNSEEN_V1_325: 4</div><div class="controls"><button class="active" data-filter="ALL">ALL 14</button><button data-filter="DEVELOPMENT_558">DEVELOPMENT 558 — 10 FALSE PASSES</button><button data-filter="CONSUMED_UNSEEN_V1_325">CONSUMED UNSEEN-V1 325 — 4 FALSE PASSES</button></div></header><h2 class="section" id="heading">ALL 14 FALSE PASSES</h2><main class="grid" id="grid"></main><dialog id="modal"><img id="zoom" alt="Expanded local candidate image"></dialog><script>const D=${data},grid=document.getElementById('grid'),heading=document.getElementById('heading'),modal=document.getElementById('modal'),zoom=document.getElementById('zoom');let filter='ALL';const e=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));function tags(a){return(a||[]).map(x=>'<span class="tag">'+e(x)+'</span>').join('')||'<span class="small">None recorded</span>'}function draw(){const a=D.filter(x=>filter==='ALL'||x.corpus===filter);heading.textContent=filter==='ALL'?'ALL 14 FALSE PASSES':filter==='DEVELOPMENT_558'?'DEVELOPMENT 558 — 10 FALSE PASSES':'CONSUMED UNSEEN-V1 325 — 4 FALSE PASSES';grid.innerHTML=a.map(x=>'<article class="card"><img loading="lazy" src="'+e(x.image)+'" data-full="'+e(x.image)+'" alt="Local image for '+e(x.candidateId)+'"><div class="body"><div class="id">'+e(x.candidateId)+'</div><div class="small">Corpus: <b>'+e(x.corpus)+'</b></div><p><span class="block">Human/owner: BLOCK</span><br><span class="pass">AdamCodd: PASS</span></p><div class="small"><b>Historical classification</b></div>'+tags(x.classifications)+'<div class="small" style="margin-top:8px"><b>Historical category</b></div>'+tags(x.categories)+(x.ownerFailureTypeOverlay.length?'<div class="small" style="margin-top:8px"><b>G14-B owner failure-type overlay</b></div>'+tags(x.ownerFailureTypeOverlay):'')+'<p class="small">Native: '+e(x.nativeClass)+' · logits: ['+x.rawLogits.map(n=>Number(n).toFixed(6)).join(', ')+']'+(x.nsfwProbability===null?'':' · nsfw probability: '+Number(x.nsfwProbability).toFixed(6))+'</p></div></article>').join('');grid.querySelectorAll('img').forEach(img=>img.onclick=()=>{zoom.src=img.dataset.full;modal.showModal()})}modal.onclick=()=>modal.close();document.querySelectorAll('button').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===button));draw()});draw()</script></body></html>`;
}

void (async () => {
  try { await fs.access(output); throw new Error(`Refusing to overwrite existing output directory: ${output}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const [developmentBytes, galleryBytes, overlayBytes, unseenBytes, unseenReportBytes] = await Promise.all([developmentResultsPath, developmentGalleryPath, developmentOverlayPath, unseenResultsPath, unseenReportPath].map(file => fs.readFile(file)));
  const development = JSON.parse(developmentBytes).rows.filter(requireFalsePass);
  const gallery = JSON.parse(galleryBytes);
  const overlay = JSON.parse(overlayBytes);
  const unseen = JSON.parse(unseenBytes).rows.filter(requireFalsePass);
  const unseenReport = JSON.parse(unseenReportBytes);
  if (development.length !== 10 || !same(sortIds(development), expectedDevelopmentIds)) throw new Error("Development false-PASS authority does not match the verified 10-candidate G14-B set");
  if (unseen.length !== 4 || unseenReport.confusion.BP !== 4) throw new Error("Consumed unseen-V1 false-PASS authority does not contain exactly four candidates");
  if (development.some(row => !requireFalsePass(row)) || unseen.some(row => !requireFalsePass(row))) throw new Error("Non false-PASS record selected");
  const combinedIds = [...development, ...unseen].map(row => row.candidateId);
  if (new Set(combinedIds).size !== 14) throw new Error("Candidate ID collision in the combined review set");
  const overlays = new Map(overlay.reviews.map(review => [review.candidateId, review.selectedReasons]));
  if (overlay.sourceCandidateCount !== 10 || !same([...overlays.keys()].sort(), expectedDevelopmentIds)) throw new Error("G14-B owner overlay does not cover the verified development false-PASS set");
  const galleryById = new Map(gallery.candidates.map(candidate => [candidate.candidateId, candidate]));
  const cards = [];
  for (const row of development) {
    const asset = galleryById.get(row.candidateId);
    if (!asset || asset.sourceSha256 !== row.sourceSha256) throw new Error(`Development image mapping is not authoritative: ${row.candidateId}`);
    const file = path.join(developmentGalleryRoot, asset.displayAsset);
    await fs.access(file);
    cards.push({ candidateId: row.candidateId, corpus: "DEVELOPMENT_558", image: rel(file), sourceImageSha256: row.sourceSha256, imageMapping: "G8-F local thumbnail mapped by matching candidateId and sourceSha256", humanDecision: row.humanDecision, adamDecision: row.evaluationDecision, classifications: row.classifications, categories: row.categories, ownerFailureTypeOverlay: overlays.get(row.candidateId), nativeClass: row.modelNativeClass, nativeClassIndex: row.nativeClassIndex, rawLogits: row.rawLogits, nsfwProbability: row.nsfwProbability });
  }
  for (const row of unseen) {
    const file = path.join(unseenRoot, row.relativeAsset);
    const bytes = await fs.readFile(file);
    if (hash(bytes) !== row.canonicalImageSha256 || row.verifiedImageSha256 !== row.canonicalImageSha256) throw new Error(`Consumed unseen-V1 image integrity mismatch: ${row.candidateId}`);
    cards.push({ candidateId: row.candidateId, corpus: "CONSUMED_UNSEEN_V1_325", image: rel(file), sourceImageSha256: row.canonicalImageSha256, imageMapping: "Frozen G14-C relativeAsset with SHA-256 verified source bytes", humanDecision: row.humanDecision, adamDecision: row.evaluationDecision, classifications: row.classifications, categories: row.categories, ownerFailureTypeOverlay: [], nativeClass: row.modelNativeClass, nativeClassIndex: row.nativeClassIndex, rawLogits: row.rawLogits, nsfwProbability: null });
  }
  const manifestBase = { status: "I4_ADAM_ALL_FALSE_PASS_OWNER_REVIEW_COMPLETE", purpose: "READ_ONLY_OWNER_VISUAL_AUDIT_OF_COMPLETE_KNOWN_ADAM_FALSE_PASS_POPULATION", selection: "Frozen human/owner BLOCK plus frozen AdamCodd PASS only", counts: { development558: development.length, consumedUnseenV1325: unseen.length, combined: cards.length, uniqueCandidateIds: new Set(cards.map(card => card.candidateId)).size, resolvedImages: cards.length }, sourceArtifacts: { developmentCandidateResults: { path: rel(developmentResultsPath), sha256: hash(developmentBytes) }, developmentGalleryManifest: { path: rel(developmentGalleryPath), sha256: hash(galleryBytes) }, g14bOwnerOverlay: { path: rel(developmentOverlayPath), sha256: hash(overlayBytes) }, consumedUnseenCandidateResults: { path: rel(unseenResultsPath), sha256: hash(unseenBytes) }, consumedUnseenAggregateReport: { path: rel(unseenReportPath), sha256: hash(unseenReportBytes) } }, integrity: { developmentExpectedIdsVerified: true, developmentFalsePassCountExactlyTen: true, consumedUnseenFalsePassCountExactlyFour: true, combinedCountExactlyFourteen: true, everyRecordHumanBlockAdamPass: true, noHumanPassAdamBlockIncluded: true, allDisplayedImagesResolved: true, imageChecks: "Development local gallery mappings matched candidateId and source SHA-256; consumed unseen-V1 source bytes SHA-256 verified.", inferenceRun: false, otherModelRun: false, labelsModified: false }, cards };
  const manifest = { ...manifestBase, semanticFingerprint: hash(JSON.stringify(manifestBase)) };
  const html = page(cards);
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "adam-all-false-pass-review.html"), html, { flag: "wx" });
  await fs.writeFile(path.join(output, "adam-all-false-pass-manifest.json"), json(manifest), { flag: "wx" });
  const artifactBase = { status: "I4_ADAM_ALL_FALSE_PASS_OWNER_REVIEW_ARTIFACTS_COMPLETE", sourceArtifacts: manifest.sourceArtifacts, generatedArtifacts: { "adam-all-false-pass-review.html": { sha256: hash(await fs.readFile(path.join(output, "adam-all-false-pass-review.html")) ) }, "adam-all-false-pass-manifest.json": { sha256: hash(await fs.readFile(path.join(output, "adam-all-false-pass-manifest.json")) ) } }, execution: { inferenceRun: false, otherModelRun: false, labelsModified: false } };
  const artifactManifest = { ...artifactBase, semanticFingerprint: hash(JSON.stringify(artifactBase)) };
  await fs.writeFile(path.join(output, "artifact-manifest.json"), json(artifactManifest), { flag: "wx" });
  console.log(JSON.stringify({ status: manifest.status, counts: manifest.counts, ids: Object.fromEntries(["DEVELOPMENT_558", "CONSUMED_UNSEEN_V1_325"].map(corpus => [corpus, cards.filter(card => card.corpus === corpus).map(card => card.candidateId)])), artifacts: Object.fromEntries(["adam-all-false-pass-review.html", "adam-all-false-pass-manifest.json", "artifact-manifest.json"].map(name => [name, hash(require("node:fs").readFileSync(path.join(output, name)))])) }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
