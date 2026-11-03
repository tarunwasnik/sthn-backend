import crypto from "node:crypto";

import type { SupportedCurrency } from "../../constants/financial/supportedCurrencies";

export const FINANCIAL_POLICY_VERSION = "STHN_FINANCIAL_POLICY_2026_10_24_V1";

/**
 * The approved policy text is not published in this repository.  Keep the
 * version identifiable for quote binding, but do not claim that a client has
 * accepted unpublished terms or manufacture replacement legal text.
 */
export const FINANCIAL_POLICY_CONTENT_REFERENCE: string | null = null;
const QUOTE_TTL_MS = 15 * 60 * 1000;

export interface BookingCheckoutQuote {
  quoteId: string;
  fingerprint: string;
  customerId: string;
  creatorId: string;
  serviceId: string;
  slotIds: string[];
  currency: SupportedCurrency;
  serviceAmount: number;
  customerFeeAmount: number;
  totalAmount: number;
  financialPolicyVersion: string;
  financialPolicyContentReference: string | null;
  issuedAt: string;
  expiresAt: string;
}

const canonical = (quote: Omit<BookingCheckoutQuote, "quoteId" | "fingerprint">) => JSON.stringify({
  ...quote,
  slotIds: [...quote.slotIds].sort(),
});

const quoteSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Checkout quote signing is unavailable.");
  return secret;
};

const signatureFor = (payload: string) => crypto
  .createHmac("sha256", quoteSecret())
  .update(payload)
  .digest("base64url");

export const createBookingCheckoutQuote = (input: Omit<BookingCheckoutQuote, "quoteId" | "fingerprint" | "issuedAt" | "expiresAt" | "financialPolicyVersion" | "financialPolicyContentReference">, now = new Date()): {
  quote: BookingCheckoutQuote;
  token: string;
} => {
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS).toISOString();
  const unsigned = {
    ...input,
    slotIds: [...input.slotIds].sort(),
    financialPolicyVersion: FINANCIAL_POLICY_VERSION,
    financialPolicyContentReference: FINANCIAL_POLICY_CONTENT_REFERENCE,
    issuedAt,
    expiresAt,
  };
  const fingerprint = crypto.createHash("sha256").update(canonical(unsigned)).digest("hex");
  const quote: BookingCheckoutQuote = {
    ...unsigned,
    fingerprint,
    quoteId: `QUOTE_${fingerprint.slice(0, 24).toUpperCase()}`,
  };
  const payload = Buffer.from(JSON.stringify(quote)).toString("base64url");
  return { quote, token: `${payload}.${signatureFor(payload)}` };
};

export const verifyBookingCheckoutQuote = (token: unknown, expected: Pick<BookingCheckoutQuote, "customerId" | "creatorId" | "serviceId" | "slotIds" | "currency" | "serviceAmount" | "customerFeeAmount" | "totalAmount">, now = new Date()): BookingCheckoutQuote => {
  if (typeof token !== "string" || !token.trim()) throw new Error("A checkout quote is required.");
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length) throw new Error("Checkout quote is invalid.");
  const expectedSignature = signatureFor(payload);
  const suppliedSignature = Buffer.from(signature);
  const authoritativeSignature = Buffer.from(expectedSignature);
  if (suppliedSignature.length !== authoritativeSignature.length || !crypto.timingSafeEqual(suppliedSignature, authoritativeSignature)) {
    throw new Error("Checkout quote signature is invalid.");
  }
  let quote: BookingCheckoutQuote;
  try { quote = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new Error("Checkout quote is invalid."); }
  if (!quote.expiresAt || new Date(quote.expiresAt).getTime() <= now.getTime()) throw new Error("Checkout quote has expired.");
  const unsigned = {
    customerId: quote.customerId, creatorId: quote.creatorId, serviceId: quote.serviceId,
    slotIds: quote.slotIds, currency: quote.currency, serviceAmount: quote.serviceAmount,
    customerFeeAmount: quote.customerFeeAmount, totalAmount: quote.totalAmount,
    financialPolicyVersion: quote.financialPolicyVersion,
    financialPolicyContentReference: quote.financialPolicyContentReference,
    issuedAt: quote.issuedAt, expiresAt: quote.expiresAt,
  };
  const fingerprint = crypto.createHash("sha256").update(canonical(unsigned)).digest("hex");
  if (quote.fingerprint !== fingerprint || quote.quoteId !== `QUOTE_${fingerprint.slice(0, 24).toUpperCase()}`) throw new Error("Checkout quote is invalid.");
  const sameSlots = [...quote.slotIds].sort().join(",") === [...expected.slotIds].sort().join(",");
  if (!sameSlots || quote.customerId !== expected.customerId || quote.creatorId !== expected.creatorId || quote.serviceId !== expected.serviceId || quote.currency !== expected.currency || quote.serviceAmount !== expected.serviceAmount || quote.customerFeeAmount !== expected.customerFeeAmount || quote.totalAmount !== expected.totalAmount) throw new Error("Checkout quote is stale.");
  return quote;
};
