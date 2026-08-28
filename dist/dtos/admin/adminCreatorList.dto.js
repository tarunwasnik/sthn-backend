"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toAdminCreatorListDto = void 0;
/** Bounded Admin dashboard list, independent of CreatorProfile schema growth. */
const toAdminCreatorListDto = (creator) => ({
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
exports.toAdminCreatorListDto = toAdminCreatorListDto;
