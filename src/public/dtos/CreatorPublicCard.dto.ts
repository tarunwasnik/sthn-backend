// backend/src/public/dtos/CreatorPublicCard.dto.ts

export interface CreatorPublicCardDTO {
  id: string;

  slug: string;

  displayName: string;

  avatarUrl: string | null;

  primaryCategory: string;

  rating: number;

  reviewCount: number;

  /* ================= NEW ================= */

  age?: number | null;

  city?: string | null;

  country?: string | null;

  currency?: string | null;

  startingPrice?: number | null;

  nextAvailableSlot?: string | null;

  isAvailable?: boolean;
}