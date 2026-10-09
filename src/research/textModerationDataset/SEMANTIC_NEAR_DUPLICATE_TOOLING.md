# Semantic near-duplicate tooling evaluation V1

Status: `SEMANTIC_TOOLING_REQUIRES_FUTURE_ACQUISITION`

Version: `STHN_TEXT_MODERATION_SEMANTIC_TOOLING_EVALUATION_V1`

This is an auxiliary similarity-tool recommendation, not a moderation-model decision. `FacebookAI/xlm-roberta-base` remains the selected STHN moderation base model. No model or dependency was acquired by T6L-6J-F.

## Runtime and candidates assessed

The current runtime is Node 20.19.6 with `onnxruntime-node` 1.27.0 and `tokenizers` 0.23.2. No tracked text-embedding artifact exists. The ignored ToxiScan, HikmaAI, and Gravitee artifacts are task classifiers and are not authorized sentence encoders; Face AI embeddings are isolated and inapplicable.

| Option | Coverage and quality | Node deployment | Size and license | Result |
| --- | --- | --- | --- | --- |
| Existing repository artifacts | Classifier-specific representations; no stable sentence-similarity contract | Runtime exists, but artifacts are not suitable or authorized | Already cached; licenses are unrelated to a new embedding authority | Reject for semantic similarity |
| `intfloat/multilingual-e5-small` | Purpose-built multilingual embeddings; published coverage includes English, Hindi and Thai, with cross-lingual usefulness for Hinglish subject to a future calibration audit | Export/acquire ONNX once, load `tokenizer.json` with the existing tokenizer runtime, perform documented mean pooling and L2 normalization, then cosine similarity | MIT; approximately 471 MB FP32 weights plus a 17 MB tokenizer; an int8 ONNX is expected near 120–150 MB | Recommended, acquisition required |
| Hidden-state pooling from `FacebookAI/xlm-roberta-base` | Broad multilingual encoder, but masked-language pretraining does not establish sentence-similarity calibration | Technically possible through ONNX Runtime, but larger and requires an unvalidated pooling contract | MIT; roughly 1.1 GB FP32 | Do not use as the default similarity tool; moderation-base selection remains unchanged |
| Character-trigram Jaccard | Language-agnostic surface similarity, deterministic, dependency-free | Already implemented inside the protected detector | No artifact | Retain as conservative fallback, not semantic equivalence |

## Recommendation and future acquisition contract

Recommend `intfloat/multilingual-e5-small` at repository revision `053834db62d809d8f124a76b687fbd948e13ef3e`, subject to a separately authorized acquisition phase that re-verifies the revision, MIT license, files, hashes, pooling contract and tokenizer behavior. Expected ignored layout:

- `model-cache/text-moderation/semantic/intfloat-multilingual-e5-small/<revision>/model.int8.onnx`
- `model-cache/text-moderation/semantic/intfloat-multilingual-e5-small/<revision>/tokenizer.json`
- pinned manifest containing every artifact SHA-256 and runtime version.

The acquisition phase must benchmark deterministic CPU latency and cosine repeatability for English, Hindi, Hinglish and Thai; define candidate-to-candidate and protected-comparison thresholds on a separate calibration set; and ensure frozen fixture text remains inside the protected detector. Thresholds must not be tuned on the frozen 140 suite.

## T6L-6J-GX certification addendum

The status above is the immutable T6L-6J-F evaluation status. T6L-6J-GX subsequently acquired the exact pinned source revision, produced a byte-repeatable opset-17 ONNX export, and certified PyTorch parity plus Node CPU compatibility. The ignored authority is `evaluation-cache/text-moderation/semantic/intfloat-multilingual-e5-small/053834db62d809d8f124a76b687fbd948e13ef3e/STHN_E5_SMALL_ONNX_EXPORT_MANIFEST.json`. The permanent export contract and recipe live under `semanticSimilarity/`.

