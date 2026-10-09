# Image AI V1 admission foundation

`ImageModerationAsset` binds a server-created temporary provider asset to actor and SHA-256 (48-hour expiry). `ImageModerationAttempt` is immutable identity/provenance plus lifecycle: `CREATED -> PROCESSING -> PASSED|BLOCKED|UNAVAILABLE|INVALID`; expired or invalidated attempts are terminal. A successful attempt alone creates `ImageAdmission`, bound to actor, exact asset/hash, surface, and entity binding.

`consumeAdmission` is a conditional single-document update requiring all bindings, `ACTIVE`, and unexpired authority. It changes state to `CONSUMED`, preventing replay/double use. Future entity persistence must execute this conditional consume inside its Mongo transaction; if it fails, it must not write authoritative media. Replacement must invalidate active authorities for the exact actor/surface/entity binding before old media cleanup.

`INVALID_IMAGE` and `MODEL_UNAVAILABLE` are distinct attempt failure kinds; neither creates admission. BLOCK is corrective and creates no account sanction. Existing media is grandfathered only when the backend proves the submitted reference exactly equals the entity's already-stored reference; a client URL alone is never grandfathered. I4 supplies trusted uploads, ownership proof, server hashes, and transaction integration. No cleanup worker is created here; expiry and retention metadata is ready for I9.
