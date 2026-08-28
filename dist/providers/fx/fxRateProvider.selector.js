"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFxRateProvider = void 0;
const fxRate_constants_1 = require("../../constants/financial/fxRate.constants");
const FxRateSnapshotError_1 = require("../../errors/financial/FxRateSnapshotError");
const configuredReferenceFxRate_provider_1 = require("./configuredReferenceFxRate.provider");
const internalFxRate_provider_1 = require("./internalFxRate.provider");
const createFxRateProvider = (config = (0, fxRate_constants_1.loadFxRateConfiguration)(), environment = process.env) => {
    switch (config.providerMode) {
        case fxRate_constants_1.FxRateProviderMode.REFERENCE:
            return new configuredReferenceFxRate_provider_1.ConfiguredReferenceFxRateProvider(config);
        case fxRate_constants_1.FxRateProviderMode.INTERNAL:
            if (environment.NODE_ENV === "production") {
                throw new FxRateSnapshotError_1.FxRateSnapshotError("Internal FX simulator is not allowed in production.", "FX_RATE_PROVIDER_NOT_CONFIGURED", 500);
            }
            return new internalFxRate_provider_1.InternalFxRateProvider(config);
        default:
            throw new FxRateSnapshotError_1.FxRateSnapshotError("FX provider mode is invalid.", "FX_RATE_PROVIDER_NOT_CONFIGURED", 500);
    }
};
exports.createFxRateProvider = createFxRateProvider;
