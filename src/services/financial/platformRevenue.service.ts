import { platformRevenueRepository } from "../../repositories/platformRevenue.repository";
export class PlatformRevenueService {
  async summary() { return { currencies: await platformRevenueRepository.summary() }; }
  async entries(query: Record<string, unknown>) { const page = query.page === undefined ? 1 : Number(query.page); const limit = query.limit === undefined ? 25 : Number(query.limit); if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Object.assign(new Error("Invalid pagination."), { statusCode: 400 }); return platformRevenueRepository.entries(page, limit); }
}
export const platformRevenueService = new PlatformRevenueService();
