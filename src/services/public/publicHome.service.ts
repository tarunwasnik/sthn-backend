// backend/src/services/public/publicHome.service.ts

import { getPublicCreatorsData } from "./publicCreator.service";

export const getPublicHomeData = async () => {
  console.log(
    "🔥 PUBLIC HOME SERVICE EXECUTING"
  );

  const creatorsResponse =
    await getPublicCreatorsData({
      page: 1,
      limit: 8,
    });

  return {
    stats: {
      totalCreators:
        creatorsResponse.pagination.total,

      totalBookings: 2,

      totalUsers: 11,
    },

    featuredCategories: [],

    featuredCreators:
      creatorsResponse.data,
  };
};