GX did not implement similarity calibration, candidate comparison, or protected semantic comparison. Those remain bounded follow-up work in T6L-6J-G, and the symmetric E5 prefix policy remains explicitly unresolved pending non-frozen calibration.

T6L-6J-G subsequently resolved the symmetric policy as the bidirectional mean of query/passage orientations using the independently authored 44-pair calibration corpus. Its immutable 86-candidate audit compared all 3,655 unordered pairs and emitted review metadata only. No high-confidence duplicate signal was found; the broad potential-review band produced 1,237 signals, including 543 ALLOW/BLOCK and 195 differing BLOCK-classification signals. This volume is evidence that later human validation must treat the band as prioritization—not duplicate truth—and assess precision before any dataset action.

## T6L-6J-H semantic review packet

T6L-6J-H prepares—but does not complete or import—a deterministic 150-pair precision-validation packet from the G findings. Membership is bound to semantic artifact SHA-256 `aa3d24ebba90d6ea7eb0a8f491ceb7b0e8e98c6f08c7e865701dbde6f591a998`, payload digest `f56f3e05503c7f54e6ca0a82673c2d168834104f5790311a7926a8f442d2a303`, and seed `STHN-T6L-6J-H-SEMANTIC-REVIEW-2026-09-11`.

The reviewer-facing CSV is blinded: it contains exact candidate texts and identities plus a score bucket, but no exact score, moderation decision, category, source MHS score/label, suggested answer, or calibration expectation. The separate internal manifest retains those fields for later aggregate precision analysis. The only permitted human outcomes are `DUPLICATE`, `NEAR_DUPLICATE`, `RELATED_BUT_DISTINCT`, `UNRELATED`, and `NEEDS_ADJUDICATION`.

Generated packet material lives under ignored `dataset-research/text-moderation/MEASURING_HATE_SPEECH/semantic-review/`. The validator binds every immutable CSV field and requires one stable reviewer identity, strict UTC ISO timestamps, and notes of at most 500 characters. Validation returns detached review records only; it cannot merge, remove, relabel, admit, or make candidates training-eligible.

## T6L-6J-I human precision validation

The corrected 150-row Reviewer A submission passed the frozen H parser without normalization. Human outcomes were 0 duplicate, 2 near-duplicate, 33 related-but-distinct, 115 unrelated, and 0 needing adjudication. Duplicate-like precision within this deterministic stratified packet was therefore 1.3333% at the existing 0.80 review floor and 10.5263% for the 19 reviewed pairs at 0.85+. Both duplicate-like judgments occurred at 0.85+, but this is packet-only evidence and not population recall.

The ignored validated-review and precision-analysis artifacts preserve human inputs and provenance without applying them to candidate state. They recommend investigating 0.85 as a future review floor on independent evidence. The existing 0.94 high-confidence signal remains unchanged, and no automatic duplicate threshold is established. Candidate membership remains 86, moderation judgments remain 58 ALLOW / 28 BLOCK, and training eligibility remains zero.

## T6L-6J-J independent boundary packet

The H packet exhausted all 19 observed pairs at 0.85+, so J does not claim a second top-band holdout. It excludes all 150 H unordered-pair identities and prepares 75 previously unreviewed pairs immediately below the proposed boundary: all 33 available pairs at 0.84–<0.85, 27 at 0.83–<0.84 after reallocating the unavailable primary-stratum capacity, and 15 at 0.82–<0.83.

The reviewer CSV provides exact pair text and identity but hides score, score stratum, moderation decisions, categories, source labels, and prior human results. The internal manifest retains audit metadata and binds semantic, H, and I authorities. This preparation changes no threshold or candidate state and performs no human review.

## T6L-6J-K boundary validation and reviewed-sample evidence

