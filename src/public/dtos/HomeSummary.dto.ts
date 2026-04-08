//beckend/src/public/dtos/HomeSummary.dto.ts


import { CreatorPublicCardDTO } from "./CreatorPublicCard.dto";

export interface HomeSummaryDTO {
  stats: {
    totalCreators: number;
    totalBookings: number;
    totalUsers: number;
  };
  featuredCategories: {
    id: string;
    name: string;
    iconUrl: string;
  }[];
  featuredCreators: CreatorPublicCardDTO[];
}