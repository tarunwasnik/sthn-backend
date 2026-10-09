const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const g15c = path.join(root, 'evaluation-output/image-moderation/i4-g15c-reddesert-558-native-evaluation');
const out = path.join(root, 'evaluation-output/image-moderation/i4-g15d-reddesert-adam-pass-boundary-review');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = file => sha(fs.readFileSync(file));
const canonical = value => JSON.stringify(value);
const assert = (condition, message) => { if (!condition) throw new Error(`G15-D integrity failure: ${message}`); };
const write = (name, value) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(value, null, 2)}\n`);

if (fs.existsSync(out)) throw new Error(`refusing to overwrite existing G15-D output: ${out}`);

const protocolPath = path.join(g15c, 'evaluation-protocol.json');
const redPath = path.join(g15c, 'candidate-results.json');
const finalPath = path.join(g15c, 'final-g15c-report.json');
const adamPath = path.join(root, 'evaluation-output/image-moderation/i4-g10b-adamcodd-558-evaluation/candidate-results.json');
const inventoryPath = path.join(root, 'evaluation-cache/image-moderation/benchmark/inventory-manifest.json');
const g14Path = path.join(g15c, 'g14b-residual-analysis.json');
const expected = {
  protocol: 'c569aa1f28572368ab9c7eedddab880fc11867771b96e9bbc846042d15d487ad',
  candidateResults: 'c308a96c7491da1eee8152bcdcc2d9f42c8b9e6b39387bec8f7388fc85573a6f',
  candidateFingerprint: '4218fc7c06dc545e2b1a588ebe21e4d2d0e3d76ff1cd29e38e58c0c050868e1b',
  finalReport: 'b7708307dcdae04c632609dc0a8e441f497c3c0d4aeeaf01ab1f8838e6266146'
};
assert(fileSha(protocolPath) === expected.protocol, 'G15-C protocol hash');
assert(fileSha(redPath) === expected.candidateResults, 'G15-C candidate-results hash');
assert(fileSha(finalPath) === expected.finalReport, 'G15-C final-report hash');

const red = require(redPath);
const adam = require(adamPath).rows;
const inventory = require(inventoryPath).candidates;
const g14 = require(g14Path).rows;
assert(sha(canonical(red.rows)) === expected.candidateFingerprint, 'G15-C candidate fingerprint');
const labels = ['bdsm', 'disgusting', 'drawings', 'gore', 'hentai', 'unnamed_a', 'neutral', 'q', 'sexy', 'unnamed_b', 'x'];
assert(canonical(red.labels) === canonical(labels), 'native label order');

const rankingSpecs = [
  { key: 'neutral_low', label: 'lowest neutral logit', nativeLabel: 'neutral', direction: 'ascending' },
  { key: 'drawings_low', label: 'lowest drawings logit', nativeLabel: 'drawings', direction: 'ascending' },
  { key: 'bdsm_high', label: 'highest bdsm logit', nativeLabel: 'bdsm', direction: 'descending' },
  { key: 'sexy_high', label: 'highest sexy logit', nativeLabel: 'sexy', direction: 'descending' },
  { key: 'q_high', label: 'highest q logit', nativeLabel: 'q', direction: 'descending' },
  { key: 'x_high', label: 'highest x logit', nativeLabel: 'x', direction: 'descending' },
  { key: 'unnamed_a_high', label: 'highest unnamed_a logit', nativeLabel: 'unnamed_a', direction: 'descending' }
];
const protocolBase = {
  phase: 'G15-D', purpose: 'human review preparation only', sourceAuthorities: expected,
  controlUniverse: 'frozen G10-B humanDecision PASS and evaluationDecision PASS, joined by exact candidateId to frozen G15-C results',
  referenceUniverse: 'frozen G10-B humanDecision BLOCK and evaluationDecision PASS, reference-only',
  rankingDimensions: rankingSpecs, topPerDimension: 15, deduplication: 'candidateId union across the seven top-15 rankings',
  ownerReviewSchema: { ownerDecision: ['PROFESSIONAL_POLICY_PASS', 'PROFESSIONAL_POLICY_BLOCK', 'OWNER_UNCERTAIN', 'NOT_REVIEWED'], ownerReasons: ['PARTIAL_EXPOSURE', 'SUGGESTIVE_PRESENTATION', 'REVEALING_SWIMWEAR', 'UNNECESSARY_SHIRTLESS_PUBLIC_IMAGE', 'NUDITY_EXPOSURE', 'SEXUAL_CONTENT', 'PORNOGRAPHY', 'OTHER_PROFESSIONAL_POLICY'], ownerNote: 'optional short text' },
  prohibitions: ['no historical-label mutation', 'no threshold selection', 'no PASS/BLOCK Reddesert mapping', 'no model reruns', 'no tuning/calibration/training/fusion', 'no unauthorized corpus access']
};
const protocol = { ...protocolBase, semanticFingerprint: sha(canonical(protocolBase)) };

fs.mkdirSync(out, { recursive: false });
write('review-protocol.json', protocol); // Persisted before selection or owner-review artifacts.

const adamById = new Map(adam.map(row => [row.candidateId, row]));
const assetById = new Map(inventory.map(row => [row.id, row]));
const g14ById = new Map(g14.map(row => [row.candidateId, row.patterns]));
assert(red.rows.length === 558 && new Set(red.rows.map(row => row.candidateId)).size === 558, 'Reddesert rows');
assert(adam.length === 558 && new Set(adam.map(row => row.candidateId)).size === 558, 'Adam rows');

function joined(row) {
  const a = adamById.get(row.candidateId), asset = assetById.get(row.candidateId);
  assert(a && asset, `missing exact candidateId join for ${row.candidateId}`);
  assert(['PASS', 'BLOCK'].includes(a.evaluationDecision), `invalid Adam decision ${row.candidateId}`);
  assert(Array.isArray(row.nativeLogits) && row.nativeLogits.length === 11 && row.nativeLogits.every(Number.isFinite), `invalid Reddesert logits ${row.candidateId}`);
  assert(labels[row.nativeArgmaxIndex] === row.nativeArgmaxLabel, `invalid Reddesert argmax ${row.candidateId}`);
  const image = path.join(root, 'evaluation-cache/image-moderation/benchmark', asset.localAsset);
  assert(fs.existsSync(image), `missing authorized image ${row.candidateId}`);
  return { candidateId: row.candidateId, sourceSha256: row.sourceSha256, historicalHumanDecision: a.humanDecision, historicalClassifications: a.classifications, adamDecision: a.evaluationDecision, nativeArgmax: row.nativeArgmaxLabel, nativeLogits: row.nativeLogits, imageUrl: `file:///${image.replace(/\\/g, '/')}` };
}