The exact 75-row Reviewer A completion is validated against J membership and immutable source identities without label normalization. K publishes separate ignored, immutable validated-review and analysis artifacts. H and J remain disjoint, and their 225 reviewed pairs are combined only for descriptive outcome, score-region, and prospective review-floor tables.

The J holdout contains no `DUPLICATE` or `NEAR_DUPLICATE` judgments below `0.85`. Consequently, the analysis records `0.85_SUPPORTED_FOR_FUTURE_REVIEW_FLOOR_CHANGE` as a recommendation for a later explicitly authorized phase. It does not modify the current `0.80` review floor or `0.85` investigation boundary. The `0.94` high-confidence signal is retained unchanged; no automatic merge is authorized. These findings are conditional on deterministic stratified packet membership and are not population recall across all 3,655 pairs.

## T6L-6J-L review-floor authorization

L authorizes `0.85` as the current minimum similarity for routine semantic duplicate/near-duplicate review consideration. The replay compared the immutable V1 `0.80` authority with `0.85`: routine signals fall from 1,237 to 19, while all 2 known near-duplicates remain and no known duplicate-like judgment is lost. Across H+J, 206 reviewed pairs below `0.85` contain 52 related-but-distinct and 154 unrelated judgments, with no duplicate-like or unresolved outcome. Reviewed-sample duplicate-like yield rises from 0.8889% to 10.5263% while retention of known duplicate-like findings remains 100%.

This evidence is conditional on deterministic stratified H/J samples and is not population recall across all 3,655 pairs. Future datasets may require recalibration. Semantic similarity never overrides human moderation judgment. The `0.94` signal remains unchanged, and no automatic merge, deletion, grouping, candidate mutation, or training eligibility is authorized.

## T6L-6J-M reviewed semantic application contract

Only a canonical pair bound to unchanged candidate IDs/digests and a validated Reviewer A outcome of `DUPLICATE` or `NEAR_DUPLICATE` is eligible for a future semantic edge. `RELATED_BUT_DISTINCT` remains analysis evidence, `UNRELATED` creates no edge, and `NEEDS_ADJUDICATION` fails closed. Neither `0.85` nor `0.94` can create an edge without human authority.

Future semantic connectivity belongs to `semanticGroupId`; it does not replace source-native `nearPairGroupId`, template provenance, exact/normalized duplicate identity, or source/transformation lineage. Connectivity is transitive only for future split isolation: A–B and B–C can require A/B/C to share a split without declaring A and C near-duplicates. Exact-pair contradictions block application, duplicate authority replay is rejected, and an unrelated or unresolved reviewed pair inside a proposed component is a blocking transitive tension.

The current dry run contains two reviewed near-duplicate edges over three distinct BLOCK candidates, forming one hypothetical size-three component. It has no ALLOW/BLOCK or primary-category collision and intersects no existing group. The differing secondary-category sets are surfaced without propagation or resolution. No candidate, group, split, moderation label, or training state is modified.

## T6L-6J-N authoritative external grouping overlay

N independently re-resolves H and J against the unchanged candidate identities, text digests, current 0.85 semantic audit, integrity audit, L authorization, and M contract. It authorizes exactly the two human-reviewed H `NEAR_DUPLICATE` pairs and publishes them as applied edges in `mhs-semantic-grouping-overlay-v1.json` (SHA-256 `e2c0aac1e43940f369b689beb34cdc4ec68725de49b6ec0858e06167d2b15a13`, payload digest `96fd484ed35d188fd4047b2ddc9fe46b71db041c0325c4ea8fd657a606f75d3c`).

The stable component ID is `semantic_c32e7ed90a780088962832718f5cf1e1285a582608a4daa3f27d2b5ebe109a5b`. It is derived from the policy version, sorted three-member candidate identity set, and sorted authoritative edge IDs; timestamps and input ordering cannot change it. The overlay does not assert a reviewed relationship for the unreviewed outer member pair. Connectivity means only that all three members must remain together when a later phase creates dataset splits.

