import {
  FxRateConfiguration,
  FxRateProviderMode,
  loadFxRateConfiguration,
} from "../../constants/financial/fxRate.constants";
import { FxRateSnapshotError } from
  "../../errors/financial/FxRateSnapshotError";
import { ConfiguredReferenceFxRateProvider } from
  "./configuredReferenceFxRate.provider";
import { FxRateProvider } from "./fxRateProvider";
import { InternalFxRateProvider } from "./internalFxRate.provider";

export const createFxRateProvider = (
  config: FxRateConfiguration = loadFxRateConfiguration(),
  environment: NodeJS.ProcessEnv = process.env,
): FxRateProvider => {
  switch (config.providerMode) {
    case FxRateProviderMode.REFERENCE:
      return new ConfiguredReferenceFxRateProvider(config);
    case FxRateProviderMode.INTERNAL:
      if (environment.NODE_ENV === "production") {
        throw new FxRateSnapshotError("Internal FX simulator is not allowed in production.",
          "FX_RATE_PROVIDER_NOT_CONFIGURED", 500);
      }
      return new InternalFxRateProvider(config);
    default:
      throw new FxRateSnapshotError("FX provider mode is invalid.",
        "FX_RATE_PROVIDER_NOT_CONFIGURED", 500);
  }
};
