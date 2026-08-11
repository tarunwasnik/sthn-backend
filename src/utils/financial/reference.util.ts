// backend/src/utils/financial/reference.util.ts

import crypto from "crypto";

/**
 * Internal financial reference prefixes.
 */
export const FINANCIAL_REFERENCE_PREFIX = {
  PAYMENT: "PAY",
  REFUND: "REF",
  SETTLEMENT: "SET",
  WITHDRAWAL: "WDL",
  PAYOUT: "PAYOUT",
  PAYOUT_DESTINATION: "PDEST",
  LEDGER: "LEDGER",
  AUDIT: "AUDIT",
  BALANCE: "BAL",
  WALLET_TOP_UP: "TUP",
  INTERNAL_TOP_UP_FUNDING: "TUF",
  FX_RATE_SNAPSHOT: "FXR",
  WALLET_CONVERSION: "WCV",
} as const;

export type FinancialReferenceType = keyof typeof FINANCIAL_REFERENCE_PREFIX;

/**
 * Generates an internal financial reference.
 *
 * Example:
 * PAY-20260717-7F8A2C91
 */
export function generateFinancialReference(
  type: FinancialReferenceType,
): string {
  const prefix = FINANCIAL_REFERENCE_PREFIX[type];

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const random = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `${prefix}-${date}-${random}`;
}

/**
 * Returns true if a financial reference has the expected prefix.
 */
export function hasReferenceType(
  reference: string,
  type: FinancialReferenceType,
): boolean {
  return reference.startsWith(`${FINANCIAL_REFERENCE_PREFIX[type]}-`);
}

/**
 * Performs basic validation of an internal financial reference.
 */
export function isValidFinancialReference(reference: string): boolean {
  return /^[A-Z]+-\d{8}-[A-F0-9]{8}$/.test(reference);
}

/**
 * Extracts the reference prefix.
 *
 * Returns null if the reference format is invalid.
 */
export function getReferencePrefix(reference: string): string | null {
  if (!isValidFinancialReference(reference)) {
    return null;
  }

  return reference.split("-")[0] ?? null;
}
