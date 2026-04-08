//beckend/src/public/dtos/CreatorPublicProfile.dto.ts

export interface CreatorPublicProfileDTO {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  age: number | null;          // derived, nullable
  bio: string | null;          // sanitized plain text
  categories: string[];        // display labels
  highlights: string[];        // curated, optional
  rating: number | null;       // aggregate average
  reviewCount: number;         // aggregate count
}
export {};