import { ClientSession, Types } from "mongoose";

import User, { IUser } from "../../models/User";
import { migrateLegacyProfileMobileContact } from "./legacyMobileContactMigration.service";

export type ProfileSubmissionAccountAction =
  | Readonly<{ kind: "FIRST_SUBMISSION"; mobileContact: Readonly<{ mobileCountryCode: string; mobileNumber: string }> }>
  | Readonly<{ kind: "INCOMPLETE_EDIT" | "REJECTED_RESUBMISSION" | "VERIFIED_EDIT" }>;

export class ProfileSubmissionAccountPersistenceError extends Error {
  constructor(readonly code: "TRANSACTION_REQUIRED" | "ACCOUNT_NOT_FOUND" | "INVALID_CONTACT") {
    super(code);
    this.name = "ProfileSubmissionAccountPersistenceError";
  }
}

const normalizeContact = (contact: Readonly<{ mobileCountryCode: string; mobileNumber: string }>) => {
  const mobileCountryCode = contact.mobileCountryCode.trim();
  const mobileNumber = contact.mobileNumber.replace(/[\s-]/g, "");
  if (!/^\+[1-9]\d{0,3}$/.test(mobileCountryCode) || !/^\d{6,15}$/.test(mobileNumber)) {
    throw new ProfileSubmissionAccountPersistenceError("INVALID_CONTACT");
  }
  return { mobileCountryCode, mobileNumber };
};

/**
 * Trusted workflow persistence only. The action is selected by backend
 * lifecycle code; no HTTP identity, role, or account-status field is accepted.
 */
export class ProfileSubmissionAccountPersistenceService {
  async persist(input: { session: ClientSession; actorId: Types.ObjectId; action: ProfileSubmissionAccountAction }): Promise<IUser> {
    if (!input.session?.inTransaction()) throw new ProfileSubmissionAccountPersistenceError("TRANSACTION_REQUIRED");

    // Keep the historical migration semantics, but make its User/Profile writes
    // part of this caller-owned transaction.
    await migrateLegacyProfileMobileContact(input.actorId.toString(), input.session);
    const account = await User.findById(input.actorId).session(input.session).exec();
    if (!account) throw new ProfileSubmissionAccountPersistenceError("ACCOUNT_NOT_FOUND");

    if (input.action.kind !== "FIRST_SUBMISSION") return account;

    const mobileContact = normalizeContact(input.action.mobileContact);
    if (account.status === "pending_profile") account.status = "active";
    account.mobileCountryCode = mobileContact.mobileCountryCode;
    account.mobileNumber = mobileContact.mobileNumber;
    await account.save({ session: input.session });
    return account;
  }
}

export const profileSubmissionAccountPersistenceService = new ProfileSubmissionAccountPersistenceService();
