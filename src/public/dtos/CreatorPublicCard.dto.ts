// backend/src/public/dtos/CreatorPublicCard.dto.ts

export interface CreatorPublicCardDTO {
  id: string;

  slug: string;

  displayName: string;

  avatarUrl: string | null;

  primaryCategory: string;

  categories: string[];

  rating: number;

  reviewCount: number;

  city?: string | null;

  country?: string | null;

  age?: number | null;

  currency?: string | null;

  startingPrice?: number | null;

  nextAvailableSlot?: string | null;

  isAvailable?: boolean;
}