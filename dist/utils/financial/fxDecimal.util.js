"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scaledRatesWithinOneUnit = exports.deriveInverseRate = exports.scaledRateToDecimal = exports.parseScaledRate = void 0;
const fxRate_constants_1 = require("../../constants/financial/fxRate.constants");
const FxRateSnapshotError_1 = require("../../errors/financial/FxRateSnapshotError");
const powerOfTen = (scale) => 10n ** BigInt(scale);
const parseScaledRate = (input) => {
    if (typeof input !== "string" || !/^\d+(?:\.\d+)?$/.test(input.trim())) {
        throw new FxRateSnapshotError_1.FxRateSnapshotError("FX rate is malformed.", "FX_RATE_INVALID_RATE", 422);
    }
    const [whole, rawFraction = ""] = input.trim().split(".");
    const fraction = rawFraction.replace(/0+$/, "");
    if (fraction.length > fxRate_constants_1.FX_RATE_MAX_DECIMAL_SCALE) {
        throw new FxRateSnapshotError_1.FxRateSnapshotError("FX rate scale is excessive.", "FX_RATE_INVALID_RATE", 422);
    }
    const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
    if (BigInt(digits) <= 0n) {
        throw new FxRateSnapshotError_1.FxRateSnapshotError("FX rate must be positive.", "FX_RATE_INVALID_RATE", 422);
    }
    return { value: digits, scale: fraction.length };
};
exports.parseScaledRate = parseScaledRate;
const scaledRateToDecimal = (rate) => {
    if (rate.scale === 0)
        return rate.value;
    const padded = rate.value.padStart(rate.scale + 1, "0");
    return `${padded.slice(0, -rate.scale)}.${padded.slice(-rate.scale)}`;
};
exports.scaledRateToDecimal = scaledRateToDecimal;
const deriveInverseRate = (rate, inverseScale = fxRate_constants_1.FX_RATE_MAX_DECIMAL_SCALE) => {
    const numerator = powerOfTen(rate.scale + inverseScale);
    const denominator = BigInt(rate.value);
    const rounded = (numerator + denominator / 2n) / denominator;
    return (0, exports.parseScaledRate)((0, exports.scaledRateToDecimal)({
        value: rounded.toString(),
        scale: inverseScale,
    }));
};
exports.deriveInverseRate = deriveInverseRate;
const scaledRatesWithinOneUnit = (left, right) => {
    const scale = Math.max(left.scale, right.scale);
    const leftValue = BigInt(left.value) * powerOfTen(scale - left.scale);
    const rightValue = BigInt(right.value) * powerOfTen(scale - right.scale);
    const difference = leftValue >= rightValue
        ? leftValue - rightValue : rightValue - leftValue;
    return difference <= 1n;
};
exports.scaledRatesWithinOneUnit = scaledRatesWithinOneUnit;
