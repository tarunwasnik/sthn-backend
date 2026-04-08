//backend/src/services/adminDashboard/adminUsers.service.ts

import User from "../../models/User";

export const getAllUsersService = async (
  page: number,
  limit: number
) => {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    User.find()
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments()
  ]);

  return { data, total };
};