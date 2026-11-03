import { ProviderSimulatorError } from "../../errors/internalProvider/ProviderSimulatorError";

/** Simulator results are authoritative only in explicitly named local contexts. */
export function assertFinancialSimulatorAllowed(): void {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    throw new ProviderSimulatorError("Financial simulators are unavailable in this environment.", "FINANCIAL_SIMULATOR_UNAVAILABLE", 503);
  }
}
