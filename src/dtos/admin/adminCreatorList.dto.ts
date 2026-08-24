import { CreatorProfileDocument } from "../../models/creatorProfile.model";

type AdminCreatorListSource = Pick<
  CreatorProfileDocument,
  | "_id"
  | "userId"
  | "slug"
  | "displayName"
  | "avatarUrl"
  | "primaryCategory"
  | "country"
  | "city"
  | "currency"
  | "rating"
  | "reviewCount"
  | "status"
  | "createdAt"
>;

export type AdminCreatorListDto = {
  id: string;
  userId: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  primaryCategory: string;
  country: string;
  city: string;
  currency: string;
  rating: number;
  reviewCount: number;
  status: CreatorProfileDocument["status"];
  createdAt: Date;
};

/** Bounded Admin dashboard list, independent of CreatorProfile schema growth. */
export const toAdminCreatorListDto = (
  creator: AdminCreatorListSource,
): AdminCreatorListDto => ({
  id: String(creator._id),
  userId: String(creator.userId),
  slug: creator.slug,
  displayName: creator.displayName,
  avatarUrl: creator.avatarUrl ?? null,
  primaryCategory: creator.primaryCategory,
  country: creator.country,
  city: creator.city,
  currency: creator.currency,
  rating: creator.rating,
  reviewCount: creator.reviewCount,
  status: creator.status,
  createdAt: creator.createdAt,
});
