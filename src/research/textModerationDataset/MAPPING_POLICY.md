# STHN public mapping history and current authority

Current research preview authority: `STHN_TEXT_MODERATION_PUBLIC_MAPPING_V1R2`, applying `STHN_TEXT_MODERATION_POLICY_V1` to public-source evidence. V1 and V1R remain immutable historical preview authorities. No version is authority to apply full-corpus labels unless a later phase explicitly authorizes application. Source labels never define STHN policy, and dataset `NEEDS_REVIEW` is unrelated to production `UNAVAILABLE`.

## T6L-6I Measuring Hate Speech audit

T6L-6I reviewed a deterministic, digest-bound sample of 300 content groups (one pseudonymous audit `commentId` per source `comment_id`). The audit deliberately spans publisher score regions, annotation agreement/disagreement, dehumanization, insult/humiliation, violence, genocide, attack/defend constructs, protected/no-clear-protected targets, contextual/counterspeech candidates, non-hate abuse candidates, and component inconsistencies. Annotator demographics are absent from the audit contract.

The single policy review produced 106 `ALLOW`, 172 `BLOCK`, 21 `NEEDS_ADJUDICATION`, and one `EXCLUDE`. These are stratified research observations, not population prevalence estimates. In the source-defined high-score region, counterfactual automatic-block precision was 0.9651 but three confirmed allows, unresolved rows, category collisions, enriched sampling, and lack of two-review evidence prevent certification. Only 0.4217 of high-score blocks included `HATE`. In the low-score region, counterfactual automatic-allow precision was only 0.7864. No score threshold or construct combination is therefore an STHN mapping rule.

No automatic candidate and no V1R3 draft were created. V1R2 remains current and all MHS rows remain `NEEDS_REVIEW` in preview. The source is valuable as a manually reviewed pool, especially for disagreement, threat-first, non-hate-abuse, category-collision, and context examples. A first future annotation tranche of 3,000 deduplicated content groups is recommended; current authority requires human resolution of all 39,565 groups before any row can enter an adjudicated training split.

## T6L-6J review-tranche preparation

T6L-6J froze a deterministic 3,000-comment MHS tranche with digest `65919eed466aadc9175844d71f91799b17220795c01685211991036bc47e094b`. It implements separate blind Reviewer A and Reviewer B slots, distinct-identity and independence declarations, final-text digest binding, exact category agreement, immutable adjudication, PII gating, and redaction lineage. No independent human reviews occurred during implementation: all rows remain `AWAITING_HUMAN_REVIEW`, no row is training eligible, and the reviewed-candidate artifact is empty. V1R2 remains unchanged.

That paragraph is retained as T6L-6J provenance. `STHN_TEXT_MODERATION_MHS_SINGLE_REVIEW_AUTHORITY_V1` is now the active MHS authority: Reviewer A alone satisfies the human-review-count requirement, Reviewer B is retired, and no A/B comparison is required. `NEEDS_ADJUDICATION`, `EXCLUDE`, and unresolved PII remain non-progressing. The already validated Reviewer A artifact remains immutable; applying its decisions to candidate rows and deciding training eligibility require a later explicit phase.

## V1R2 outcome after independent certification

T6L-6H independently reviewed every V1R-eligible Hatemoji row not present in the T6L-6G audit: 153 dehumanizing rows, 122 identity-threat rows, and one non-protected `wc` threat. None could reach the required 300 conclusive independent rows. The dehumanizing rule also produced four confirmed contextual false blocks and two threat-first category collisions; the identity-threat rule produced four category collisions. V1R2 therefore demotes all Hatemoji rows to `NEEDS_REVIEW`. It defines no automatic `ALLOW` or `BLOCK` rule.

MHS is acquired provenance-only and also remains `NEEDS_REVIEW`; publisher measurements are not STHN decisions. ToxiGen remains review-only after T6L-6G. Civil Comments remains access-blocked.

## Historical V1 preview rules

- HatemojiBuild: only source-confirmed `threateninglanguage` and `dehumanizinglanguage` hate with a non-`none` target preview as `BLOCK/HATE`. Threatening rows also carry `THREAT_OR_VIOLENCE`. Animosity, derogation, counterexamples, compound targets, and other context remain `NEEDS_REVIEW`. `label_gold=0` is not broad evidence of STHN `ALLOW`.
- ToxiGen annotated: `label=hate`, human toxicity at least 4, and intent at least 4 preview as `BLOCK/HATE`. Four is an intentionally conservative STHN preview band on the source's 1–5 scales, not a claim that the publisher defines 4 as its threshold. Missing-label test rows, benign labels, lower scores, disagreement, framing, lewdness, and stereotype evidence remain `NEEDS_REVIEW`.
- Civil Comments: every row remains `NEEDS_REVIEW` in V1. Each score is the fraction of annotators selecting that attribute. Candidate future bands must be approved from a mapping audit: near-unanimous low values across all seven fields may support high-confidence `ALLOW`; near-unanimous `identity_attack` may support `HATE`; near-unanimous `threat` may support `THREAT_OR_VIOLENCE`; intermediate scores remain review. No numeric boundary is authorized yet. `obscene` cannot automatically become contextual `PROFANITY`, and `sexual_explicit` cannot automatically become marketplace sexual solicitation.
- Measuring Hate Speech: every content-level `comment_id` remains `NEEDS_REVIEW` in V1. The publisher describes `hate_speech_score > 0.5` as approximately hate speech, `< -1` as counter/supportive, and the intervening band as neutral or ambiguous. These are source interpretations, not STHN rules. Future STHN rules must aggregate repeated annotations without discarding disagreement and audit violence, genocide, dehumanization, insult, humiliation, attacking/defending, target flags, annotation count, and dispersion. Annotator demographics remain restricted and never become features.

No source supports `OTHER_INAPPROPRIATE`. The validator rejects rules assigning a category marked `NOT_SUPPORTED` in the source/category matrix.

## Human review and mapping audit

Automatic preview rules are candidates until audited; no mapped result enters training in this phase. Review priority is: source/schema disagreement; identity-sensitive benign or harmful language; Hatemoji non-direct/compound targets and matched-pair inconsistencies; ToxiGen missing labels, moderate scores, AI/human disagreement, or synthetic artifacts; Civil Comments intermediate scores, identity mentions, obscene/sexual/threat context; and Measuring Hate Speech high annotator disagreement or conflicting construct fields.

Use a separate, deterministic mapping-audit sample—not the frozen 140 and not training data. Recommended first audit is 1,080 rows: 240 Hatemoji, 240 ToxiGen, 300 Civil Comments after acquisition, and 300 Measuring Hate Speech after acquisition. Within each source stratify across every preview outcome/rule, identity-sensitive cases, source-native splits, rare labels/targets, hard/context cases, and paired/disagreement strata. Oversample every automatic `BLOCK` rule and review at least 100 rows or 10% of the rule, whichever is smaller. The former two-independent-reviewer recommendation is historical and is superseded for the active MHS workflow by `STHN_TEXT_MODERATION_MHS_SINGLE_REVIEW_AUTHORITY_V1`. Only a later explicitly authorized mapping revision may introduce automatic `ALLOW` or additional category rules.
