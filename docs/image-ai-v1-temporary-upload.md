# Image AI V1 temporary admission endpoint

`POST /api/v1/image-moderation/admissions` is authenticated multipart input: `file` is required and `surface` must be a canonical Image AI surface. Actor identity comes only from the access token. The server validates decoded bytes, calculates SHA-256, uploads to the backend-controlled `image_ai_temporary` Cloudinary folder, records the server-returned public ID, runs Adam, and records I3 provenance.

PASS returns an admission reference bound to actor, exact bytes, temporary asset, pending server-owned surface binding, and expiry. BLOCK, invalid input, and UNAVAILABLE never return an admission reference. If Cloudinary succeeds but asset registration fails, the server attempts deletion of that exact returned public ID. Temporary records retain I3 expiry metadata; I9 will implement scheduled cleanup.

I5-I7 must consume the returned authority transactionally before persisting any public-media reference. Existing direct unsigned frontend uploads must not be accepted as new authoritative media after those integrations land.
