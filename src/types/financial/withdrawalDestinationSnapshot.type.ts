import { PayoutDestinationType } from "../../enums/financial/payoutDestinationType.enum";
import { PayoutDestinationVerificationStatus } from "../../enums/financial/payoutDestinationVerificationStatus.enum";

export interface EncryptedWithdrawalDestinationSnapshotPayload {
  version: 1;
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface IWithdrawalDestinationSnapshot {
  version: 1;
  destinationReference: string;
  type: PayoutDestinationType;
  maskedIdentifier: string;
  accountNumberLast4?: string;
  ifscDisplay?: string;
  verificationStatus: PayoutDestinationVerificationStatus.VERIFIED;
  verifiedAt: Date;
  snapshotCreatedAt: Date;
  encryptedPayload: EncryptedWithdrawalDestinationSnapshotPayload;
}

export type NormalizedWithdrawalDestination =
  | {
      type: PayoutDestinationType.BANK_ACCOUNT;
      accountHolderName: string;
      accountNumber: string;
      ifsc: string;
    }
  | {
      type: PayoutDestinationType.UPI;
      upiId: string;
    };