const joinedRows = red.rows.map(joined);
const controls = joinedRows.filter(row => row.historicalHumanDecision === 'PASS' && row.adamDecision === 'PASS');
const references = joinedRows.filter(row => row.historicalHumanDecision === 'BLOCK' && row.adamDecision === 'PASS').map(row => ({ ...row, correctedG14BPatterns: g14ById.get(row.candidateId) || [] }));
assert(controls.length === 142 && new Set(controls.map(row => row.candidateId)).size === 142, 'control universe must be exactly 142');
assert(references.length === 10 && new Set(references.map(row => row.candidateId)).size === 10, 'reference universe must be exactly 10');
assert(g14.length === 10 && references.every(row => row.correctedG14BPatterns.length > 0), 'frozen G14-B reference overlay');

const value = (row, label) => row.nativeLogits[labels.indexOf(label)];
const nativeStats = Object.fromEntries(labels.map(label => {
  const ordered = [...controls].sort((a, b) => value(a, label) - value(b, label) || a.candidateId.localeCompare(b.candidateId));
  return [label, new Map(ordered.map((row, index) => [row.candidateId, { ascendingRank: index + 1, ascendingPercentile: controls.length === 1 ? 1 : index / (controls.length - 1) }]))];
}));
const rankingRows = Object.fromEntries(rankingSpecs.map(spec => {
  const sorted = [...controls].sort((a, b) => {
    const delta = value(a, spec.nativeLabel) - value(b, spec.nativeLabel);
    return (spec.direction === 'ascending' ? delta : -delta) || a.candidateId.localeCompare(b.candidateId);
  });
  return [spec.key, sorted.slice(0, 15).map((row, index) => ({ candidateId: row.candidateId, selectionRank: index + 1, value: value(row, spec.nativeLabel) }))];
}));
const reasonsById = new Map();
for (const spec of rankingSpecs) for (const entry of rankingRows[spec.key]) {
  if (!reasonsById.has(entry.candidateId)) reasonsById.set(entry.candidateId, []);
  reasonsById.get(entry.candidateId).push(`TOP_${spec.key.toUpperCase()}`);
}
const selected = controls.filter(row => reasonsById.has(row.candidateId)).map(row => ({ ...row, selectionReasons: reasonsById.get(row.candidateId), nativeRanks: Object.fromEntries(labels.map(label => [label, nativeStats[label].get(row.candidateId)])) }));
const patternCounts = Object.fromEntries(['PARTIAL_EXPOSURE', 'SUGGESTIVE_PRESENTATION', 'NUDITY_EXPOSURE'].map(pattern => [pattern, references.filter(row => row.correctedG14BPatterns.includes(pattern)).length]));
assert(patternCounts.PARTIAL_EXPOSURE === 8 && patternCounts.SUGGESTIVE_PRESENTATION === 3 && patternCounts.NUDITY_EXPOSURE === 1, 'G14-B pattern counts');

