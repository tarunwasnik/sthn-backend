import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { BookingFundReservationStatus } from "../../enums/financial/bookingFundReservationStatus.enum";
import { PaymentPricingPolicy } from "../../enums/financial/paymentPricingPolicy.enum";

export interface BookingPricingPreviewResponseDto {
  currency: string;
  serviceAmount: number;
  customerFeeAmount: number;
  grossFundingAmount: number;
  pricingPolicy: PaymentPricingPolicy;
  pricingVersion: number;
  checkoutQuote: {
    quoteId: string;
    token: string;
    fingerprint: string;
    issuedAt: string;
    expiresAt: string;
    financialPolicyVersion: string;
    financialPolicyContentReference: string | null;
    acceptanceEnforced: boolean;
    quoteRequired: boolean;
  };
  walletFunding: {
    currency: string;
    availableAmount: number;
    requiredAmount: number;
    walletExists: boolean;
    sufficient: boolean;
  };
}

export type BookingFundingState =
  | BookingFundReservationStatus
  | "NOT_APPLICABLE"
  | "UNAVAILABLE";

export interface BookingFundingResponseDto {
  booking: { status: string; currency: string };
  pricing: {
    serviceAmount: number;
    customerFeeAmount: number;
    grossFundingAmount: number;
    pricingPolicy: PaymentPricingPolicy | null;
    pricingVersion: number | null;
  };
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    authorizedAt?: Date;
    releasedAt?: Date;
    capturedAt?: Date;
  } | null;
  providerFunding?: {
    state: "PENDING" | "CONFIRMED" | "FAILED" | "UNKNOWN" | "CANCELLED" | "REFUNDED";
  };
  walletFunding: {
    state: BookingFundingState;
    amount?: number;
    currency?: string;
    authorizedAt?: Date;
    releasedAt?: Date;
    capturedAt?: Date;
  };
}
