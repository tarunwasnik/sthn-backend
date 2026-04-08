// backend/src/services/public/publicHome.service.ts

import { CreatorProfile } from "../../models/creatorProfile.model";

export const getPublicHomeData = async () => {
  console.log("🔥 PUBLIC HOME SERVICE EXECUTING");

  const creators = await CreatorProfile.find({
    status: "active",
  })
    .select("_id slug displayName avatarUrl primaryCategory rating reviewCount")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean(); // ← THIS IS CRITICAL

  console.log("CREATORS AFTER LEAN:", creators);

  const featuredCreators = creators.map((creator) => ({
    id: creator._id.toString(),
    slug: creator.slug,
    displayName: creator.displayName,
    avatarUrl: creator.avatarUrl ?? null,
    primaryCategory: creator.primaryCategory,
    rating: creator.rating ?? 0,
    reviewCount: creator.reviewCount ?? 0,
  }));

  return {
    stats: {
      totalCreators: creators.length,
      totalBookings: 2,
      totalUsers: 11,
    },
    featuredCategories: [],
    featuredCreators,
  };
};
