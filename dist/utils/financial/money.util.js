"use strict";
// backend/src/utils/financial/money.util.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMoney = createMoney;
exports.isValidAmount = isValidAmount;
exports.isValidMoney = isValidMoney;
exports.assertSameCurrency = assertSameCurrency;
exports.addMoney = addMoney;
exports.subtractMoney = subtractMoney;
exports.multiplyMoney = multiplyMoney;
exports.moneyEquals = moneyEquals;
exports.greaterThan = greaterThan;
exports.greaterThanOrEqual = greaterThanOrEqual;
exports.lessThan = lessThan;
exports.lessThanOrEqual = lessThanOrEqual;
exports.isZero = isZero;
exports.toMajorUnit = toMajorUnit;
exports.fromMajorUnit = fromMajorUnit;
const financialLimits_1 = require("../../constants/financial/financialLimits");
/**
 * Creates a Money object.
 */
function createMoney(amount, currency) {
    return {
        amount,
        currency,
    };
}
/**
 * Returns true if the amount is within supported limits.
 */
function isValidAmount(amount) {
    return (Number.isInteger(amount) &&
        amount >= financialLimits_1.FINANCIAL_LIMITS.MIN_TRANSACTION_AMOUNT &&
        amount <= financialLimits_1.FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT);
}
/**
 * Returns true if the supplied Money object is valid.
 */
function isValidMoney(money) {
    return (!!money && isValidAmount(money.amount) && typeof money.currency === "string");
}
/**
 * Ensures both monetary values use the same currency.
 */
function assertSameCurrency(a, b) {
    if (a.currency !== b.currency) {
        throw new Error("Currency mismatch.");
    }
}
/**
 * Adds two monetary values.
 */
function addMoney(a, b) {
    assertSameCurrency(a, b);
    return {
        amount: a.amount + b.amount,
        currency: a.currency,
    };
}
/**
 * Subtracts one monetary value from another.
 */
function subtractMoney(a, b) {
    assertSameCurrency(a, b);
    return {
        amount: a.amount - b.amount,
        currency: a.currency,
    };
}
/**
 * Multiplies a monetary value by a numeric factor.
 */
function multiplyMoney(money, multiplier) {
    return {
        amount: Math.round(money.amount * multiplier),
        currency: money.currency,
    };
}
/**
 * Returns true if both values are equal.
 */
function moneyEquals(a, b) {
    return a.currency === b.currency && a.amount === b.amount;
}
/**
 * Returns true if a > b.
 */
function greaterThan(a, b) {
    assertSameCurrency(a, b);
    return a.amount > b.amount;
}
/**
 * Returns true if a >= b.
 */
function greaterThanOrEqual(a, b) {
    assertSameCurrency(a, b);
    return a.amount >= b.amount;
}
/**
 * Returns true if a < b.
 */
function lessThan(a, b) {
    assertSameCurrency(a, b);
    return a.amount < b.amount;
}
/**
 * Returns true if a <= b.
 */
function lessThanOrEqual(a, b) {
    assertSameCurrency(a, b);
    return a.amount <= b.amount;
}
/**
 * Returns true if amount is zero.
 */
function isZero(money) {
    return money.amount === 0;
}
/**
 * Converts minor units to decimal representation.
 *
 * Example:
 * 10025 -> 100.25
 */
function toMajorUnit(money) {
    return money.amount / 100;
}
/**
 * Converts decimal amount into Money.
 *
 * Example:
 * 100.25 -> 10025
 */
function fromMajorUnit(amount, currency) {
    return {
        amount: Math.round(amount * 100),
        currency,
    };
}
