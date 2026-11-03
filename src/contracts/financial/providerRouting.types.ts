import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";

export type ProviderRoutingOperation = "COLLECTION" | "PAYMENT_RECONCILIATION" | "FULL_REFUND" | "PARTIAL_REFUND" | "REFUND_RECONCILIATION" | "PAYOUT" | "PAYOUT_RECONCILIATION" | "FX";
export type CapabilityEvidenceStatus = "SUPPORTED" | "UNSUPPORTED" | "UNAVAILABLE" | "UNKNOWN";
export interface ProviderRoutingCapabilityProfile {
  readonly configurationVersion: string;
  readonly approvedEnvironments: readonly string[];
  readonly simulator?: boolean;
  readonly operations: Readonly<Record<ProviderRoutingOperation, CapabilityEvidenceStatus>>;
  readonly sourceCountries: readonly string[];
  readonly destinationCountries: readonly string[];
  readonly sourceCurrencies: readonly SupportedCurrency[];
  readonly destinationCurrencies: readonly SupportedCurrency[];
  readonly fundingRoutes?: readonly string[];
  readonly feeEvidenceReference?: string;
  readonly fxEvidenceReference?: string;
  readonly evaluatedCostMinor?: number;
  readonly healthyOperations?: readonly ProviderRoutingOperation[];
}
export interface ProviderRoutingRequest { operationId: string; operation: ProviderRoutingOperation; sourceCountry: string; destinationCountry?: string; sourceCurrency: SupportedCurrency; destinationCurrency?: SupportedCurrency; fundingRoute?: string; requiresFeeEvidence?: boolean; requiresFxEvidence?: boolean; operationState?: "NEVER_DISPATCHED" | "DEFINITIVE_NON_EXECUTION" | "DISPATCHED" | "UNKNOWN" | "SUCCEEDED"; }
export type ProviderRoutingResult = { status: "SELECTED"; provider: PaymentProvider; rationale: string; evaluatedAt: Date; configurationVersion: string; excluded: Array<{ provider: PaymentProvider; reason: string }> } | { status: "UNAVAILABLE"; evaluatedAt: Date; excluded: Array<{ provider: PaymentProvider; reason: string }> };
