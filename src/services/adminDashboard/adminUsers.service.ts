//backend/src/services/adminDashboard/adminUsers.service.ts

import User from "../../models/User";
import { toAdminUserListDto } from "../../dtos/admin/adminUserList.dto";

export const getAllUsersService = async (
  page: number,
  limit: number
) => {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    User.find()
      .select("email role status creatorStatus createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments()
  ]);

  return { data: data.map(toAdminUserListDto), total };
};
