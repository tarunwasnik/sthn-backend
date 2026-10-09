const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'evaluation-output/image-moderation/i4-g15c-reddesert-558-native-evaluation');
const red = require(path.join(output, 'candidate-results.json'));
const adam = require(path.join(root, 'evaluation-output/image-moderation/i4-g10b-adamcodd-558-evaluation/candidate-results.json')).rows;
const inventory = require(path.join(root, 'evaluation-cache/image-moderation/benchmark/inventory-manifest.json')).candidates;
const g14 = require(path.join(output, 'g14b-residual-analysis.json')).rows;

const expectedLabels = ['bdsm', 'disgusting', 'drawings', 'gore', 'hentai', 'unnamed_a', 'neutral', 'q', 'sexy', 'unnamed_b', 'x'];
const assert = (condition, message) => { if (!condition) throw new Error(`Owner-review integrity failure: ${message}`); };
const unique = values => new Set(values).size === values.length;

assert(JSON.stringify(red.labels) === JSON.stringify(expectedLabels), 'Reddesert label order changed');
assert(red.rows.length === 558 && unique(red.rows.map(row => row.candidateId)), 'Reddesert candidate representation is not 558 unique rows');
assert(adam.length === 558 && unique(adam.map(row => row.candidateId)), 'frozen Adam representation is not 558 unique rows');
assert(inventory.length === 558 && unique(inventory.map(row => row.id)), 'benchmark inventory is not 558 unique rows');

const adamById = new Map(adam.map(row => [row.candidateId, row]));
const assetById = new Map(inventory.map(row => [row.id, row]));
const patternsById = new Map(g14.map(row => [row.candidateId, row.patterns]));
const rows = red.rows.map(row => {
  const frozenAdam = adamById.get(row.candidateId);
  const asset = assetById.get(row.candidateId);
  assert(frozenAdam, `no frozen Adam row for ${row.candidateId}`);
  assert(asset, `no benchmark asset for ${row.candidateId}`);
  assert(['PASS', 'BLOCK'].includes(frozenAdam.evaluationDecision), `invalid frozen Adam evaluationDecision for ${row.candidateId}`);
  assert(['PASS', 'BLOCK'].includes(frozenAdam.humanDecision), `invalid frozen human decision for ${row.candidateId}`);
  assert(Array.isArray(row.nativeLogits) && row.nativeLogits.length === expectedLabels.length && row.nativeLogits.every(Number.isFinite), `invalid native logits for ${row.candidateId}`);
  assert(expectedLabels[row.nativeArgmaxIndex] === row.nativeArgmaxLabel, `invalid native argmax for ${row.candidateId}`);
  const imagePath = path.join(root, 'evaluation-cache/image-moderation/benchmark', asset.localAsset);
  assert(fs.existsSync(imagePath), `missing authorized benchmark image for ${row.candidateId}`);
  return { candidateId: row.candidateId, humanDecision: frozenAdam.humanDecision, classifications: frozenAdam.classifications,
    // Canonical frozen G10-B PASS/BLOCK decision; no new mapping is introduced here.
    adamDecision: frozenAdam.evaluationDecision, nativeArgmaxLabel: row.nativeArgmaxLabel, nativeLogits: row.nativeLogits,
    imageUrl: `file:///${imagePath.replace(/\\/g, '/')}`, patterns: patternsById.get(row.candidateId) || [] };
});

const filterRows = ({ human = 'ALL', classification = 'ALL', adamDecision = 'ALL', argmax = 'ALL', search = '' }) => rows.filter(row =>
  (human === 'ALL' || row.humanDecision === human) && (classification === 'ALL' || row.classifications.includes(classification)) &&
  (adamDecision === 'ALL' || row.adamDecision === adamDecision) && (argmax === 'ALL' || row.nativeArgmaxLabel === argmax) &&
  (!search || JSON.stringify(row).toLowerCase().includes(search.toLowerCase())));
const adamPass = filterRows({ adamDecision: 'PASS' });
const adamBlock = filterRows({ adamDecision: 'BLOCK' });
const residual = filterRows({ human: 'BLOCK', adamDecision: 'PASS' });
const control = filterRows({ human: 'PASS', adamDecision: 'PASS' });
const expectedResidualIds = adam.filter(row => row.humanDecision === 'BLOCK' && row.evaluationDecision === 'PASS').map(row => row.candidateId).sort();
const expectedControlIds = adam.filter(row => row.humanDecision === 'PASS' && row.evaluationDecision === 'PASS').map(row => row.candidateId).sort();
assert(adamPass.length === 152 && adamBlock.length === 406, 'frozen Adam PASS/BLOCK counts do not match required authority');
assert(residual.length === 10 && JSON.stringify(residual.map(row => row.candidateId).sort()) === JSON.stringify(expectedResidualIds), 'residual filter does not reproduce frozen Adam authority');
assert(control.length === 142 && JSON.stringify(control.map(row => row.candidateId).sort()) === JSON.stringify(expectedControlIds), 'control filter does not reproduce frozen Adam authority');
assert(g14.length === 10 && unique(g14.map(row => row.candidateId)), 'corrected G14-B residual overlay is invalid');
assert(g14.every(row => expectedResidualIds.includes(row.candidateId)), 'corrected G14-B overlay is outside the frozen residual set');

