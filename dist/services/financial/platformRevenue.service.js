"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformRevenueService = exports.PlatformRevenueService = void 0;
const platformRevenue_repository_1 = require("../../repositories/platformRevenue.repository");
class PlatformRevenueService {
    async summary() { return { currencies: await platformRevenue_repository_1.platformRevenueRepository.summary() }; }
    async entries(query) { const page = query.page === undefined ? 1 : Number(query.page); const limit = query.limit === undefined ? 25 : Number(query.limit); if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw Object.assign(new Error("Invalid pagination."), { statusCode: 400 }); return platformRevenue_repository_1.platformRevenueRepository.entries(page, limit); }
}
exports.PlatformRevenueService = PlatformRevenueService;
exports.platformRevenueService = new PlatformRevenueService();