The overlay is external to the 86-row candidate artifact. Candidate `semanticGroupId` values remain unwritten, moderation remains 58 ALLOW / 28 BLOCK, and no candidate is merged, removed, relabeled, assigned to a split, or made training-eligible. The frozen 140-fixture benchmark is not accessed.

## T6L-6J-O grouping union and split-planning dry run

O freezes the candidate, integrity, current semantic audit, M contract, and N overlay authorities, then builds a singleton-inclusive union graph for future leakage prevention. Exact duplicate, normalized duplicate, reviewed semantic, source-native near-pair, template-family, and lineage edges retain separate ownership contracts. Only the N-reviewed semantic authority is populated in the current MHS universe: two edges form one size-three component; the other 83 candidates are singleton components. Component membership means only `MUST_REMAIN_TOGETHER_IN_FUTURE_SPLITS` and never propagates labels or invents the unreviewed semantic A-C relationship.

The immutable ignored plan is `grouping/mhs-grouping-union-split-plan-v1.json` (SHA-256 `50cbd0b7dfa906f9861219ba25d38fbc73e453a4a89f50e157970cec95750879`, payload digest `6027e84a1072a3d2aaa3017a4c44dfa00595942013b260efcc9176f2cdda57ca`). Its deterministic seed is `STHN-T6L-6J-O-GROUPING-UNION-SPLIT-PLAN-V1`. Both hypothetical plans preserve every component and hit their integer targets exactly: 69/9/8 candidates for 80/10/10 and 60/13/13 for 70/15/15. The 70/15/15 option is recommendation-only because this small universe benefits from larger evaluation partitions.

## T6L-6J-P authoritative external split manifest

P converts only O's accepted 70/15/15 plan into an immutable external membership authority. Before publication it independently revalidates the candidate, integrity, current semantic audit, L authorization, M application contract, N overlay, and O plan; rebuilds the 86-node union graph; and exactly replays the pinned planner and seed. The published manifest has SHA-256 `f9f2598cd63da5a64997c7741461b76ac738db0f41b9be44ba75822cb1deb37f`, payload digest `6bd08aa1b9d84dffd9ab1fc65b87a565d521156ca805cd7c0d090fbb01b30759`, and stable ID `mhs_split_a02e8b27520a1ef535e216bc6a75547b53d76dae5b2f91425d8ca0d784ee2dbc`. It assigns 60/13/13 candidates across 60/13/11 whole components, with ALLOW/BLOCK counts 40/20, 9/4, and 9/4. The reviewed three-member semantic component remains wholly in INTERNAL_TEST. Candidate rows remain physically unassigned, all 86 remain `trainingEligible=false`, and neither training, tuning on INTERNAL_TEST, release, nor final benchmark freezing is authorized.

Current coverage is intrinsically limited: every candidate is English and from MEASURING_HATE_SPEECH, domain authority is unavailable, and the sole THREAT_OR_VIOLENCE candidate cannot occur in every split. P's external manifest, rather than candidate fields, is the split authority. The frozen 140 provider-evaluation fixture suite remains separate and excluded, candidate rows remain byte-identical and physically unassigned, and training eligibility remains zero.

## T6L-6J-Q INTERNAL_TEST freeze and access control

Q freezes P's exact INTERNAL_TEST membership in `splits/mhs-internal-test-freeze-v1.json` (SHA-256 `11036dd1961e709d77804123b3efdbafd6c083617ded6f608f674b1c0fedbc36`, payload digest `23392bc4123a36fff1c5969c9bf01f7736105fc853a6fffac8d280e78b7464cb`, protected membership digest `618fcec63bd963884e97efc353b2390f891f2c925103cca52be1f4df5180fd13`). The freeze contains 13 candidates across 11 complete components, including the intact three-member reviewed semantic component. Membership changes require a new dataset/split version, explicit authorization, a new immutable artifact, and new hashes; in-place editing is prohibited.

