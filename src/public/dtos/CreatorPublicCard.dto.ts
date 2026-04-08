//beckend/src/public/dtos/CreatorPublicCard.dto.ts

export interface CreatorPublicCardDTO {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  primaryCategory: string;
  rating: number;
  reviewCount: number;
}