import crypto from "node:crypto";
import { ClientSession, Types } from "mongoose";
import { bookingFundingIntentRepository as intents } from "../../repositories/bookingFundingIntent.repository";
import { IBookingFundingIntent } from "../../models/bookingFundingIntent.model";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PaymentOperationStatus } from "../../enums/financial/paymentOperationStatus.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { SUPPORTED_CURRENCIES, SupportedCurrency } from "../../constants/financial/supportedCurrencies";
import { creatorServiceMajorToMinor } from "../../utils/financial/creatorServicePrice.util";
import { marketplacePricingService } from "../financial/marketplacePricing.service";
import { paymentProviderRegistry } from "../financial/paymentProviderRegistry.service";
import { resolveAccountGovernance } from "../accountGovernance/accountGovernanceResolver.service";
import { verifyBookingCheckoutQuote } from "./bookingCheckoutQuote.service";

export class BookingFundingAdmissionError extends Error {
  constructor(message: string, readonly code: "INVALID" | "CONFLICT" | "UNAUTHORIZED" | "INTEGRITY") { super(message); }
}
export interface BookingFundingAdmissionInput {
  authenticatedCustomerId: string;
  creatorId: string;
  serviceId: string;
  slotIds: string[];
  checkoutQuote: string;
  requestKey: string;
  method: PaymentMethod;
  provider: PaymentProvider;
}
export type BookingFundingAdmissionState = "NOT_FUNDED" | "PENDING" | "CONFIRMED" | "FAILED" | "UNKNOWN";
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const invalid = (message: string): never => { throw new BookingFundingAdmissionError(message, "INVALID"); };
const oid = (id: string) => { if (!Types.ObjectId.isValid(id)) return invalid("Invalid identity."); return new Types.ObjectId(id); };
const sameIds = (a: Types.ObjectId[], b: Types.ObjectId[]) => a.map(String).sort().join(",") === b.map(String).sort().join(",");

export class BookingFundingAdmissionService {
  private async result(intent: IBookingFundingIntent, replayed: boolean, session?: ClientSession) {
    let state: BookingFundingAdmissionState = "NOT_FUNDED";
    if (intent.bookingId || intent.paymentId || intent.operationId) {
      if (!intent.bookingId || !intent.paymentId || !intent.operationId) throw new BookingFundingAdmissionError("Incomplete payment association.", "INTEGRITY");
      const [booking, payment, operation] = await intents.findEvidence(intent.bookingId, intent.paymentId, intent.operationId, session);
      if (!booking || !payment || !operation || !booking.userId.equals(intent.customerId) || !booking.creatorId.equals(intent.creatorId) ||
          !booking.serviceId.equals(intent.serviceId) || !sameIds(booking.slotIds, intent.slotIds) || !booking.paymentId?.equals(payment._id) ||
          booking.checkoutQuoteId !== intent.quoteId || booking.checkoutQuoteFingerprint !== intent.quoteFingerprint ||
          booking.serviceAmount !== intent.serviceAmount || booking.platformFeeAmount !== intent.customerFeeAmount || booking.totalAmount !== intent.totalAmount || booking.currency !== intent.currency || booking.paymentMethod !== intent.method ||
          !payment.bookingId.equals(booking._id) || !payment.userId.equals(intent.customerId) || !payment.creatorId.equals(intent.creatorId) ||
          payment.method !== intent.method || payment.provider !== intent.provider || payment.amount !== intent.totalAmount || payment.currency !== intent.currency ||
          payment.serviceAmount !== intent.serviceAmount || payment.customerFeeAmount !== intent.customerFeeAmount || payment.grossEscrowAmount !== intent.totalAmount ||
          payment.checkoutQuoteId !== intent.quoteId || payment.checkoutQuoteFingerprint !== intent.quoteFingerprint ||
          !operation.paymentId.equals(payment._id) || !operation.bookingId.equals(booking._id) || !operation.userId.equals(intent.customerId) ||
          operation.provider !== intent.provider || operation.idempotencyKey !== payment.idempotencyKey || operation.requestedAmount !== intent.totalAmount || operation.requestedCurrency !== intent.currency) {
        throw new BookingFundingAdmissionError("Booking, payment or operation identity conflicts with the admission.", "INTEGRITY");
      }
      if (operation.status === PaymentOperationStatus.UNKNOWN) state = "UNKNOWN";
      else if (operation.status === PaymentOperationStatus.CONFIRMED && payment.status === PaymentStatus.CAPTURED &&
        operation.providerStatus === "CAPTURED" && !!operation.confirmedAt &&
        !!payment.providerPaymentId && operation.providerPaymentId === payment.providerPaymentId &&
        operation.verifiedAmount === intent.totalAmount && operation.verifiedCurrency === intent.currency) state = "CONFIRMED";
      else if (operation.status === PaymentOperationStatus.FAILED && payment.status === PaymentStatus.FAILED && !!operation.failedAt && ["FAILED", "CANCELLED", "EXPIRED"].includes(operation.providerStatus ?? "")) state = "FAILED";
      else if (operation.status === PaymentOperationStatus.PENDING && [PaymentStatus.CREATED, PaymentStatus.INITIALIZING, PaymentStatus.PENDING, PaymentStatus.AUTHORIZED].includes(payment.status)) state = "PENDING";
      else state = "UNKNOWN";
    }
    return { intentId: String(intent._id), replayed, state, quoteId: intent.quoteId, pricing: { serviceAmount: intent.serviceAmount, customerFeeAmount: intent.customerFeeAmount, totalAmount: intent.totalAmount, currency: intent.currency }, provider: intent.provider, method: intent.method, ...(intent.bookingId ? { bookingId: String(intent.bookingId), paymentId: String(intent.paymentId), operationId: String(intent.operationId) } : {}) };
  }