The repository guard denies INTERNAL_TEST use for training, fine-tuning, generation seeds, threshold selection, model selection, early stopping, calibration, balancing, feature engineering, and repeated development. Final internal evaluation requires separate explicit authorization; routine inspection is metadata-only. VALIDATION remains the separately gated development-evaluation split and TRAIN remains subject to later training-eligibility gates. Q runs no evaluation and grants no training eligibility. The frozen 140 provider benchmark remains a separate protected authority and is neither read nor merged by Q.

## T6L-6J-R TRAIN eligibility-gate audit and release-plan dry run

R publishes only the immutable planning artifact `release/mhs-training-eligibility-release-plan-v1.json` (SHA-256 `7e8dfe0da98201e2a80e5c4d01b35a3d21ff48096d46420a33b248aea9b3fb19`, payload digest `92c901ecf93c9f45a956ab94e2502b2a353b49c0f7dfc0f613820658c67cb985`). It independently verifies the candidate bytes and integrity view, P split, Q freeze, grouping authorities, current semantic audit, contamination audit, acquisition provenance, and license registries before evaluating bounded A-I gates for annotation resolution, label integrity, PII disposition, provenance, grouping isolation, contamination, lineage, and data quality.

The dry run finds 60/60 TRAIN members qualifying pending release authorization and 13/13 VALIDATION members ready pending separate development-use authorization, with zero blockers or partial-component findings. The hypothetical release contract requires authority hashes, per-member evidence digests, distributions, attribution and change notice, explicit authorization, and fail-closed loaders. R does not grant that authorization: candidate membership and bytes remain unchanged, `trainingEligible` remains false for all 86 candidates, no release or training files are produced, and no training or evaluation runs. Protected INTERNAL_TEST content is never loaded or emitted; only its Q-bound manifest ID, membership digest, and count are carried. The frozen 140 provider benchmark remains separate and unaccessed.

## T6L-6J-S immutable release and external eligibility authority

S authorizes `STHN_TEXT_MODERATION_DATASET_MHS_V1` / `MHS_DATASET_RELEASE_V1` through a transactionally published pair. `release/mhs-training-eligibility-manifest-v1.json` (SHA-256 `2a7b930123607fdf14dd18be6c03f2976ab3d7e23977158e2a9a255214b97322`, payload digest `ae30718bcbe9d65db198769aa5f5d28188d3fa517365a89478a3a5cf75e5f655`) records the 60 TRAIN and 13 VALIDATION candidate identities, text digests, R evidence digests, and bounded external statuses. It has no authority without the matching `release/mhs-release-manifest-v1.json` (SHA-256 `d318d6ec929477beb77f624b47bd09280498a0d0e20426c89dfd1c0620034d96`, payload digest `d6f335e0a898dc8b75db2c32de4dee5116e6b70d6649445b750468700b44d471`), which is published last as the commit authority and binds the eligibility SHA and payload digest.

Future training access requires matching candidate identity and digest, authoritative P TRAIN membership, the current release identity, and `TRAINING_ELIGIBLE`; future validation access equivalently requires authoritative VALIDATION membership and `VALIDATION_AUTHORIZED`. Every other split, missing/stale/blocked authority, and every INTERNAL_TEST identity fails closed. Q's protected 13-member digest is carried without protected text or per-record eligibility enumeration. Candidate rows remain byte-identical with `trainingEligible=false`; release-level `datasetVersion` is reserved for future materialization-time injection. Measuring Hate Speech attribution, the CC BY 4.0 link, pinned source revision, and STHN change notice are mandatory. S materializes no training content and performs no training, validation evaluation, INTERNAL_TEST evaluation, or frozen-140 access.

## T6L-7A0 protected candidate storage partitioning

