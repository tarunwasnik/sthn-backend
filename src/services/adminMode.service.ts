//backend/src/services/adminMode.service.ts

import { AdminMode, ADMIN_MODES } from "../types/adminMode.types";
import User, { IUser } from "../models/User";

/**
 * Get current admin mode for an admin user
 */
export const getAdminMode = async (
  adminId: string
): Promise<AdminMode | null> => {
  const admin = (await User.findById(adminId)
  .select("adminMode role")
  .lean()) as IUser | null

  if (!admin) {
    throw new Error("Admin not found");
  }

  if (admin.role !== "admin") {
    throw new Error("User is not an admin");
  }

  return admin.adminMode || null;
};

/**
 * Set admin mode for an admin user
 */
export const setAdminMode = async (
  adminId: string,
  mode: AdminMode
): Promise<AdminMode> => {
  if (!Object.values(ADMIN_MODES).includes(mode)) {
    throw new Error("Invalid admin mode");
  }

  const admin = await User.findById(adminId);

  if (!admin) {
    throw new Error("Admin not found");
  }

  if (admin.role !== "admin") {
    throw new Error("User is not an admin");
  }

  admin.adminMode = mode;
  await admin.save();

  return mode;
};
