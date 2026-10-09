# Image moderation model-quality dataset storage

Only the small I3 synthetic harness controls belong in Git under `../assets/`.

Licensed model-quality assets are intentionally local-only under `backend/evaluation-cache/image-moderation/sexual-content/v1/`. Their manifest entries use paths relative to that directory. A fixture may become `APPROVED` only after a reviewed STHN policy label, a local asset, and license/provenance metadata are present. Normal builds and I3 tests do not require these assets; official model-quality evaluation fails clearly when approved assets are unavailable.

Drop manually supplied JPG, PNG, or WebP files into `manual-incoming/`, then run `npm run import:image-moderation:manual -- <COVERAGE_CLASS>`. Imports are SHA-256 deduplicated and always become `REVIEW_REQUIRED`; no importer assigns STHN ground truth.

`npm run acquire:image-moderation:sexual-content` performs the deliberately small Commons-only V1 candidate search. It accepts only HTTPS URLs from `commons.wikimedia.org`, `upload.wikimedia.org`, or `thumb.wikimedia.org`, follows bounded redirects, and rejects payloads above 10 MiB or outside JPEG/PNG/WebP dimension limits. It writes only to the ignored local cache and records download failures without stopping the remaining coverage searches. Run `npm run analyze:image-moderation:sexual-content:acquisition` to see review-pool composition and coverage gaps; this is separate from the official approved-fixture analysis.

Run `npm run review:image-moderation:sexual-content` to start the local-only human review tool at `http://127.0.0.1:4318`. It serves only manifest-known candidate IDs from this cache, writes draft/approval/exclusion metadata to the local `review-manifest.json`, and never auto-approves a candidate. Use `npm run analyze:image-moderation:sexual-content:review` for candidate versus approved coverage.
