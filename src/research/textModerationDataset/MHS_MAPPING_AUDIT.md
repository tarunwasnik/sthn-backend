# Measuring Hate Speech policy-mapping audit V1

Audit authority: `STHN_TEXT_MODERATION_MHS_MAPPING_AUDIT_V1`
Seed: `STHN-T6L-6I-MHS-AUDIT-2026-09-08`
Membership digest: `395316f4f8fc1bc0fc6bc0cf620f22d90ed17d4c7b6339e3d50f6358c2e01c2d`

The audit contains 300 unique content groups selected from 39,565 provenance-staged MHS comments. Selection and review operate at content level only. Repeated annotations contribute aggregate construct, target, and disagreement evidence; they are not separate training examples. The audit exposes no annotator demographics and assigns no full-corpus labels.

## Result

The completed first policy review found 106 `ALLOW`, 172 `BLOCK`, 21 `NEEDS_ADJUDICATION`, and one `EXCLUDE`. Its block categories were 68 `HATE`, 54 `ABUSIVE_OR_HARASSING`, 29 `SEXUAL`, 25 `THREAT_OR_VIOLENCE`, and two `PROFANITY`; counts include secondary categories. This demonstrates substantial mismatch between the source's hate measurement and STHN's bounded category contract.

The source-defined high-score region had 83 blocks, three allows, four rows needing adjudication, and one exclusion among 91 sampled rows. Treating the conclusive portion as an automatic block would yield 0.9651 precision, below a zero-false-block acceptance standard; only 0.4217 of its blocks included `HATE`. The low-score region had 81 allows, 22 blocks, and ten rows needing adjudication among 113 sampled rows, only 0.7864 counterfactual automatic-allow precision. The middle region was also mixed. Because the audit is deliberately enriched and strata overlap, these figures describe audited support, not source-wide prevalence.

No automatic rule is proposed. All rule-supporting evidence would require two independent reviews and adjudication of disagreements; this audit has one review per row and is ineligible for automatic-rule certification. `STHN_TEXT_MODERATION_PUBLIC_MAPPING_V1R2` remains unchanged.

## Manual-review value

A future first tranche should review 3,000 deduplicated groups: 800 disagreement/inconsistency, 600 violence/genocide, 600 protected-target plus dehumanization/high-score, 500 low-score contextual/counterspeech, and 500 non-hate-abuse/no-clear-protected-target candidates before overlap deduplication. Cap dominant targets and score bands, oversample the rare no-clear-protected-target pool, preserve platform diversity, and use threat-first adjudication. Exclude unresolved PII, incoherent/context-insufficient material, annotator demographics, and any row lacking an adjudicated STHN label.

Ignored local artifacts `mhs-mapping-audit-v1.jsonl` and `mhs-mapping-audit-v1-summary.json` contain the detailed audit and aggregate report. They are research-only and do not mutate canonical staging.
