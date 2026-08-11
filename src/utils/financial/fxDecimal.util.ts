import { FX_RATE_MAX_DECIMAL_SCALE } from
  "../../constants/financial/fxRate.constants";
import { FxRateSnapshotError } from
  "../../errors/financial/FxRateSnapshotError";

export interface ScaledRate {
  value: string;
  scale: number;
}

const powerOfTen = (scale: number) => 10n ** BigInt(scale);

export const parseScaledRate = (input: string): ScaledRate => {
  if (typeof input !== "string" || !/^\d+(?:\.\d+)?$/.test(input.trim())) {
    throw new FxRateSnapshotError("FX rate is malformed.",
      "FX_RATE_INVALID_RATE", 422);
  }
  const [whole, rawFraction = ""] = input.trim().split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  if (fraction.length > FX_RATE_MAX_DECIMAL_SCALE) {
    throw new FxRateSnapshotError("FX rate scale is excessive.",
      "FX_RATE_INVALID_RATE", 422);
  }
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  if (BigInt(digits) <= 0n) {
    throw new FxRateSnapshotError("FX rate must be positive.",
      "FX_RATE_INVALID_RATE", 422);
  }
  return { value: digits, scale: fraction.length };
};

export const scaledRateToDecimal = (rate: ScaledRate): string => {
  if (rate.scale === 0) return rate.value;
  const padded = rate.value.padStart(rate.scale + 1, "0");
  return `${padded.slice(0, -rate.scale)}.${padded.slice(-rate.scale)}`;
};

export const deriveInverseRate = (
  rate: ScaledRate,
  inverseScale = FX_RATE_MAX_DECIMAL_SCALE,
): ScaledRate => {
  const numerator = powerOfTen(rate.scale + inverseScale);
  const denominator = BigInt(rate.value);
  const rounded = (numerator + denominator / 2n) / denominator;
  return parseScaledRate(scaledRateToDecimal({
    value: rounded.toString(),
    scale: inverseScale,
  }));
};

export const scaledRatesWithinOneUnit = (
  left: ScaledRate,
  right: ScaledRate,
): boolean => {
  const scale = Math.max(left.scale, right.scale);
  const leftValue = BigInt(left.value) * powerOfTen(scale - left.scale);
  const rightValue = BigInt(right.value) * powerOfTen(scale - right.scale);
  const difference = leftValue >= rightValue
    ? leftValue - rightValue : rightValue - leftValue;
  return difference <= 1n;
};
