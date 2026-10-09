# Multilingual E5 small GX semantic contract

`intfloat/multilingual-e5-small@053834db62d809d8f124a76b687fbd948e13ef3e` is certified only as auxiliary dataset-audit tooling. `FacebookAI/xlm-roberta-base` remains the moderation-model authority.

The pinned publisher example performs attention-mask-aware mean pooling over token-level hidden states and then L2-normalizes the pooled vectors before comparing them. GX deliberately exports only `last_hidden_state`; pooling, normalization, and cosine similarity remain explicit responsibilities of the later Node research adapter.

Publisher guidance requires `query:` and `passage:` prefixes for asymmetric retrieval and notes that inputs should use a prefix. Which prefix contract best represents symmetric near-duplicate comparison is therefore intentionally unresolved. T6L-6J-G must calibrate a documented symmetric policy using only non-frozen material before using the adapter for candidate comparison.

GX parity and tokenizer probes are independently authored harmless strings. They do not import, read, embed, or otherwise access the frozen 140 benchmark. No benchmark text or vectors are stored by this tooling.

## T6L-6J-G resolution

The non-frozen `STHN_E5_SEMANTIC_NON_FROZEN_CALIBRATION_V1` corpus compared passage/passage, query/query, and the bidirectional mean of query/passage plus passage/query. The bidirectional policy produced the strongest equivalent-versus-distinct pairwise ordering accuracy (`0.828125`) and median separation (`0.08866626984981185`), so G freezes `STHN_E5_SYMMETRIC_QUERY_PASSAGE_BIDIRECTIONAL_MEAN_V1`.

Every text is embedded once per prefix role and every unordered pair is scored as the mean of its two role orientations. This is a symmetric audit score, not a moderation score. The review-only bands are high confidence at `>= 0.94`, potential review at `>= 0.80`, and no signal below `0.80`. The high threshold exceeds every calibrated distinct score; the review floor exceeds every calibrated unrelated score. Policy-changing and same-topic hard negatives may intentionally enter the review band.

## T6L-6J-L current review policy

The paragraph above records the historical V1 audit contract. After the independently validated H+J replay, the current research-only routine semantic duplicate/near-duplicate review floor is `>= 0.85`. This floor selects pairs for human semantic investigation only. It is not a moderation, toxicity, hate, profanity, production-classifier, automatic duplicate, merge, deletion, or `semanticGroupId` threshold. The investigation boundary remains `0.85`, and the high-confidence signal remains `0.94` with no automatic merge authority.

## T6L-6A-X non-substitution boundary

The future moderation classifier now has its own immutable base authority: `FacebookAI/xlm-roberta-base@e73636d4f797dec63c3081bb6ed5c7b0bb3f2089`. That pin does not revise this E5 contract. E5 remains semantic-audit-only, and neither its checkpoint nor its tokenizer/preprocessing rules may be used as the classifier authority.