  async admit(input: BookingFundingAdmissionInput) {
    const customerId = oid(input.authenticatedCustomerId), creatorId = oid(input.creatorId), serviceId = oid(input.serviceId);
    if (!Array.isArray(input.slotIds) || !input.slotIds.length) return invalid("Slots are required.");
    const slotIds = input.slotIds.map(oid).sort((a, b) => String(a).localeCompare(String(b)));
    if (new Set(slotIds.map(String)).size !== slotIds.length) return invalid("Duplicate slots are not allowed.");
    if (typeof input.requestKey !== "string" || !input.requestKey.trim() || input.requestKey.trim().length > 200 || typeof input.checkoutQuote !== "string" || !input.checkoutQuote || input.checkoutQuote.length > 10000 || !Object.values(PaymentMethod).includes(input.method) || input.method === PaymentMethod.WALLET || !Object.values(PaymentProvider).includes(input.provider) || (input.provider === PaymentProvider.INTERNAL && input.method !== PaymentMethod.INTERNAL)) return invalid("Invalid request identity, quote, method or provider.");
    const requestKey = hash(input.requestKey.trim());
    const quoteTokenHash = hash(input.checkoutQuote);
    const fingerprint = hash(JSON.stringify([String(customerId), String(creatorId), String(serviceId), slotIds.map(String), quoteTokenHash, input.method, input.provider]));
    const user = await intents.findUser(customerId);
    if (!user || user.status !== "active" || user.role !== "user") throw new BookingFundingAdmissionError("Active authenticated customer required.", "UNAUTHORIZED");
    const replay = async () => {
      const existing = await intents.findByKey(customerId, requestKey);
      if (!existing) return null;
      if (existing.fingerprint !== fingerprint) throw new BookingFundingAdmissionError("Request key conflicts with another booking intent.", "CONFLICT");
      return this.result(existing, true);
    };
    const existing = await replay();
    if (existing) return existing;
    const [profile, service, creator] = await Promise.all([intents.findProfile(customerId), intents.findService(serviceId), intents.findCreator(creatorId)]);
    if (!profile || profile.profileStatus !== "verified" || resolveAccountGovernance(user).blocksOutgoingBookings) throw new BookingFundingAdmissionError("Customer is not eligible to book.", "UNAUTHORIZED");
    if (!service || !service.isActive || !service.creatorId.equals(creatorId) || !creator || creator.status !== "active" || customerId.equals(creatorId)) return invalid("Invalid creator or service.");
    const creatorUser = await intents.findUser(creatorId);
    if (!creatorUser || resolveAccountGovernance(creatorUser).blocksIncomingBookings) return invalid("Creator is unavailable.");
    const currency = creator.currency as SupportedCurrency;
    if (!SUPPORTED_CURRENCIES.includes(currency)) return invalid("Unsupported currency.");
    paymentProviderRegistry.select({ provider: input.provider, currency, operation: "PAYMENT", requiredCapabilities: ["session", "verify", "status"] });
    const slots = await intents.findSlots(slotIds, serviceId);
    if (slots.length !== slotIds.length || slots.some(slot => slot.startTime.getTime() < Date.now())) return invalid("Slots are unavailable.");
    const minutes = slots.reduce((sum, slot) => sum + (slot.endTime.getTime() - slot.startTime.getTime()) / 60000, 0);
    if (minutes < service.durationMinutes || minutes % service.durationMinutes !== 0) return invalid("Invalid slot duration.");
    const pricing = marketplacePricingService.calculate({ serviceAmount: slots.reduce((sum, slot) => sum + creatorServiceMajorToMinor(slot.price, currency), 0), currency });
    const quote = verifyBookingCheckoutQuote(input.checkoutQuote, { customerId: String(customerId), creatorId: String(creatorId), serviceId: String(serviceId), slotIds: slotIds.map(String), currency, serviceAmount: pricing.serviceAmount, customerFeeAmount: pricing.platformFeeAmount, totalAmount: pricing.totalAmount });
    try {
      const intent = await intents.create({ customerId, creatorId, serviceId, slotIds, requestKey, fingerprint, quoteId: quote.quoteId, quoteFingerprint: quote.fingerprint, quoteTokenHash, quoteExpiresAt: new Date(quote.expiresAt), serviceAmount: pricing.serviceAmount, customerFeeAmount: pricing.platformFeeAmount, totalAmount: pricing.totalAmount, currency, method: input.method, provider: input.provider });
      return this.result(intent, false);
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const winner = await replay();
      if (winner) return winner;
      throw error;
    }
  }

