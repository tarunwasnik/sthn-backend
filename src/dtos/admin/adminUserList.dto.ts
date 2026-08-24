import { IUser } from "../../models/User";

type AdminUserListSource = Pick<
  IUser,
  "_id" | "email" | "role" | "status" | "creatorStatus" | "createdAt"
>;

export type AdminUserListDto = {
  id: string;
  email: string;
  role: IUser["role"];
  status: IUser["status"];
  creatorStatus: IUser["creatorStatus"];
  createdAt: Date;
};

/** Deliberate list contract; newly-added User fields stay private by default. */
export const toAdminUserListDto = (user: AdminUserListSource): AdminUserListDto => ({
  id: String(user._id),
  email: user.email,
  role: user.role,
  status: user.status,
  creatorStatus: user.creatorStatus,
  createdAt: user.createdAt,
});