const selectionBase = { controlsUniverseCount: controls.length, knownResidualReferenceCount: references.length, beforeDeduplication: rankingSpecs.length * 15, afterDeduplication: selected.length, rankingSpecs, rankings: rankingRows, selectedControls: selected, knownResidualReferences: references, correctedG14BPatternCounts: patternCounts };
const selectionManifest = { ...selectionBase, semanticFingerprint: sha(canonical(selectionBase)) };
write('selected-candidate-manifest.json', selectionManifest);

const exportTemplateBase = { reviewProtocolVersion: 'G15D_REDDESERT_ADAM_PASS_BOUNDARY_OWNER_REVIEW_V1', sourceSelectionSemanticFingerprint: selectionManifest.semanticFingerprint, records: [{ candidateId: 'candidate-id', ownerDecision: 'NOT_REVIEWED', ownerReasons: [], ownerNote: '', reviewedAt: null }] };
const exportTemplate = { ...exportTemplateBase, semanticFingerprint: sha(canonical(exportTemplateBase)) };
write('owner-review-export-template.json', exportTemplate);

const data = JSON.stringify({ selected, references, labels, protocolVersion: exportTemplateBase.reviewProtocolVersion, selectionFingerprint: selectionManifest.semanticFingerprint }).replace(/</g, '\\u003c');
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>G15-D Adam-PASS boundary owner review</title><style>body{font:14px system-ui;margin:0;background:#f4f6f8;color:#17212b}header{position:sticky;top:0;z-index:3;background:#fff;padding:14px;box-shadow:0 1px 7px #0003}.controls{display:flex;gap:6px;flex-wrap:wrap}select,input,button,textarea{padding:7px;border:1px solid #aab7c4;border-radius:5px;background:#fff}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;padding:16px}.card{background:#fff;border:1px solid #d5dde5;border-radius:8px;overflow:hidden}.card img{display:block;width:100%;height:275px;object-fit:contain;background:#16191d}.body{padding:10px}.reference{border-left:5px solid #a36a00}.control{border-left:5px solid #256b92}.small{font-size:12px;color:#485866}pre{white-space:pre-wrap;font-size:11px}.reasons label{display:inline-block;margin:2px}.hidden{display:none}.pass{color:#186c37;font-weight:700}</style><header><h1>G15-D — Adam-PASS boundary owner review</h1><p>Controls are historical Human PASS / Adam PASS. This is an additive professional-policy review; no historical label or model decision is changed. Native signals are descriptive only: no threshold, mapping, score, or automated recommendation.</p><div class="controls"><label>Classification <select id="classification"><option value="ALL">ALL</option></select></label><label>Argmax <select id="argmax"><option value="ALL">ALL</option></select></label><label>Selection reason <select id="reason"><option value="ALL">ALL</option></select></label><label>Owner status <select id="status"><option value="ALL">ALL</option><option>NOT_REVIEWED</option><option>PROFESSIONAL_POLICY_PASS</option><option>PROFESSIONAL_POLICY_BLOCK</option><option>OWNER_UNCERTAIN</option></select></label><label>Candidate search <input id="search"></label><label>Sort <select id="sort"><option value="candidateId">candidate ID</option></select></label><button id="export">Download review JSON</button><b id="shown"></b></div></header><section><h2 style="margin:16px">HISTORICAL-PASS / ADAM-PASS CONTROL FOR OWNER REVIEW</h2><main id="controls" class="grid"></main></section><section><h2 style="margin:16px">KNOWN ADAM-PASS / HISTORICAL-BLOCK REFERENCE — not a review queue</h2><main id="references" class="grid"></main></section><script>const D=${data},$=id=>document.getElementById(id),KEY='G15D_REVIEW:'+D.selectionFingerprint+':',DEC=['PROFESSIONAL_POLICY_PASS','PROFESSIONAL_POLICY_BLOCK','OWNER_UNCERTAIN','NOT_REVIEWED'],REAS=['PARTIAL_EXPOSURE','SUGGESTIVE_PRESENTATION','REVEALING_SWIMWEAR','UNNECESSARY_SHIRTLESS_PUBLIC_IMAGE','NUDITY_EXPOSURE','SEXUAL_CONTENT','PORNOGRAPHY','OTHER_PROFESSIONAL_POLICY'],esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const get=id=>JSON.parse(localStorage.getItem(KEY+id)||'{"ownerDecision":"NOT_REVIEWED","ownerReasons":[],"ownerNote":"","reviewedAt":null}'),set=(id,v)=>localStorage.setItem(KEY+id,JSON.stringify(v));for(const v of [...new Set(D.selected.flatMap(x=>x.historicalClassifications))].sort())$('classification').add(new Option(v,v));for(const v of [...new Set(D.selected.map(x=>x.nativeArgmax))].sort())$('argmax').add(new Option(v,v));for(const v of [...new Set(D.selected.flatMap(x=>x.selectionReasons))].sort())$('reason').add(new Option(v,v));for(const l of D.labels){$('sort').add(new Option(l+' logit (high)', 'logit:'+l));$('sort').add(new Option(l+' percentile (high)', 'pct:'+l));$('sort').add(new Option(l+' rank (low)', 'rank:'+l));}function controlMatch(x){let v=get(x.candidateId);return ($('classification').value==='ALL'||x.historicalClassifications.includes($('classification').value))&&($('argmax').value==='ALL'||x.nativeArgmax===$('argmax').value)&&($('reason').value==='ALL'||x.selectionReasons.includes($('reason').value))&&($('status').value==='ALL'||v.ownerDecision===$('status').value)&&(!$('search').value||JSON.stringify(x).toLowerCase().includes($('search').value.toLowerCase()));}function card(x,reviewable){let v=get(x.candidateId),r=x.nativeRanks||{},s=reviewable?'<label>Owner review <select class="decision" data-id="'+esc(x.candidateId)+'">'+DEC.map(d=>'<option '+(v.ownerDecision===d?'selected':'')+'>'+d+'</option>').join('')+'</select></label><div class="reasons '+(v.ownerDecision==='PROFESSIONAL_POLICY_BLOCK'?'':'hidden')+'" data-reasons="'+esc(x.candidateId)+'">'+REAS.map(z=>'<label><input type="checkbox" value="'+z+'" '+(v.ownerReasons.includes(z)?'checked':'')+'> '+z+'</label>').join('')+'</div><textarea class="note" data-id="'+esc(x.candidateId)+'" placeholder="Optional owner note">'+esc(v.ownerNote)+'</textarea>':'<p class="small">Corrected G14-B owner patterns: '+esc(x.correctedG14BPatterns.join(', '))+'</p>';let ranks=D.labels.map(l=>l+': '+x.nativeLogits[D.labels.indexOf(l)]+' · rank '+(r[l]?r[l].ascendingRank:'—')+' · percentile '+(r[l]?r[l].ascendingPercentile.toFixed(3):'—')).join('\\n');return '<article class="card '+(reviewable?'control':'reference')+'"><img loading="lazy" src="'+esc(x.imageUrl)+'" alt="Authorized local candidate '+esc(x.candidateId)+'"><div class="body"><b>'+esc(x.candidateId)+'</b><p class="pass">Historical human: '+esc(x.historicalHumanDecision)+' · Frozen Adam: '+esc(x.adamDecision)+'</p><p>Historical classifications: '+esc(x.historicalClassifications.join(', ')||'None')+'</p><p>Reddesert native argmax: '+esc(x.nativeArgmax)+'</p><p class="small">'+(reviewable?'Selection reasons: '+esc(x.selectionReasons.join(', ')):'Known reference only; no new owner decision requested.')+'</p>'+s+'<pre>'+esc(ranks)+'</pre></div></article>';}function bind(){document.querySelectorAll('.decision').forEach(e=>e.onchange=()=>{let v=get(e.dataset.id);v.ownerDecision=e.value;if(v.ownerDecision!=='PROFESSIONAL_POLICY_BLOCK')v.ownerReasons=[];v.reviewedAt=v.ownerDecision==='NOT_REVIEWED'?null:new Date().toISOString();set(e.dataset.id,v);draw();});document.querySelectorAll('.note').forEach(e=>e.onchange=()=>{let v=get(e.dataset.id);v.ownerNote=e.value;set(e.dataset.id,v)});document.querySelectorAll('[data-reasons]').forEach(box=>box.querySelectorAll('input').forEach(e=>e.onchange=()=>{let v=get(box.dataset.reasons);v.ownerReasons=[...box.querySelectorAll('input:checked')].map(x=>x.value);set(box.dataset.reasons,v)}));}function draw(){let a=D.selected.filter(controlMatch),key=$('sort').value;a.sort((x,y)=>{if(key==='candidateId')return x.candidateId.localeCompare(y.candidateId);let[t,l]=key.split(':');let xv=t==='logit'?x.nativeLogits[D.labels.indexOf(l)]:x.nativeRanks[l][t==='pct'?'ascendingPercentile':'ascendingRank'],yv=t==='logit'?y.nativeLogits[D.labels.indexOf(l)]:y.nativeRanks[l][t==='pct'?'ascendingPercentile':'ascendingRank'];return t==='rank'?xv-yv:yv-xv||x.candidateId.localeCompare(y.candidateId)});$('shown').textContent='Showing '+a.length+' controls';$('controls').innerHTML=a.map(x=>card(x,true)).join('');$('references').innerHTML=D.references.map(x=>card(x,false)).join('');bind();}['classification','argmax','reason','status','search','sort'].forEach(id=>$(id).oninput=draw);$('export').onclick=()=>{let records=D.selected.map(x=>({candidateId:x.candidateId,...get(x.candidateId)}));let blob=new Blob([JSON.stringify({reviewProtocolVersion:D.protocolVersion,sourceSelectionSemanticFingerprint:D.selectionFingerprint,exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='g15d-owner-review.json';a.click();URL.revokeObjectURL(a.href)};draw();</script></html>`;
fs.writeFileSync(path.join(out, 'owner-review.html'), page);

const files = ['review-protocol.json', 'selected-candidate-manifest.json', 'owner-review-export-template.json', 'owner-review.html'];
const artifactBase = { phase: 'G15-D', status: 'G15D_ADAM_PASS_BOUNDARY_OWNER_REVIEW_READY', sourceAuthorities: expected, files: Object.fromEntries(files.map(name => [name, { sha256: fileSha(path.join(out, name)) }])), noModelInference: true, historicalLabelsMutated: false, knownResidualsReferenceOnly: true, thresholdOrMappingCreated: false, authorizedCorpus: 'G15-C 558 development corpus only' };
const artifactManifest = { ...artifactBase, semanticFingerprint: sha(canonical(artifactBase)) };
write('artifact-manifest.json', artifactManifest);
console.log(JSON.stringify({ controls: controls.length, references: references.length, beforeDeduplication: 105, selected: selected.length, files: Object.fromEntries([...files, 'artifact-manifest.json'].map(name => [name, fileSha(path.join(out, name))])) }, null, 2));
