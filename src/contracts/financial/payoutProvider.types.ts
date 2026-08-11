import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PayoutDestinationType } from "../../enums/financial/payoutDestinationType.enum";
import { Money } from "../../types/financial/money.type";

export type PayoutExecutionDestination =
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

export type PayoutExecutionDestinationCommand =
  | {
      snapshotVersion: 1;
      destinationReference: string;
      type: PayoutDestinationType.BANK_ACCOUNT;
      maskedIdentifier: string;
      accountNumberLast4: string;
      ifscDisplay: string;
      executionDestination: Extract<
        PayoutExecutionDestination,
        { type: PayoutDestinationType.BANK_ACCOUNT }
      >;
    }
  | {
      snapshotVersion: 1;
      destinationReference: string;
      type: PayoutDestinationType.UPI;
      maskedIdentifier: string;
      accountNumberLast4?: never;
      ifscDisplay?: never;
      executionDestination: Extract<
        PayoutExecutionDestination,
        { type: PayoutDestinationType.UPI }
      >;
    };

export interface InitializePayoutRequest {
  payoutId: string;
  payoutReference: string;
  withdrawalReference: string;
  creatorId: string;
  amount: Money;
  provider: PaymentProvider;
  idempotencyKey: string;
  destination: PayoutExecutionDestinationCommand;
}

/** Safe persisted provider identity used before Financial-Domain synchronization. */
export interface PayoutProviderInitializationIdentity {
  providerPayoutId: string;
  providerReference?: string;
  payoutId: string;
  withdrawalReference: string;
  amount: Money;
  destinationSnapshotVersion: 1;
  destinationReference: string;
  destinationFingerprint: string;
}

export interface InitializePayoutResponse {
  providerPayoutId: string;
  providerReference?: string;
  initializationIdentity: PayoutProviderInitializationIdentity;
  payload?: Record<string, unknown>;
}

export type PayoutProviderResult =
  | {
      outcome: "PROCESSING";
      terminal: false;
      providerPayoutId: string;
      providerTransactionId?: string;
      amount: Money;
      payload?: Record<string, unknown>;
    }
  | {
      outcome: "COMPLETED";
      terminal: true;
      providerPayoutId: string;
      providerTransactionId?: string;
      amount: Money;
      completedAt?: Date;
      payload?: Record<string, unknown>;
    }
  | {
      outcome: "FAILED";
      terminal: true;
      providerPayoutId: string;
      providerTransactionId?: string;
      amount: Money;
      failedAt?: Date;
      failureCode?: string;
      failureReason?: string;
      payload?: Record<string, unknown>;
    };

export interface GetPayoutResultRequest {
  payoutId: string;
  providerPayoutId: string;
}
