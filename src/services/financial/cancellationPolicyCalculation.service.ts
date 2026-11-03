import { FINANCIAL_LIMITS } from "../../constants/financial/financialLimits";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { currencyMetadataService } from "./currencyMetadata.service";

/** Calculation version only; this is not a published policy or proof of consent. */
export const CANCELLATION_CALCULATION_VERSION = "STHN_CANCELLATION_CALCULATION_V1";

export const CANCELLATION_SCENARIOS = [
  "CUSTOMER_BEFORE_ACCEPTANCE", "CUSTOMER_AFTER_ACCEPTANCE", "CREATOR_CANCELLATION",
  "MUTUAL_CANCELLATION", "CUSTOMER_NO_SHOW", "CREATOR_NO_SHOW",
  "AUTHORIZED_MEDICAL_EMERGENCY", "AUTHORIZED_CREATOR_PRESSURE",
  "ADMIN_APPROVED_PARTIAL_DELIVERY", "VERIFIED_PLATFORM_FAILURE",
] as const;
export type CancellationScenario = (typeof CANCELLATION_SCENARIOS)[number];

/** Monetary values are authoritative snapshot amounts in currency minor units. */
export interface CancellationPolicyInput {
  readonly serviceAmount: number;
  readonly customerPlatformFee: number;
  readonly originalChargeTotal: number;
  readonly currency: SupportedCurrency;
  readonly scenario: CancellationScenario;
  readonly qualifyingTwoWayInteraction: boolean;
  /** Server-authoritative epoch milliseconds, not a client clock. */
  readonly scheduledStartMs: number;
  readonly cancellationReceivedMs: number;
  /** Externally approved value; valid only for partial delivery. */
  readonly approvedDeliveredValue?: number;
}

export interface CancellationPolicyResult {
  readonly policyVersion: string;
  readonly currency: SupportedCurrency;
  readonly scenario: CancellationScenario;
  readonly originalServiceAmount: number;
  readonly originalCustomerPlatformFee: number;
  readonly originalChargeTotal: number;
  readonly approvedDeliveredValue?: number;
  readonly timeDeduction: number;
  readonly interactionDeduction: number;
  readonly totalServiceDeduction: number;
  readonly refundableServiceAmount: number;
  readonly refundablePlatformFee: number;
  readonly totalCustomerRefund: number;
  readonly creatorEntitlement: number;
  readonly sthnEntitlement: number;
}

const allowedFields = new Set(["serviceAmount", "customerPlatformFee", "originalChargeTotal", "currency", "scenario", "qualifyingTwoWayInteraction", "scheduledStartMs", "cancellationReceivedMs", "approvedDeliveredValue"]);

/** Match marketplace pricing: nearest minor unit, half up, without floating-point money. */
function percentage(amount: number, rate: number): number {
  return Number((BigInt(amount) * BigInt(rate) + 50n) / 100n);
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && Number.isFinite(new Date(value).getTime());
}

function timeRate(startMs: number, receivedMs: number): number {
  const remaining = BigInt(startMs) - BigInt(receivedMs);
  const hour = 3_600_000n;
  if (remaining > 48n * hour) return 0;
  if (remaining > 24n * hour) return 5;
  if (remaining > 6n * hour) return 10;
  if (remaining > hour) return 20;
  return 40;
}

