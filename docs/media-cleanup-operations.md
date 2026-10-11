# Media cleanup workers

Both media cleanup workers are disabled unless explicitly enabled. They run in
the API process after their interval elapses; startup never sweeps or deletes
assets. A deployment may instead run a dedicated API instance with only these
flags enabled. Multiple instances are safe for correctness because MongoDB
claims, leases, and provider-asset reservations are authoritative, although a
single enabled instance is recommended to reduce polling.

## Configuration

| Variable | Default | Accepted values |
| --- | --- | --- |
| `STHN_TEMPORARY_IMAGE_CLEANUP_ENABLED` | `false` | `true` or `false` |
| `STHN_PROFILE_MEDIA_CLEANUP_ENABLED` | `false` | `true` or `false` |
| `STHN_TEMPORARY_IMAGE_CLEANUP_INTERVAL_MS` | `300000` | 10000–3600000 |
| `STHN_PROFILE_MEDIA_CLEANUP_INTERVAL_MS` | `300000` | 10000–3600000 |
| `STHN_TEMPORARY_IMAGE_CLEANUP_BATCH_SIZE` | `20` | 1–100 |
| `STHN_PROFILE_MEDIA_CLEANUP_BATCH_SIZE` | `20` | 1–100 |

Missing flags fail closed. Invalid explicitly configured values prevent startup.
Set both enable flags to `false` and restart to disable future invocations;
shutdown waits for an already-started bounded batch to finish.

## Prerequisites and rollout

Use a MongoDB replica set because the cleanup services use transactions. An
enabled worker also needs valid Cloudinary credentials and network access, but
disabled workers make no Cloudinary call. First enable one worker class at a
time in a disposable environment, using a small batch size. Observe the
structured `media-cleanup-scheduler` logs before expanding rollout.

Logs include worker type, duration, bounded outcome counts, overlap skips, and
contained errors. Do not treat `DELETE_UNKNOWN` as retryable: inspect the
corresponding `ImageModerationAsset` or `ProfileMediaCleanupJob` and its
`ProviderAssetGuard` manually before any reconciliation. `FAILED` and
`DELETE_UNKNOWN` profile jobs are discoverable through the cleanup-job
repository; temporary assets retain their cleanup status and error fields.

Persisted media referenced by immutable profile-verification submitted-media
snapshots remains protected under the current policy. R7F must define any
future retention/release policy; this worker must not bypass it.
