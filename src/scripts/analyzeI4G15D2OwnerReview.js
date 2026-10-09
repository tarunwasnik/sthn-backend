const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const g15c = path.join(root, 'evaluation-output/image-moderation/i4-g15c-reddesert-558-native-evaluation');
const g15d = path.join(root, 'evaluation-output/image-moderation/i4-g15d-reddesert-adam-pass-boundary-review');
const out = path.join(root, 'evaluation-output/image-moderation/i4-g15d2-reddesert-owner-review-analysis');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
const canonical = value => JSON.stringify(value);
const assert = (condition, message) => { if (!condition) throw new Error(`G15-D2 integrity gate failure: ${message}`); };
const write = (name, value) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(value, null, 2)}\n`);
const unique = values => new Set(values).size === values.length;
const labels = ['bdsm', 'disgusting', 'drawings', 'gore', 'hentai', 'unnamed_a', 'neutral', 'q', 'sexy', 'unnamed_b', 'x'];
const knownReferenceIds = ['candidate-40a04b6c32a07a1c','candidate-4951ac2e6883e18e','candidate-532fdb0dfe1e6438','candidate-89025bf2efd24024','candidate-8b76c631075b0d54','candidate-a994910f0898d191','candidate-b326ceee55ea3978','candidate-bcdfafc294814e73','candidate-d79fd7895319236e','candidate-f61caa45e1f4f437'].sort();
const expected = {
  g15d: { protocol: '8bf848974b29cd174af2a1ca13e43b50396b570b911e5e62fbdb3c3dfcf42103', protocolFingerprint: 'ae8f0b446de97915d3e8093f906214b3af6c4b6ba209c37f71289e9b197ee473', selected: '6f2eb077fc0a4dbd77946a8f1a0f98643dd0f8192cabde39daf1bf4d12868137', html: '139860445b1a072d03443a065de6175f56b7a2dc2b9c238c7b0f11c06882959c', template: '9d54ed7a94cfb61df94fb5ffccef75b3196aa2fe24837fa920cbdcf1f05f7491', manifest: '62ddf95d0686a5e5f98d7dd9352d882de82a1ba9d64fc0fb9de8fe0b7f9a933e' },
  g15c: { candidates: 'c308a96c7491da1eee8152bcdcc2d9f42c8b9e6b39387bec8f7388fc85573a6f', fingerprint: '4218fc7c06dc545e2b1a588ebe21e4d2d0e3d76ff1cd29e38e58c0c050868e1b', report: 'b7708307dcdae04c632609dc0a8e441f497c3c0d4aeeaf01ab1f8838e6266146' }
};
const paths = { protocol: path.join(g15d, 'review-protocol.json'), selected: path.join(g15d, 'selected-candidate-manifest.json'), html: path.join(g15d, 'owner-review.html'), template: path.join(g15d, 'owner-review-export-template.json'), manifest: path.join(g15d, 'artifact-manifest.json'), owner: path.join(g15d, 'g15d-owner-review.json'), red: path.join(g15c, 'candidate-results.json'), final: path.join(g15c, 'final-g15c-report.json'), g14: path.join(g15c, 'g14b-residual-analysis.json') };
if (fs.existsSync(out)) throw new Error(`refusing to overwrite existing G15-D2 output: ${out}`);
for (const [key, expectedHash] of Object.entries(expected.g15d)) if (key !== 'protocolFingerprint') assert(fileHash(paths[key === 'html' ? 'html' : key]) === expectedHash, `G15-D ${key} SHA-256`);
assert(fileHash(paths.red) === expected.g15c.candidates, 'G15-C candidate-results SHA-256');
assert(fileHash(paths.final) === expected.g15c.report, 'G15-C final report SHA-256');
const reviewProtocol = require(paths.protocol);
assert(reviewProtocol.semanticFingerprint === expected.g15d.protocolFingerprint, 'G15-D protocol semantic fingerprint');
const selectedManifest = require(paths.selected);
const owner = require(paths.owner);
const red = require(paths.red);
const g14 = require(paths.g14).rows;
assert(canonical(red.labels) === canonical(labels), 'G15-C native label order');
assert(hash(canonical(red.rows)) === expected.g15c.fingerprint, 'G15-C candidate semantic fingerprint');

const selectedIds = selectedManifest.selectedControls.map(row => row.candidateId).sort();
assert(selectedIds.length === 73 && unique(selectedIds), 'frozen selected control set cardinality');
assert(owner.reviewProtocolVersion === 'G15D_REDDESERT_ADAM_PASS_BOUNDARY_OWNER_REVIEW_V1', 'owner review protocol version');
assert(owner.sourceSelectionSemanticFingerprint === selectedManifest.semanticFingerprint, 'owner review source selection fingerprint');
assert(Array.isArray(owner.records) && owner.records.length === 73 && unique(owner.records.map(row => row.candidateId)), 'owner record cardinality/uniqueness');
assert(canonical(owner.records.map(row => row.candidateId).sort()) === canonical(selectedIds), 'owner review candidate IDs must exactly equal selected controls');
const decisionCounts = Object.fromEntries(['PROFESSIONAL_POLICY_PASS','PROFESSIONAL_POLICY_BLOCK','OWNER_UNCERTAIN','NOT_REVIEWED'].map(decision => [decision, owner.records.filter(row => row.ownerDecision === decision).length]));
assert(decisionCounts.PROFESSIONAL_POLICY_PASS === 73 && decisionCounts.PROFESSIONAL_POLICY_BLOCK === 0 && decisionCounts.OWNER_UNCERTAIN === 0 && decisionCounts.NOT_REVIEWED === 0, 'owner decision counts');

const sourceAuthorities = { g15d: { reviewProtocolSha256: fileHash(paths.protocol), selectedManifestSha256: fileHash(paths.selected), ownerPageSha256: fileHash(paths.html), exportTemplateSha256: fileHash(paths.template), artifactManifestSha256: fileHash(paths.manifest), reviewProtocolFingerprint: reviewProtocol.semanticFingerprint }, g15c: { candidateResultsSha256: fileHash(paths.red), candidateResultFingerprint: hash(canonical(red.rows)), finalReportSha256: fileHash(paths.final) }, ownerReviewSha256: fileHash(paths.owner) };
const analysisProtocolBase = { phase: 'G15-D2', purpose: 'frozen owner-review evidence analysis only', sourceAuthorities, groups: { blockReferences: 10, ownerConfirmedPassControls: 73 }, operations: ['per-dimension descriptive/rank analysis', 'leave-one-BLOCK-out stability diagnostic', 'frozen G14-B failure-type descriptions', 'rank-vector/correlation structure diagnostic'], prohibitions: ['no model inference', 'no threshold or mapping', 'no training/tuning/calibration', 'no combined score', 'no label or owner-decision mutation', 'no image-byte/corpus access'] };
const analysisProtocol = { ...analysisProtocolBase, semanticFingerprint: hash(canonical(analysisProtocolBase)) };

fs.mkdirSync(out, { recursive: false });
write('analysis-protocol.json', analysisProtocol); // Frozen before analysis artifacts.
const normalizedOwnerBase = { sourceOwnerReviewSha256: sourceAuthorities.ownerReviewSha256, reviewProtocolVersion: owner.reviewProtocolVersion, sourceSelectionSemanticFingerprint: owner.sourceSelectionSemanticFingerprint, records: [...owner.records].sort((a, b) => a.candidateId.localeCompare(b.candidateId)), decisionCounts };
const normalizedOwner = { ...normalizedOwnerBase, semanticFingerprint: hash(canonical(normalizedOwnerBase)) };
write('normalized-owner-review.json', normalizedOwner);

const redById = new Map(red.rows.map(row => [row.candidateId, row]));
const selectedById = new Map(selectedManifest.selectedControls.map(row => [row.candidateId, row]));
const g14ById = new Map(g14.map(row => [row.candidateId, row.patterns]));
function nativeRow(candidateId, group) {
  const row = redById.get(candidateId);
  assert(row && Array.isArray(row.nativeLogits) && row.nativeLogits.length === 11 && row.nativeLogits.every(Number.isFinite), `clean native logits for ${candidateId}`);
  assert(labels[row.nativeArgmaxIndex] === row.nativeArgmaxLabel, `native argmax for ${candidateId}`);
  return { candidateId, group, nativeArgmax: row.nativeArgmaxLabel, nativeLogits: row.nativeLogits };
}
const blockRows = knownReferenceIds.map(id => ({ ...nativeRow(id, 'KNOWN_BLOCK_REFERENCE'), correctedG14BPatterns: g14ById.get(id) || [] }));
const passRows = selectedIds.map(id => ({ ...nativeRow(id, 'OWNER_CONFIRMED_PASS_CONTROL'), ownerDecision: normalizedOwner.records.find(row => row.candidateId === id).ownerDecision, historicalClassifications: selectedById.get(id).historicalClassifications }));
assert(blockRows.length === 10 && passRows.length === 73, 'joined group cardinality');
assert(blockRows.every(row => row.correctedG14BPatterns.length > 0), 'corrected G14-B patterns');
const joinedBase = { labels, blockReferences: blockRows, ownerConfirmedPassControls: passRows, joins: { blockReferences: 10, passControls: 73, failed: 0 } };
const joined = { ...joinedBase, semanticFingerprint: hash(canonical(joinedBase)) };
write('joined-analysis-set.json', joined);

const mean = xs => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const median = xs => { const ordered = [...xs].sort((a, b) => a - b); const middle = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2; };
const sd = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
const stat = xs => ({ n: xs.length, min: Math.min(...xs), max: Math.max(...xs), mean: mean(xs), median: median(xs) });
const aucHigh = (blocks, passes) => { let wins = 0; for (const b of blocks) for (const p of passes) wins += b > p ? 1 : b === p ? 0.5 : 0; return wins / (blocks.length * passes.length); };
const pearson = (xs, ys) => { const mx = mean(xs), my = mean(ys), numerator = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0); const denominator = Math.sqrt(xs.reduce((sum, x) => sum + (x - mx) ** 2, 0) * ys.reduce((sum, y) => sum + (y - my) ** 2, 0)); return denominator === 0 ? null : numerator / denominator; };
const values = (rows, index) => rows.map(row => row.nativeLogits[index]);
const dimensionAnalysis = {};
const rankDetails = {};
for (const [index, label] of labels.entries()) {
  const blocks = values(blockRows, index), passes = values(passRows, index), high = aucHigh(blocks, passes), low = 1 - high;
  const direction = high >= low ? 'higher BLOCK values' : 'lower BLOCK values';
  const auc = Math.max(high, low);
  const outside = blocks.filter(score => direction === 'higher BLOCK values' ? score > Math.max(...passes) : score < Math.min(...passes));
  const overlap = blocks.length - outside.length;
  const complete = outside.length === blocks.length;
  dimensionAnalysis[label] = { block: stat(blocks), pass: stat(passes), usefulDirection: direction, auc, aucIfHigherIsBlock: high, aucIfLowerIsBlock: low, rankBiserial: 2 * auc - 1, rangeOverlap: { blockReferencesInsidePassRange: overlap, blockReferencesOutsidePassRange: outside.length, passControlsInsideBlockRange: passes.filter(score => score >= Math.min(...blocks) && score <= Math.max(...blocks)).length, intervalsIntersect: Math.max(Math.min(...blocks), Math.min(...passes)) <= Math.min(Math.max(...blocks), Math.max(...passes)) }, completeSeparation: complete };
  rankDetails[label] = { usefulDirection: direction, blockReferences: blockRows.map(row => { const score = row.nativeLogits[index], lower = passes.filter(pass => pass < score).length, equal = passes.filter(pass => pass === score).length; const ascendingPercentile = (lower + equal * 0.5) / passes.length; const usefulPercentile = direction === 'higher BLOCK values' ? ascendingPercentile : 1 - ascendingPercentile; return { candidateId: row.candidateId, score, ascendingRankAmongPassControls: lower + 1, ascendingPercentileAmongPassControls: ascendingPercentile, usefulDirectionPercentile: usefulPercentile, outsidePassRange: direction === 'higher BLOCK values' ? score > Math.max(...passes) : score < Math.min(...passes) }; }), summary: { outsidePassRange: outside.length, overlappingPassRange: overlap } };
}
const nativeBase = { labels, blockReferenceCount: 10, passControlCount: 73, dimensions: dimensionAnalysis };
write('native-dimension-analysis.json', { ...nativeBase, semanticFingerprint: hash(canonical(nativeBase)) });
const rankBase = { labels, passControlCount: 73, blockReferenceCount: 10, dimensions: rankDetails };
write('rank-separation-analysis.json', { ...rankBase, semanticFingerprint: hash(canonical(rankBase)) });

const stability = {};
for (const [index, label] of labels.entries()) {
  const direction = dimensionAnalysis[label].usefulDirection;
  const passes = values(passRows, index);
  const leaveOneOut = blockRows.map(removed => { const kept = blockRows.filter(row => row.candidateId !== removed.candidateId).map(row => row.nativeLogits[index]); const raw = aucHigh(kept, passes); const auc = direction === 'higher BLOCK values' ? raw : 1 - raw; return { removedCandidateId: removed.candidateId, auc }; });
  const aucs = leaveOneOut.map(row => row.auc), min = Math.min(...aucs), max = Math.max(...aucs);
  stability[label] = { usefulDirection: direction, leaveOneBlockOut: leaveOneOut, minAuc: min, maxAuc: max, meanAuc: mean(aucs), standardDeviation: sd(aucs), largestDegradationWhenRemoved: leaveOneOut.filter(row => row.auc === min).map(row => row.removedCandidateId), largestImprovementWhenRemoved: leaveOneOut.filter(row => row.auc === max).map(row => row.removedCandidateId) };
}
const stabilityBase = { method: 'leave-one-BLOCK-reference-out descriptive stability diagnostic; not cross-validation', blockReferenceCount: 10, passControlCount: 73, dimensions: stability };
write('leave-one-block-out-stability.json', { ...stabilityBase, semanticFingerprint: hash(canonical(stabilityBase)) });

const patternNames = ['PARTIAL_EXPOSURE','SUGGESTIVE_PRESENTATION','NUDITY_EXPOSURE'];
const failureTypes = {};
for (const pattern of patternNames) {
  const subgroup = blockRows.filter(row => row.correctedG14BPatterns.includes(pattern));
  const dimensions = Object.fromEntries(labels.map((label, index) => { const block = values(subgroup, index), pass = values(passRows, index), high = aucHigh(block, pass), low = 1 - high; return [label, { blockReferenceCount: subgroup.length, block: stat(block), pass: stat(pass), usefulDirection: high >= low ? 'higher BLOCK values' : 'lower BLOCK values', auc: Math.max(high, low), completeSeparation: high === 1 || low === 1 }]; }));
  failureTypes[pattern] = { count: subgroup.length, candidateIds: subgroup.map(row => row.candidateId), descriptiveOnly: subgroup.length < 8, dimensions };
}
const failureBase = { warning: 'Overlapping frozen taxonomy; n=3 and n=1 subgroups are descriptive only and are not reliable performance estimates.', passControlCount: 73, patterns: failureTypes };
write('failure-type-analysis.json', { ...failureBase, semanticFingerprint: hash(canonical(failureBase)) });

const rankVectors = blockRows.map(row => ({ candidateId: row.candidateId, patterns: row.correctedG14BPatterns, usefulDirectionPercentiles: Object.fromEntries(labels.map(label => [label, rankDetails[label].blockReferences.find(item => item.candidateId === row.candidateId).usefulDirectionPercentile])) }));
const correlation = Object.fromEntries(labels.map(left => [left, Object.fromEntries(labels.map(right => [right, pearson(rankVectors.map(row => row.usefulDirectionPercentiles[left]), rankVectors.map(row => row.usefulDirectionPercentiles[right]))]))]));
const recurrence = Object.fromEntries(labels.map(label => [label, { outsidePassRange: rankDetails[label].summary.outsidePassRange, atOrAbove95thUsefulPercentile: rankDetails[label].blockReferences.filter(row => row.usefulDirectionPercentile >= 0.95).length }]));
const multiBase = { warning: 'Exploratory rank-vector structure only. No classifier, weights, combined score, or decision rule was fitted.', rankVectors, usefulDirectionRankCorrelationMatrix: correlation, recurringExtremeSignalCounts: recurrence };
write('multi-dimension-diagnostic.json', { ...multiBase, semanticFingerprint: hash(canonical(multiBase)) });

const rankedDimensions = labels.map(label => ({ label, ...dimensionAnalysis[label], stability: stability[label] })).sort((a, b) => b.auc - a.auc || b.stability.minAuc - a.stability.minAuc);
const strongest = rankedDimensions.slice(0, 3).map(row => ({ label: row.label, usefulDirection: row.usefulDirection, auc: row.auc, outsidePassRange: row.rangeOverlap.blockReferencesOutsidePassRange, completeSeparation: row.completeSeparation, looAucRange: [row.stability.minAuc, row.stability.maxAuc] }));
const strong = strongest.filter(row => row.auc >= 0.85 && row.outsidePassRange >= 7 && row.stability.minAuc >= 0.8);
const disposition = strong.length > 0 ? 'REDDESERT_COMPLEMENTARY_SIGNAL_REMAINS_PROMISING' : rankedDimensions[0].auc >= 0.7 ? 'REDDESERT_SIGNAL_USEFUL_BUT_TOO_OVERLAPPED_FOR_GATE' : 'REDDESERT_NOT_USEFUL_FOR_STHN_COMPLEMENTARY_GATE';
const finalBase = { status: 'G15D2_REDDESERT_OWNER_REVIEW_ANALYSIS_COMPLETE', disposition, groupCounts: { knownBlockReferences: 10, ownerConfirmedPassControls: 73 }, strongestDimensions: strongest, interpretation: disposition === 'REDDESERT_COMPLEMENTARY_SIGNAL_REMAINS_PROMISING' ? 'At least one native diagnostic dimension separated the fixed known residuals from deliberately extreme owner-confirmed PASS controls strongly and remained stable under leave-one-reference-out diagnostics. This is not a threshold or production decision.' : disposition === 'REDDESERT_SIGNAL_USEFUL_BUT_TOO_OVERLAPPED_FOR_GATE' ? 'Signals retain descriptive information, but overlap with owner-confirmed PASS controls prevents a defensible blocking-gate conclusion.' : 'The examined native diagnostics did not retain enough discrimination against owner-confirmed PASS controls to justify further complementary-gate development.', prohibitionsMaintained: ['no model inference', 'no threshold', 'no mapping', 'no training/tuning/calibration', 'no combined score', 'no unauthorized corpus'], sourceAuthorities };
const finalReport = { ...finalBase, semanticFingerprint: hash(canonical(finalBase)) };
write('final-report.json', finalReport);

const html = `<!doctype html><meta charset="utf-8"><title>G15-D2 Reddesert owner-review evidence</title><style>body{font:14px system-ui;margin:20px;color:#17212b}table{border-collapse:collapse;margin:12px 0}th,td{border:1px solid #bcc7d0;padding:5px;text-align:right}th:first-child,td:first-child{text-align:left}.note{max-width:1000px;color:#4b5863}code{font-size:11px}</style><h1>G15-D2 Reddesert owner-review evidence</h1><p class="note">Diagnostic only. No threshold, mapping, combined score, automated decision, or model fitting is presented.</p><h2>Native dimensions: known BLOCK references (n=10) vs owner-confirmed PASS controls (n=73)</h2><table><tr><th>native label</th><th>useful direction</th><th>AUC</th><th>rank-biserial</th><th>outside PASS range</th><th>complete separation</th><th>LOBO AUC range</th></tr>${rankedDimensions.map(row => `<tr><td>${row.label}</td><td>${row.usefulDirection}</td><td>${row.auc.toFixed(4)}</td><td>${row.rankBiserial.toFixed(4)}</td><td>${row.rangeOverlap.blockReferencesOutsidePassRange}/10</td><td>${row.completeSeparation}</td><td>${row.stability.minAuc.toFixed(4)}–${row.stability.maxAuc.toFixed(4)}</td></tr>`).join('')}</table><h2>BLOCK-reference useful-direction percentile rank against PASS controls</h2><table><tr><th>candidate</th>${labels.map(label => `<th>${label}</th>`).join('')}</tr>${rankVectors.map(row => `<tr><td>${row.candidateId}</td>${labels.map(label => `<td>${row.usefulDirectionPercentiles[label].toFixed(3)}</td>`).join('')}</tr>`).join('')}</table><p class="note">Known reference taxonomy is frozen and shown only in JSON analysis artifacts. Small subgroups, especially n=1 and n=3, are descriptive only.</p>`;
fs.writeFileSync(path.join(out, 'analysis-review.html'), html);

const artifactFiles = ['analysis-protocol.json','normalized-owner-review.json','joined-analysis-set.json','native-dimension-analysis.json','rank-separation-analysis.json','leave-one-block-out-stability.json','failure-type-analysis.json','multi-dimension-diagnostic.json','final-report.json','analysis-review.html'];
const artifactBase = { phase: 'G15-D2', status: finalReport.status, sourceAuthorities, files: Object.fromEntries(artifactFiles.map(name => [name, { sha256: fileHash(path.join(out, name)) }])), constraints: { modelInferenceRan: false, thresholdsCreated: false, mappingsCreated: false, trainingOrTuningPerformed: false, unauthorizedCorpusAccessed: false } };
write('artifact-manifest.json', { ...artifactBase, semanticFingerprint: hash(canonical(artifactBase)) });
console.log(JSON.stringify({ status: finalReport.status, ownerReviewSha256: sourceAuthorities.ownerReviewSha256, groups: finalReport.groupCounts, disposition, strongest, artifacts: Object.fromEntries([...artifactFiles, 'artifact-manifest.json'].map(name => [name, fileHash(path.join(out, name))])) }, null, 2));
