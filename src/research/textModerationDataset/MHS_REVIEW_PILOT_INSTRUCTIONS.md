# MHS Human Review Pilot V1

Status: **single-reviewer policy active**. Reviewer A is the sole human-review authority. A validated review still confers no training eligibility until a later explicit eligibility phase.

## Independence and handling

- Reviewer A completes the Reviewer A CSV as the sole authorized human reviewer. No second reviewer is required or permitted by the active workflow.
- Work without access to source labels, source scores, automatic suggestions, or previous audits.
- Preserve every identity, text, digest, version, role, and current-PII column exactly. Edit only columns ending in `_input`.
- Use the text as presented. Do not infer author identity or demographic attributes and do not use external demographic information.
- Keep the CSV header, row order, and exactly 100 rows. Save as UTF-8 CSV.

Enter the same stable reviewer identifier on every row. Enter `INDEPENDENT_REVIEW_WITHOUT_PRIOR_JUDGMENT_ACCESS` in every independence declaration cell and an ISO-8601 timestamp in every reviewed-at cell.

## Decisions

- `ALLOW`: text is acceptable for an STHN public-profile/service context, including quoted, reporting, condemning, educational, reclaimed, or otherwise benign context where applicable.
- `BLOCK`: text violates STHN public-profile/service policy. A primary category is required.
- `NEEDS_ADJUDICATION`: a good-faith policy decision cannot be made confidently. Do not enter categories.
- `EXCLUDE`: the row is unusable as training material because of data quality, PII, context deficiency, corruption, or another approved exclusion reason. Do not enter categories.

For `BLOCK`, choose one primary category and optionally add distinct secondary categories separated by semicolons. Do not repeat the primary category as a secondary category.

## Categories

- `PROFANITY`: direct obscene or profane expression that is inappropriate in the marketplace context.
- `SEXUAL`: explicit or inappropriate sexual content.
- `ABUSIVE_OR_HARASSING`: targeted insult, degradation, bullying, or harassment not better captured as protected-group hate.
- `HATE`: attack, dehumanization, exclusion, or hateful meaning aimed at a protected group or a person because of a protected characteristic.
- `THREAT_OR_VIOLENCE`: credible or expressive threats, advocacy of violence, or violent harm.
- `OTHER_INAPPROPRIATE`: policy-violating content not accurately captured above; explain briefly in the note.

`OTHER_INAPPROPRIATE` should normally not be used for generic MHS content.

Judge meaning and context, not isolated keywords. Sensitive identity words alone are not violations. Educational, reporting, and counterspeech contexts can be allowed; benign medical, safety, and historical discussions can also be allowed. Direct public profanity presented as the user's own expression can be blocked. Sexual-service solicitation, targeted abuse or harassment, protected-group hate, and genuine threats or advocacy of violence are blocked. When both threat and hate genuinely apply, use `THREAT_OR_VIOLENCE` as the primary category and `HATE` as secondary. Grammar, dialect, slang, emoji, and non-native English alone are never violations.

## Reason codes

Use exactly one: `POLICY_ACCEPTABLE`, `DIRECT_PROFANITY`, `SEXUAL_CONTENT`, `TARGETED_ABUSE`, `PROTECTED_GROUP_HATE`, `THREAT_OR_VIOLENCE`, `COUNTERSPEECH_OR_REPORTING`, `BENIGN_CONTEXT`, `INSUFFICIENT_CONTEXT`, `PII_OR_DATA_QUALITY`, `OTHER_POLICY_MISMATCH`, or `OTHER_INAPPROPRIATE_REQUIRES_ADJUDICATION`.

## PII disposition

- `NONE`: no PII handling is required.
- `REQUIRES_REVIEW`: possible PII needs a separate authorized decision.
- `EXCLUDE`: PII makes the row unsuitable for this pilot.

PII disposition is recorded independently from the content decision. Do not rewrite or redact packet text. Notes are optional, factual, and limited to 500 characters.

## Return and validation

Return the completed CSV through the authorized project channel. Import validation will reject unknown or duplicate rows, altered text or digests, incorrect packet roles or reviewer identities, invalid enums, malformed timestamps, and contract changes. Validation does not itself ingest decisions, resolve the parent tranche, or make any row training-eligible.
