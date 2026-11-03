import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { ProviderRoutingCapabilityProfile, ProviderRoutingRequest, ProviderRoutingResult } from "../../contracts/financial/providerRouting.types";
import { paymentProviderRegistry } from "./paymentProviderRegistry.service";
import { payoutProviderRegistry } from "./payoutProviderRegistry.service";

type Candidate = { provider: PaymentProvider; profile?: ProviderRoutingCapabilityProfile };
const country = (value: string) => /^[A-Z]{2}$/.test(value);

/** Pure capability selection. It neither persists nor dispatches financial operations. */
export class ProviderRoutingService {
  constructor(private readonly candidates: () => Candidate[] = () => [...new Set([...paymentProviderRegistry.list(), ...payoutProviderRegistry.list()])].map(provider => ({ provider, profile: paymentProviderRegistry.routingProfile(provider) ?? payoutProviderRegistry.routingProfile(provider) }))) {}
  select(request: ProviderRoutingRequest): ProviderRoutingResult {
    const evaluatedAt = new Date(); const excluded: Array<{ provider: PaymentProvider; reason: string }> = [];
    if (!request.operationId || !country(request.sourceCountry) || (request.destinationCountry && !country(request.destinationCountry)) || request.operationState === "UNKNOWN" || request.operationState === "DISPATCHED" || request.operationState === "SUCCEEDED") return { status: "UNAVAILABLE", evaluatedAt, excluded: [{ provider: PaymentProvider.INTERNAL, reason: "Operation state or routing context is not safe for selection." }] };
    const eligible: Array<{ provider: PaymentProvider; profile: ProviderRoutingCapabilityProfile }> = [];
    for (const candidate of this.candidates()) {
      const p = candidate.profile;
      if (!p) { excluded.push({ provider: candidate.provider, reason: "Capability evidence is unknown." }); continue; }
      if (!p.approvedEnvironments.includes(process.env.NODE_ENV ?? "development")) { excluded.push({ provider: candidate.provider, reason: "Provider is not approved for this environment." }); continue; }
      if (p.simulator && process.env.NODE_ENV === "production") { excluded.push({ provider: candidate.provider, reason: "Simulator cannot be a production authority." }); continue; }
      if (p.operations[request.operation] !== "SUPPORTED") { excluded.push({ provider: candidate.provider, reason: "Operation is not verified supported." }); continue; }
      if (!p.sourceCountries.includes(request.sourceCountry) || (request.destinationCountry && !p.destinationCountries.includes(request.destinationCountry)) || !p.sourceCurrencies.includes(request.sourceCurrency) || (request.destinationCurrency && !p.destinationCurrencies.includes(request.destinationCurrency))) { excluded.push({ provider: candidate.provider, reason: "Country or currency corridor is unsupported." }); continue; }
      if (request.fundingRoute && !p.fundingRoutes?.includes(request.fundingRoute)) { excluded.push({ provider: candidate.provider, reason: "Funding route is not verified." }); continue; }
      if (p.healthyOperations && !p.healthyOperations.includes(request.operation)) { excluded.push({ provider: candidate.provider, reason: "Operation is temporarily unavailable." }); continue; }
      if (request.requiresFeeEvidence && !p.feeEvidenceReference || request.requiresFxEvidence && !p.fxEvidenceReference) { excluded.push({ provider: candidate.provider, reason: "Required fee or FX evidence is unavailable." }); continue; }
      eligible.push({ provider: candidate.provider, profile: p });
    }
    eligible.sort((a, b) => (a.profile.evaluatedCostMinor ?? Number.MAX_SAFE_INTEGER) - (b.profile.evaluatedCostMinor ?? Number.MAX_SAFE_INTEGER) || a.provider.localeCompare(b.provider));
    const winner = eligible[0];
    return winner ? { status: "SELECTED", provider: winner.provider, rationale: "Verified operation, corridor, funding, health, and required evidence passed; lowest verified cost selected.", evaluatedAt, configurationVersion: winner.profile.configurationVersion, excluded } : { status: "UNAVAILABLE", evaluatedAt, excluded };
  }
}
export const providerRoutingService = new ProviderRoutingService();
