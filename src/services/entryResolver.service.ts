//backend/src/services/entryResolver.service.ts

export type EntryResult = {
  entryType:
    | "ADMIN"
    | "CREATOR"
    | "USER"
    | "ONBOARDING"
    | "CREATOR_PENDING";
  entryRoute: string;
  userId: string;
};

export const resolveEntry = (user: any): EntryResult => {
  if (!user || !user.role || !user.status) {
    throw new Error("Invalid user context");
  }

  const status = user.status.toLowerCase();
  const role = user.role.toUpperCase();
  const creatorStatus = user.creatorStatus?.toLowerCase?.() ?? "none";
  const userId = user._id.toString();


  // 🚫 Hard blocks
  if (status === "suspended") {
    throw new Error("Account suspended");
  }

  if (status === "banned") {
    throw new Error("Account banned");
  }

  // 🧬 Profile onboarding gate
  if (status === "pending_profile") {
    return {
  entryType: "ONBOARDING",
  entryRoute: "/onboarding",
  userId,
};
  }

  // 👑 Admin routing
  if (role === "ADMIN") {
   return {
  entryType: "ADMIN",
  entryRoute: "/admin/entry",
  userId,
};
  }

  // 🎯 Approved creators
  if (role === "CREATOR") {
    return {
  entryType: "CREATOR",
  entryRoute: "/dashboard/creator",
  userId,
};
  }



  // 👤 Default user dashboard
  return {
  entryType: "USER",
  entryRoute: "/dashboard/user",
  userId,
};
};