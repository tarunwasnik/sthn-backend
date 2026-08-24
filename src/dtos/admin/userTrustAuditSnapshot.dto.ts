import { IUser } from "../../models/User";

type UserTrustAuditSnapshotSource = Pick<
  IUser,
  | "abuseScore"
  | "status"
  | "governanceState"
  | "userCooldownUntil"
  | "creatorCooldownUntil"
>;

export type UserTrustAuditSnapshot = {
  abuseScore: number;
  status: IUser["status"];
  governanceState: IUser["governanceState"];
  userCooldownUntil: Date | null;
  creatorCooldownUntil: Date | null;
};

/** Trust-reset audit state only; account identity and future private fields are excluded. */
export const toUserTrustAuditSnapshot = (
  user: UserTrustAuditSnapshotSource,
): UserTrustAuditSnapshot => ({
  abuseScore: user.abuseScore,
  status: user.status,
  governanceState: user.governanceState,
  userCooldownUntil: user.userCooldownUntil ?? null,
  creatorCooldownUntil: user.creatorCooldownUntil ?? null,
});
