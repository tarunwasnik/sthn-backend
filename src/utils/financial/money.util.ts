// backend/src/utils/financial/money.util.ts

import { FINANCIAL_LIMITS } from "../../constants/financial/financialLimits";
import { SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { Money } from "../../types/financial/money.type";

/**
 * Creates a Money object.
 */
export function createMoney(
  amount: number,
  currency: SupportedCurrency,
): Money {
  return {
    amount,
    currency,
  };
}

/**
 * Returns true if the amount is within supported limits.
 */
export function isValidAmount(amount: number): boolean {
  return (
    Number.isInteger(amount) &&
    amount >= FINANCIAL_LIMITS.MIN_TRANSACTION_AMOUNT &&
    amount <= FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT
  );
}

/**
 * Returns true if the supplied Money object is valid.
 */
export function isValidMoney(money: Money): boolean {
  return (
    !!money && isValidAmount(money.amount) && typeof money.currency === "string"
  );
}

/**
 * Ensures both monetary values use the same currency.
 */
export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error("Currency mismatch.");
  }
}

/**
 * Adds two monetary values.
 */
export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);

  return {
    amount: a.amount + b.amount,
    currency: a.currency,
  };
}

/**
 * Subtracts one monetary value from another.
 */
export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);

  return {
    amount: a.amount - b.amount,
    currency: a.currency,
  };
}

/**
 * Multiplies a monetary value by a numeric factor.
 */
export function multiplyMoney(money: Money, multiplier: number): Money {
  return {
    amount: Math.round(money.amount * multiplier),
    currency: money.currency,
  };
}

/**
 * Returns true if both values are equal.
 */
export function moneyEquals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

/**
 * Returns true if a > b.
 */
export function greaterThan(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);

  return a.amount > b.amount;
}

/**
 * Returns true if a >= b.
 */
export function greaterThanOrEqual(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);

  return a.amount >= b.amount;
}

/**
 * Returns true if a < b.
 */
export function lessThan(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);

  return a.amount < b.amount;
}

/**
 * Returns true if a <= b.
 */
export function lessThanOrEqual(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);

  return a.amount <= b.amount;
}

/**
 * Returns true if amount is zero.
 */
export function isZero(money: Money): boolean {
  return money.amount === 0;
}

/**
 * Converts minor units to decimal representation.
 *
 * Example:
 * 10025 -> 100.25
 */
export function toMajorUnit(money: Money): number {
  return money.amount / 100;
}

/**
 * Converts decimal amount into Money.
 *
 * Example:
 * 100.25 -> 10025
 */
export function fromMajorUnit(
  amount: number,
  currency: SupportedCurrency,
): Money {
  return {
    amount: Math.round(amount * 100),
    currency,
  };
}