  /** Future booking creation must call this inside its authoritative transaction. Never dispatches a provider mutation. */
  async bind(input: { authenticatedCustomerId: string; requestKey: string; bookingId: string; paymentId: string; operationId: string; session: ClientSession }) {
    if (!input.session.inTransaction()) throw new BookingFundingAdmissionError("An active booking transaction is required.", "INVALID");
    const customerId = oid(input.authenticatedCustomerId);
    if (typeof input.requestKey !== "string" || !input.requestKey.trim() || input.requestKey.trim().length > 200) return invalid("Invalid request key.");
    const intent = await intents.findByKey(customerId, hash(input.requestKey.trim()), input.session);
    if (!intent) throw new BookingFundingAdmissionError("Booking intent not found.", "UNAUTHORIZED");
    const bookingId = oid(input.bookingId), paymentId = oid(input.paymentId), operationId = oid(input.operationId);
    if (intent.bookingId || intent.paymentId || intent.operationId) {
      if (!intent.bookingId?.equals(bookingId) || !intent.paymentId?.equals(paymentId) || !intent.operationId?.equals(operationId)) throw new BookingFundingAdmissionError("Booking intent is already associated.", "CONFLICT");
      return this.result(intent, true, input.session);
    }
    // Validate the complete graph before making its unique, transaction-bound association.
    intent.bookingId = bookingId; intent.paymentId = paymentId; intent.operationId = operationId;
    await this.result(intent, false, input.session);
    let bound: IBookingFundingIntent | null;
    try { bound = await intents.bind(intent._id, customerId, bookingId, paymentId, operationId, input.session); }
    catch (error) {
      if ((error as { code?: number }).code === 11000) throw new BookingFundingAdmissionError("Booking or payment is already associated with another intent.", "CONFLICT");
      throw error;
    }
    if (!bound) throw new BookingFundingAdmissionError("Concurrent association conflicts.", "CONFLICT");
    return this.result(bound, false, input.session);
  }
}
export const bookingFundingAdmissionService = new BookingFundingAdmissionService();