/** Pure policy calculation. Authorization, interaction evidence and execution are external. */
export function calculateCancellationPolicy(input: CancellationPolicyInput): CancellationPolicyResult {
  if (!input || typeof input !== "object" || Object.keys(input).some((field) => !allowedFields.has(field))) throw new Error("Invalid cancellation calculation input.");
  const { serviceAmount, customerPlatformFee, originalChargeTotal, scenario, qualifyingTwoWayInteraction } = input;
  if (![serviceAmount, customerPlatformFee, originalChargeTotal].every((value) => Number.isSafeInteger(value) && value >= 0) || serviceAmount < FINANCIAL_LIMITS.MIN_TRANSACTION_AMOUNT || originalChargeTotal > FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT || serviceAmount + customerPlatformFee !== originalChargeTotal || !Number.isSafeInteger(serviceAmount + customerPlatformFee)) throw new Error("Original pricing snapshot is invalid or inconsistent.");
  if (typeof input.currency !== "string" || currencyMetadataService.normalize(input.currency) !== input.currency) throw new Error("Currency is unsupported or not canonical.");
  if (!CANCELLATION_SCENARIOS.includes(scenario) || typeof qualifyingTwoWayInteraction !== "boolean") throw new Error("Cancellation scenario or interaction qualification is invalid.");
  if (!validTime(input.scheduledStartMs) || !validTime(input.cancellationReceivedMs)) throw new Error("Cancellation timestamps are invalid.");
  const isPartial = scenario === "ADMIN_APPROVED_PARTIAL_DELIVERY";
  if (isPartial ? !Number.isSafeInteger(input.approvedDeliveredValue) || input.approvedDeliveredValue! < 0 || input.approvedDeliveredValue! > serviceAmount : input.approvedDeliveredValue !== undefined) throw new Error("Approved delivered value is invalid for this scenario.");

  let timeDeduction = 0;
  let interactionDeduction = 0;
  let creatorEntitlement = 0;
  let retainedService = 0;
  let retainFee = false;

  if (isPartial) {
    retainedService = input.approvedDeliveredValue!;
    creatorEntitlement = percentage(retainedService, 80);
    retainFee = true;
  } else if (["CUSTOMER_AFTER_ACCEPTANCE", "CUSTOMER_NO_SHOW", "AUTHORIZED_MEDICAL_EMERGENCY"].includes(scenario)) {
    const rate = scenario === "CUSTOMER_NO_SHOW" ? 40 : scenario === "AUTHORIZED_MEDICAL_EMERGENCY" ? 0 : timeRate(input.scheduledStartMs, input.cancellationReceivedMs);
    timeDeduction = percentage(serviceAmount, rate);
    // Independent component rounding can exceed the rounded 55% cap by one unit.
    interactionDeduction = qualifyingTwoWayInteraction ? Math.min(percentage(serviceAmount, 15), percentage(serviceAmount, 55) - timeDeduction) : 0;
    retainedService = timeDeduction + interactionDeduction;
    creatorEntitlement = percentage(retainedService, 80);
    retainFee = scenario === "CUSTOMER_NO_SHOW" || retainedService > 0;
  } else if (["CREATOR_CANCELLATION", "MUTUAL_CANCELLATION", "CREATOR_NO_SHOW", "AUTHORIZED_CREATOR_PRESSURE"].includes(scenario)) {
    interactionDeduction = qualifyingTwoWayInteraction ? percentage(serviceAmount, 15) : 0;
    retainedService = interactionDeduction;
    // The qualifying-interaction policy retains the fee even if a tiny charge rounds to zero.
    retainFee = qualifyingTwoWayInteraction;
  }

  const refundableServiceAmount = serviceAmount - retainedService;
  const refundablePlatformFee = retainFee ? 0 : customerPlatformFee;
  const totalCustomerRefund = refundableServiceAmount + refundablePlatformFee;
  const sthnEntitlement = retainedService - creatorEntitlement + (retainFee ? customerPlatformFee : 0);
  if (![timeDeduction, interactionDeduction, retainedService, refundableServiceAmount, refundablePlatformFee, totalCustomerRefund, creatorEntitlement, sthnEntitlement].every((value) => Number.isSafeInteger(value) && value >= 0) || totalCustomerRefund + creatorEntitlement + sthnEntitlement !== originalChargeTotal) throw new Error("Cancellation calculation does not reconcile.");
  return Object.freeze({ policyVersion: CANCELLATION_CALCULATION_VERSION, currency: input.currency, scenario, originalServiceAmount: serviceAmount, originalCustomerPlatformFee: customerPlatformFee, originalChargeTotal, ...(isPartial ? { approvedDeliveredValue: retainedService } : {}), timeDeduction, interactionDeduction, totalServiceDeduction: isPartial ? 0 : retainedService, refundableServiceAmount, refundablePlatformFee, totalCustomerRefund, creatorEntitlement, sthnEntitlement });
}
