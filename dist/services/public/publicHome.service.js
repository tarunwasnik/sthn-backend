"use strict";
// backend/src/services/public/publicHome.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicHomeData = void 0;
const publicCreator_service_1 = require("./publicCreator.service");
const getPublicHomeData = async () => {
    console.log("🔥 PUBLIC HOME SERVICE EXECUTING");
    const creatorsResponse = await (0, publicCreator_service_1.getPublicCreatorsData)({
        page: 1,
        limit: 8,
    });
    return {
        stats: {
            totalCreators: creatorsResponse.pagination.total,
            totalBookings: 2,
            totalUsers: 11,
        },
        featuredCategories: [],
        featuredCreators: creatorsResponse.data,
    };
};
exports.getPublicHomeData = getPublicHomeData;
