import { ImageModerationSurface } from "../../enums/imageModeration.enums";

export type CreatorMediaClaim = Readonly<
  | { kind: "UNCHANGED"; reference: string }
  | { kind: "ADMISSION"; admissionReference: string }
>;

export type CreatorMediaClaims = Readonly<{ avatar?: CreatorMediaClaim; cover?: CreatorMediaClaim; media?: readonly CreatorMediaClaim[] }>;

export class CreatorServiceMediaPolicyError extends Error {
  constructor(readonly code: "CREATE_REQUIRES_ADMISSION" | "INVALID_CARDINALITY" | "LEGACY_MIGRATION_REQUIRED") {
    super(
      code === "CREATE_REQUIRES_ADMISSION"
        ? "Creator Services require exactly one approved image admission."
        : code === "LEGACY_MIGRATION_REQUIRED"
          ? "Legacy multi-image service media must be migrated before it can be changed."
          : "Creator Services support exactly one image.",
    );
    this.name = "CreatorServiceMediaPolicyError";
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const rejectInternalFields = (value: unknown): void => {
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (["assetId", "providerAssetId", "trustedMediaReference", "contentSha256", "expiresAt", "entityBinding"].includes(key)) throw new Error("Creator image claim contains forbidden internal metadata");
    rejectInternalFields(nested);
  }
};

export const parseCreatorMediaClaim = (value: unknown, name: string): CreatorMediaClaim => {
  if (!isPlainObject(value)) throw new Error(`Invalid ${name} media claim`);
  if (value.kind === "UNCHANGED" && typeof value.reference === "string" && value.reference.trim() && value.reference.length <= 2048 && Object.keys(value).every((key) => key === "kind" || key === "reference")) return { kind: "UNCHANGED", reference: value.reference };
  if (value.kind === "ADMISSION" && typeof value.admissionReference === "string" && /^imauth_[A-Za-z0-9_-]{1,80}$/.test(value.admissionReference) && Object.keys(value).every((key) => key === "kind" || key === "admissionReference")) return { kind: "ADMISSION", admissionReference: value.admissionReference };
  throw new Error(`Invalid ${name} media claim`);
};

/** Parses only creator media claims; controllers must opt in explicitly during their migration. */
export const parseCreatorMediaClaims = (input: unknown): CreatorMediaClaims => {
  if (!isPlainObject(input)) throw new Error("Invalid creator image admission request");
  rejectInternalFields(input);
  const result: { avatar?: CreatorMediaClaim; cover?: CreatorMediaClaim; media?: readonly CreatorMediaClaim[] } = {};
  if (input.avatar !== undefined) result.avatar = parseCreatorMediaClaim(input.avatar, "avatar");
  if (input.cover !== undefined) result.cover = parseCreatorMediaClaim(input.cover, "cover");
  if (input.media !== undefined) {
    if (!Array.isArray(input.media)) throw new Error("Invalid media claims");
    result.media = input.media.map((claim, index) => parseCreatorMediaClaim(claim, `media[${index}]`));
    const identities = result.media.map((claim) => claim.kind === "ADMISSION" ? `a:${claim.admissionReference}` : `u:${claim.reference}`);
    if (new Set(identities).size !== identities.length) throw new Error("Duplicate creator media claims are not allowed");
  }
  return result;
};

/**
 * Creator Services are intentionally stricter than Creator Application and
 * Creator Profile galleries. Keep this at the service request boundary so
 * legacy multi-image records remain readable and unchanged.
 */
export const requireCreatorServiceCreateMedia = (claims: CreatorMediaClaims): readonly [Extract<CreatorMediaClaim, { kind: "ADMISSION" }>] => {
  if (!claims.media || claims.media.length !== 1) throw new CreatorServiceMediaPolicyError("INVALID_CARDINALITY");
  const [claim] = claims.media;
  if (claim.kind !== "ADMISSION") throw new CreatorServiceMediaPolicyError("CREATE_REQUIRES_ADMISSION");
  return [claim];
};

export const validateCreatorServiceUpdateMedia = (claims: CreatorMediaClaims, existingMedia: readonly string[]): void => {
  if (claims.media === undefined) return;
  if (existingMedia.length > 1) throw new CreatorServiceMediaPolicyError("LEGACY_MIGRATION_REQUIRED");
  if (claims.media.length !== 1) throw new CreatorServiceMediaPolicyError("INVALID_CARDINALITY");
};

export type CreatorMediaResourceKind = "CREATOR_APPLICATION" | "CREATOR_PROFILE" | "CREATOR_SERVICE";
export type CreatorMediaSurfaceSet = Readonly<{ avatar?: ImageModerationSurface; cover?: ImageModerationSurface; media: ImageModerationSurface }>;
export const creatorMediaSurfaces: Readonly<Record<CreatorMediaResourceKind, CreatorMediaSurfaceSet>> = Object.freeze({
  CREATOR_APPLICATION: { avatar: "CREATOR_APPLICATION_AVATAR", cover: "CREATOR_APPLICATION_COVER", media: "CREATOR_APPLICATION_MEDIA" },
  CREATOR_PROFILE: { avatar: "CREATOR_PROFILE_AVATAR", cover: "CREATOR_PROFILE_COVER", media: "CREATOR_PROFILE_MEDIA" },
  CREATOR_SERVICE: { media: "CREATOR_SERVICE_MEDIA" },
});
