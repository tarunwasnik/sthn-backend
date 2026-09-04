# Profile Verification Gate 1 — Frozen Live-Anchor Policy

Status: frozen calibration policy only. This document does not activate or wire
Gate 1 into any production request, worker, database, Admin, or UI flow.

## Ordered requirements

1. Exactly five live captures must each satisfy the existing technical
   capture, detection, alignment, and embedding requirements.
2. For five technically usable captures, calculate each capture's median
   similarity to its other four captures. `weakestPeerMedian` is the minimum
   of those five medians.

## Frozen decision

`LIVE_ANCHOR_MIN_WEAKEST_PEER_MEDIAN = 0.28`

The live anchor passes coherence only when:

```text
weakestPeerMedian >= 0.28
```

There is no best-three, leave-one-out, subgroup, dynamic-threshold, or other
rescue path. A failed attempt is recovered only by a fresh five-capture live
verification session.

## Failure semantics

| Condition | Semantic result | Corrective action |
|---|---|---|
| Fewer than five technically usable captures | `LIVE_CAPTURE_TECHNICAL_FAILURE` | Reject the current live attempt; keep submitted profile media; require fresh live verification. |
| Five usable captures but `weakestPeerMedian < 0.28` | `LIVE_ANCHOR_INCOHERENT` | Reject the current live attempt; keep submitted profile media; require fresh live verification. |

Neither outcome is identity mismatch, fraud, misconduct, governance action,
suspension, ban, or a requirement to replace profile media.

## Calibration evidence

- Designation: same-dataset, source-disjoint, fresh-live-anchor calibration.
- Frozen manifest SHA-256:
  `1f6c26c429b3428fbd4ba2f50e516e2448a765eb5f3b7b228fd09ea623080115`
- Primary experimental unit: one unique five-capture anchor.
- Primary N: 600: 300 coherent same-identity, 150 mixed 4+1, and 150 mixed
  3+2 anchors.
- No source media overlapped Y4C/Y4F; all 600 new anchor compositions and
  source files were distinct. Identity labels necessarily overlap prior work.
- Among technically complete anchors at `.28`: genuine retries were 17/206
  (8.3%); mixed-control detection was 197/197 (100%).

Technical-incomplete anchors were intentionally excluded from that coherence
calculation because they fail the earlier technical requirement.

## Scope boundary

Gate 2 profile-media quality and Gate 3 profile-identity comparison remain
separate, future policy work. The existing avatar-only path, production SFace
threshold, Y4 membership threshold, and group margin are unchanged.