const reviewData = JSON.stringify(rows).replace(/</g, '\\u003c');
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>G15-C Reddesert owner review</title><style>body{font:14px system-ui;margin:0;background:#f5f7f9;color:#17212b}header{position:sticky;top:0;z-index:2;background:#fff;padding:16px;box-shadow:0 1px 7px #0003}.controls{display:flex;gap:6px;flex-wrap:wrap}select,input{padding:7px;border:1px solid #aab7c4;border-radius:5px;background:#fff}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;padding:16px}.card{background:#fff;border:1px solid #d5dde5;border-radius:8px;overflow:hidden}.card img{display:block;width:100%;height:280px;object-fit:contain;background:#16191d}.body{padding:10px}.small{font-size:12px;color:#485866}pre{white-space:pre-wrap;font-size:11px;margin-bottom:0}.pass{color:#186c37;font-weight:700}.block{color:#a02121;font-weight:700}</style><header><h1>G15-C Reddesert owner review — frozen evidence only</h1><p>Native raw signals and historical frozen evidence only. No recommendation, threshold, mapping, combined score, or policy decision is shown.</p><div class="controls"><label>Human <select id="human"><option>ALL</option><option>PASS</option><option>BLOCK</option></select></label><label>Historical classification <select id="classification"><option>ALL</option></select></label><label>Adam <select id="adam"><option>ALL</option><option>PASS</option><option>BLOCK</option></select></label><label>Reddesert argmax <select id="argmax"><option>ALL</option></select></label><label>Candidate search <input id="search"></label><label>Sort <select id="sort"><option value="candidateId">candidate ID</option></select></label><b id="shown"></b></div></header><main id="grid" class="grid"></main><script>const ROWS=${reviewData},LABELS=${JSON.stringify(expectedLabels)},$=id=>document.getElementById(id),esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));for(const value of [...new Set(ROWS.flatMap(row=>row.classifications))].sort())$('classification').add(new Option(value,value));for(const value of [...new Set(ROWS.map(row=>row.nativeArgmaxLabel))].sort())$('argmax').add(new Option(value,value));for(const value of LABELS)$('sort').add(new Option(value+' logit',value));function matches(row){return ($('human').value==='ALL'||row.humanDecision===$('human').value)&&($('classification').value==='ALL'||row.classifications.includes($('classification').value))&&($('adam').value==='ALL'||row.adamDecision===$('adam').value)&&($('argmax').value==='ALL'||row.nativeArgmaxLabel===$('argmax').value)&&(!$('search').value||JSON.stringify(row).toLowerCase().includes($('search').value.toLowerCase()));}function draw(){const visible=ROWS.filter(matches),key=$('sort').value;visible.sort((left,right)=>key==='candidateId'?left.candidateId.localeCompare(right.candidateId):right.nativeLogits[LABELS.indexOf(key)]-left.nativeLogits[LABELS.indexOf(key)]);$('shown').textContent='Showing '+visible.length+' candidates';$('grid').innerHTML=visible.map(row=>'<article class="card"><img loading="lazy" src="'+esc(row.imageUrl)+'" alt="Authorized local candidate '+esc(row.candidateId)+'"><div class="body"><b>'+esc(row.candidateId)+'</b><p class="'+row.humanDecision.toLowerCase()+'">Frozen human: '+esc(row.humanDecision)+'</p><p>Historical classifications: '+esc(row.classifications.join(', ')||'None')+'</p><p class="'+row.adamDecision.toLowerCase()+'">Frozen Adam: '+esc(row.adamDecision)+'</p><p>Reddesert native argmax: '+esc(row.nativeArgmaxLabel)+'</p><p class="small">Corrected G14-B owner patterns: '+esc(row.patterns.join(', ')||'—')+'</p><pre>'+LABELS.map((label,index)=>esc(label)+': '+row.nativeLogits[index]).join('\\n')+'</pre></div></article>').join('');}['human','classification','adam','argmax','search','sort'].forEach(id=>$(id).oninput=draw);draw();</script></html>`;
const patternCounts = Object.fromEntries(['PARTIAL_EXPOSURE', 'SUGGESTIVE_PRESENTATION', 'NUDITY_EXPOSURE'].map(pattern => [pattern, g14.filter(row => row.patterns.includes(pattern)).length]));
const manifest = { schemaVersion: 2, candidateCount: rows.length, uniqueCandidateCount: new Set(rows.map(row => row.candidateId)).size,
  adamDecisionSource: 'i4-g10b-adamcodd-558-evaluation/candidate-results.json rows[].evaluationDecision', adamPass: adamPass.length, adamBlock: adamBlock.length,
  humanBlockAdamPass: residual.length, humanPassAdamPass: control.length, residualCandidateIds: residual.map(row => row.candidateId).sort(),
  allNativeLogitsVisible: true, nativeLabelOrder: expectedLabels, correctedG14B: { residualRows: g14.length, patternCounts },
  filters: ['human decision', 'historical classification', 'Adam decision', 'Reddesert native argmax', 'candidate ID search'],
  sorts: ['candidate ID', ...expectedLabels.map(label => `${label} logit`)], localImageReferences: rows.length, policyRecommendationDisplayed: false, thresholdDisplayed: false };
fs.writeFileSync(path.join(output, 'owner-review.html'), page);
fs.writeFileSync(path.join(output, 'owner-review-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ adamPass: adamPass.length, adamBlock: adamBlock.length, residual: residual.length, control: control.length, patternCounts }, null, 2));
