# MHS review tranche V1

Status: `TRANCHE_PREPARED_REVIEW_WORKFLOW_READY_AWAITING_HUMAN_ANNOTATION`

- Tranche: `STHN_TEXT_MODERATION_MHS_REVIEW_TRANCHE_V1`
- Seed: `STHN-T6L-6J-MHS-REVIEW-TRANCHE-2026-09-08`
- Membership digest: `65919eed466aadc9175844d71f91799b17220795c01685211991036bc47e094b`
- Source revision: `5468f6e118396646b02a2f691e771f6b6d9502ea`
- Unique content groups: 3,000

## Allocation

Membership contains 800 disagreement/source-inconsistency rows, 600 violence/genocide rows, 600 protected-target plus dehumanization/high-score rows, 500 low-score contextual/counterspeech rows, and 500 non-hate-abuse/no-clear-protected-target rows. Selection is deterministic, uses source evidence rather than desired target labels, and removes duplicate `commentId` membership only within this tranche.

The selected source-score distribution is 770 high, 1,526 low, and 704 middle-region rows. There are 2,960 rows with a clear protected-target family and 40 without one. These are selection characteristics, not STHN labels.

## Historical preparation state

Reviewer A completed: 0. Reviewer B completed: 0. Agreements, disagreements, and adjudications: 0. All 3,000 rows remain unresolved with `piiStatus=REQUIRES_REVIEW`, `trainingEligible=false`, and `split=UNASSIGNED`. No transformations occurred. The public-reviewed-candidate artifact is empty.

Reviewer packets are separate and initially contain no judgments. Each submission must identify its A/B slot, use a distinct reviewer identity, attest independent review without access to the other judgment, and bind the judgment to the final text digest. Decision, primary category, or secondary-category disagreement routes to adjudication. Adjudication preserves both original reviews and requires a third identity.

PII must be cleared as `NONE`, redacted with recorded lineage before review, or excluded. A row becomes eligible only after resolved two-review agreement or adjudication, valid category assignment, final-text binding, and PII clearance. Future model input remains `text` only.

The preceding paragraphs record the frozen T6L-6J design and are retained as provenance. They are not the active review authority.

## Current single-reviewer authority

`STHN_TEXT_MODERATION_MHS_SINGLE_REVIEW_AUTHORITY_V1` supersedes the two-review requirement for the MHS pilot and continuing MHS workflow. Reviewer A is the sole human-review authority. The historical blank Reviewer B packet remains frozen but retired: active code must not populate, import, await, compare, or synthesize it.

Reviewer A `ALLOW` and `BLOCK` decisions satisfy the human-review-count requirement and may enter a resolved-candidate state only in a later explicitly authorized application phase. `NEEDS_ADJUDICATION` remains unresolved, and `EXCLUDE` remains excluded. PII is independent: `REQUIRES_REVIEW` prevents progression. This policy migration does not apply reviews to the frozen parent, create candidate rows, or make any row training eligible.

T6L-6J-C materializes those judgments only into an immutable derived resolution layer, `STHN_TEXT_MODERATION_MHS_REVIEW_RESOLUTION_V1`. It preserves the frozen parent and candidate output. Every derived row explicitly remains `candidateProgressionAllowed=false` and `trainingEligible=false`; candidate admission is a separate future authority.

T6L-6J-D applies `STHN_TEXT_MODERATION_MHS_REVIEW_CANDIDATE_ADMISSION_POLICY_V1` to that immutable resolution layer. Only resolved `ALLOW` or `BLOCK` rows with `piiDisposition=NONE` are admitted to the separate immutable candidate artifact. PII-review, adjudication, and exclusion states remain blocked. Candidate admission is not training eligibility: every candidate-layer row remains `trainingEligible=false`, with no split assignment or training operation.

T6L-6J-E audits only the 86 admitted candidate rows under `STHN_TEXT_MODERATION_MHS_CANDIDATE_INTEGRITY_AUDIT_POLICY_V1`. Exact and conservative normalized duplicate detection reuse the dataset identity framework without changing candidate text. Text-semantic comparison remains blocked because no authorized embedding detector exists, and frozen-benchmark contamination comparison remains deferred because no protected detection interface exists. This audit is descriptive and immutable; membership, judgments, PII dispositions, and `trainingEligible=false` remain unchanged.

T6L-6J-F adds a narrow evaluation-only protected detector for the frozen 140 suite. Exact, existing normalized-fingerprint, and conservative character-trigram Jaccard checks emit only opaque fixture references and bounded scores; fixture content never enters research artifacts or logs. Semantic tooling remains acquisition-gated, with `intfloat/multilingual-e5-small` recommended separately from the unchanged `FacebookAI/xlm-roberta-base` moderation authority. Candidate membership and `trainingEligible=false` remain unchanged.

T6L-6J-GX certifies an exact-revision, research-only multilingual-E5 ONNX export; T6L-6J-G then uses it with a frozen non-benchmark calibration corpus and a versioned bidirectional query/passage policy. The resulting immutable semantic audit contains only candidate identities, digests, existing judgments/categories, bounded scores, and review dispositions. It changes no membership, judgment, admission, or training-eligibility state and does not access the protected frozen benchmark.

No automatic mapping or mapping-version successor was created. `STHN_TEXT_MODERATION_PUBLIC_MAPPING_V1R2` remains current and canonical MHS staging remains untouched.