The canonical candidate authority stores all 86 admitted texts in one monolithic artifact, so ordinary 7A materialization could not honor Q without a narrower storage boundary. T6L-7A0 introduces only `TRUSTED_DEVELOPMENT_PROJECTION_PARTITIONING`: after hash and set validation, this one-purpose partitioner may parse the canonical artifact, emit the 73 S-authorized TRAIN/VALIDATION rows, and discard the 13 protected rows without returning, logging, or serializing their text.

## T6L-7A authorized materialization and loader boundary

T6L-7A consumes `development/mhs-development-text-projection-v1.jsonl` as its sole ordinary text authority. It deterministically filters the already-authorized membership into 60 TRAIN and 13 VALIDATION JSONL rows, ordered by candidate ID, and publishes both artifacts with the immutable materialization manifest as the final commit marker. It never accepts a candidate-artifact path.

The materialization row retains all projection audit fields and adds a materialization schema binding plus `target` (`ALLOW = 0`, `BLOCK = 1`). Audit loaders return the verified materialized rows. The separate model boundary returns only `{ text, target }`, preventing candidate IDs, split metadata, provenance, reason codes, categories, and other audit metadata from becoming classifier features.

The loader first pins and verifies manifest and split artifact bytes before JSON decoding, then revalidates every identity against the 7A0 projection, P split authority, S eligibility authority, and Q protected-ID set. TRAIN cannot accept VALIDATION, protected, unknown, duplicate, stale, reordered, malformed, or modified rows; VALIDATION applies the symmetric rule. There is no INTERNAL_TEST loader or materialization, and no frozen-140, tokenizer, model, training, evaluation, threshold, frontend, production moderation, Face AI, Image AI, database, or deployment integration in this phase.

The immutable candidate-ID-ordered projection is `development/mhs-development-text-projection-v1.jsonl` (SHA-256 `9a75ebe2ffa102dddee7235ed69fafbf94d9cad03e603e9e65303e31e73f9ba1`, payload digest `d0c305dcf4f766a7929ae5d3cf1d6776db5271d69aced7d438579e40efb7cf86`); its commit manifest has SHA-256 `4d28be01c003fd089f51c9472fd8bf417b89dfd72130e47fcd9b6e1b389ea95a` and payload digest `77c7a8cf6840de4b6abcede22bf13f36b063b1a05ce82365896bd6b55ae4abd7`. The ordinary reader validates only this projection plus P/Q/S metadata and has no candidate-file parameter. The monolithic authority remains canonical and byte-identical, no protected artifact was created, and 7A0 performs no model preprocessing, training, or evaluation.

Primary references: [multilingual-e5-small model card](https://huggingface.co/intfloat/multilingual-e5-small), [pinned revision and artifact sizes](https://huggingface.co/intfloat/multilingual-e5-small/tree/053834db62d809d8f124a76b687fbd948e13ef3e), and [XLM-R base model card](https://huggingface.co/FacebookAI/xlm-roberta-base).

## T6L-6A-X classifier authority separation

The moderation-classifier base is now independently pinned to `FacebookAI/xlm-roberta-base@e73636d4f797dec63c3081bb6ed5c7b0bb3f2089`. Its canonical classifier authority SHA-256 is `ca9cd876c9facd4b310a5cd9f09385113ce3e8c1376d2e5fd0a3b654ff2a17f1`, with payload digest `7b4b87ad743613f453932d67661c563fa9d6c820229d4f94d1999e34b2cab9d0`. Only configuration and tokenizer artifacts were acquired; no classifier or masked-LM weights were downloaded.

This does not change the E5 semantic authority, semantic scores, review floor, grouping overlay, or protected-comparison policy. `FacebookAI/xlm-roberta-base` is authorized for the future binary moderation classifier; `intfloat/multilingual-e5-small@053834db62d809d8f124a76b687fbd948e13ef3e` remains auxiliary semantic-audit tooling. Their revisions, artifacts, tokenizers, preprocessing contracts, and purposes are intentionally non-interchangeable.
