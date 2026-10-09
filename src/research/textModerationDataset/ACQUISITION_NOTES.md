# T6L-6F / T6L-6G acquisition investigation

## Civil Comments 1.2.4

TFDS identifies `civil_comments_v1.2.zip` as the exact raw authority for version 1.2.4 and publishes byte size `448174578` and SHA-256 `89a60573acbbfaf189b2c77278115eefcbc1654dbd8235dd8fbecc1b83f1585c`. Dependency-free streaming download, archive extraction, CSV parsing, split validation, identity-label enrichment, and provenance staging are implemented. On 2026-09-08 the authoritative object returned HTTP 403 to both Node HTTPS and curl, and the public `tfds-data` prepared-data bucket exposed no corresponding 1.2.4 objects. T6L-6G repeated the exact-authority request outside the restricted network sandbox and again received HTTP 403. T6L-6I performed the single permitted lightweight recheck: the current official TFDS builder still names the same URL, documents no official migration, and the object still returned HTTP 403. The source remains access-blocked; no mirror or substitute is allowed.

## Measuring Hate Speech

The pinned publisher revision exposes default/train as `data/train-00000-of-00001.parquet`: 20,097,387 bytes, SHA-256/LFS object ID `0d65ce8cfb857f5db90e74ce295067bba7473fe12115715f9dd18d2a5f87e976`, and 135,556 annotation rows. An older publisher revision has CSV, but it predates the required revision and is not substituted.

The smallest justified Node option is `@addmaple/parquet-lite@1.2.1` used only by research acquisition to decode the pinned Parquet artifact. npm reports MIT, Node >=18, no declared runtime dependencies or install scripts, 1,569,210-byte unpacked size, and Node >=18. It is a WASM-backed, pure-ESM package. T6L-6G inspected the packed contents, temporarily installed only this authorized dev dependency, and found that its export map advertises `dist/index.d.ts`, `dist/reader.d.ts`, and related declarations that are absent from the published tarball. This is a material TypeScript compatibility/package-integrity concern. The dependency was immediately uninstalled, is absent from both manifests, and no parser or source-data download was attempted. MHS therefore remains blocked. Manual Parquet parsing and an unpinned substitute are not permitted.

### T6L-6H replacement assessment

| Candidate | License / recency | Runtime and package contract | Result |
|---|---|---|---|
| `hyparquet@1.30.0` | MIT; registry modified 2026-09-06 | Pure ESM JavaScript, zero runtime dependencies, no native/WASM component, complete declaration tree, 284,480 bytes unpacked; built-in uncompressed/SNAPPY support | Selected; exact shard proved SNAPPY-only |
| `@dsnp/parquetjs@1.9.3` | MIT; registry modified 2026-08-27 | CommonJS entry and declarations, twelve runtime dependencies, Node >=24.18.0 | Rejected: backend is Node 20.19.6 |
| `parquet-wasm@0.7.2` | MIT OR Apache-2.0; registry modified 2026-06-29 | Zero dependencies and declarations but 19,954,845 bytes unpacked and WASM-based | Rejected as disproportionate for the verified SNAPPY shard |
| `parquetjs-lite@0.8.7` | MIT; registry modified 2022-05-12 | CommonJS, four runtime dependencies, no bundled TypeScript declarations | Rejected: stale and incomplete TypeScript contract |

`hyparquet@1.30.0` was added as a research/dev dependency and is imported only through the isolated MHS acquisition module. The exact pinned shard was acquired and verified, a bounded five-row schema proof passed, metadata confirmed 135,556 rows across 136 row groups with SNAPPY only, and full grouping produced 39,565 content rows plus 135,556 restricted annotator sidecars. All content rows remain unresolved.
