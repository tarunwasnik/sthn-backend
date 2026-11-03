import crypto from "node:crypto";
import mongoose, { ClientSession, Types } from "mongoose";
import { SupportedCurrency, SUPPORTED_CURRENCIES } from "../../constants/financial/supportedCurrencies";
import { PaymentMethod } from "../../enums/financial/paymentMethod.enum";
import { PaymentStatus } from "../../enums/financial/paymentStatus.enum";
import { PaymentOperationStatus } from "../../enums/financial/paymentOperationStatus.enum";
import { creatorEntitlementRepository as repository } from "../../repositories/creatorEntitlement.repository";

/**
 * Implementations must load a durable, authorized and immutable financial decision
 * using the supplied transaction; caller-supplied amounts are never authoritative.
 * The reader must also fence conflicting decision, booking and payment changes
 * until commit. A snapshot read alone does not provide that guarantee.
 * Each authoritative lifecycle supplies its own bounded decision reader.
 */
export interface AuthorizedAllocationDecision {
  authority: string;
  decisionId: string;
  bookingId: Types.ObjectId;
  paymentId: Types.ObjectId;
  creatorId: Types.ObjectId;
  currency: SupportedCurrency;
  totalAmount: number;
  creatorAmount: number;
  platformAmount: number;
  customerRefundAmount: number;
}
export interface AuthorizedAllocationDecisionReader {
  readAuthorized(authority: string, decisionId: string, session: ClientSession): Promise<AuthorizedAllocationDecision | null>;
}
export class CreatorEntitlementError extends Error {
  constructor(message: string, readonly code: "INVALID" | "NOT_AUTHORIZED" | "CONFLICT" | "INTEGRITY") { super(message); }
}
const fingerprint = (d: AuthorizedAllocationDecision) => crypto.createHash("sha256").update(JSON.stringify([d.authority, d.decisionId, String(d.bookingId), String(d.paymentId), String(d.creatorId), d.currency, d.totalAmount, d.creatorAmount, d.platformAmount, d.customerRefundAmount])).digest("hex");
const bounded = (s: string) => typeof s === "string" && s.trim() === s && s.length > 0 && s.length <= 200;

export class CreatorEntitlementService {
  constructor(private readonly decisionReader: AuthorizedAllocationDecisionReader) {}

  /** Records a held allocation only. No ledger posting, payout or release is authorized here. */
  async recognize(
    input: { authority: string; decisionId: string },
    existingSession?: ClientSession,
  ): Promise<{ entitlementId: string; state: "HELD"; replayed: boolean }> {
    if (!bounded(input.authority) || !bounded(input.decisionId)) throw new CreatorEntitlementError("Invalid decision identity.", "INVALID");
    if (existingSession) return this.recognizeInSession(input, existingSession);

    const session = await mongoose.startSession();
    try {
      let result: { entitlementId: string; state: "HELD"; replayed: boolean } | undefined;
      await session.withTransaction(async () => { result = await this.recognizeInSession(input, session); });
      if (!result) throw new CreatorEntitlementError("Entitlement transaction did not commit.", "INTEGRITY");
      return result;
    } catch (error) {
      // A unique decision, booking or payment conflict must never mint a second obligation.
      if ((error as { code?: number }).code === 11000) {
        const winner = await repository.findByDecision(input.authority, input.decisionId);
        if (!winner) throw new CreatorEntitlementError("Booking or payment has a conflicting allocation.", "CONFLICT");
        // Re-enter the complete authorization and identity checks on the winning record.
        return this.recognize(input);
      }
      throw error;
    } finally { await session.endSession(); }
  }

  private async recognizeInSession(
    input: { authority: string; decisionId: string },
    session: ClientSession,
  ): Promise<{ entitlementId: string; state: "HELD"; replayed: boolean }> {
    const decision = await this.decisionReader.readAuthorized(input.authority, input.decisionId, session);
    if (!decision || decision.authority !== input.authority || decision.decisionId !== input.decisionId) throw new CreatorEntitlementError("Financial allocation is not authorized.", "NOT_AUTHORIZED");
    const amounts = [decision.totalAmount, decision.creatorAmount, decision.platformAmount, decision.customerRefundAmount];
    if (!SUPPORTED_CURRENCIES.includes(decision.currency) || amounts.some(n => !Number.isSafeInteger(n) || n < 0) || decision.totalAmount <= 0 ||
        !Number.isSafeInteger(decision.creatorAmount + decision.platformAmount + decision.customerRefundAmount) || decision.creatorAmount + decision.platformAmount + decision.customerRefundAmount !== decision.totalAmount ||
        !Types.ObjectId.isValid(decision.bookingId) || !Types.ObjectId.isValid(decision.paymentId) || !Types.ObjectId.isValid(decision.creatorId)) throw new CreatorEntitlementError("Allocation amounts or identity are invalid.", "INVALID");
    const key = fingerprint(decision);
    const existing = await repository.findByDecision(input.authority, input.decisionId, session);
    if (existing) {
      if (existing.fingerprint !== key) throw new CreatorEntitlementError("Financial decision identity conflicts.", "CONFLICT");
      return { entitlementId: String(existing._id), state: "HELD", replayed: true };
    }
    const [booking, payment, operation] = await repository.findGraph(decision.bookingId, decision.paymentId, session);
    if (!booking || !payment || !operation || booking.status !== "COMPLETED" || !booking.completedAt || !booking.paymentId?.equals(payment._id) || !payment.bookingId.equals(booking._id) ||
      !booking.creatorId.equals(decision.creatorId) || !payment.creatorId.equals(decision.creatorId) || !payment.userId.equals(booking.userId) ||
      payment.method === PaymentMethod.WALLET || booking.paymentMethod !== payment.method || booking.totalAmount !== decision.totalAmount || payment.amount !== decision.totalAmount || booking.currency !== decision.currency || payment.currency !== decision.currency ||
      payment.status !== PaymentStatus.CAPTURED || operation.status !== PaymentOperationStatus.CONFIRMED || operation.providerStatus !== "CAPTURED" || !operation.confirmedAt ||
      !operation.paymentId.equals(payment._id) || !operation.bookingId.equals(booking._id) || !operation.userId.equals(booking.userId) || operation.idempotencyKey !== payment.idempotencyKey || operation.provider !== payment.provider || !payment.providerPaymentId || operation.providerPaymentId !== payment.providerPaymentId ||
      operation.requestedAmount !== decision.totalAmount || operation.verifiedAmount !== decision.totalAmount || operation.requestedCurrency !== decision.currency || operation.verifiedCurrency !== decision.currency) throw new CreatorEntitlementError("Booking and confirmed provider payment evidence do not reconcile.", "INTEGRITY");
    const created = await repository.create({ decisionAuthority: decision.authority, decisionId: decision.decisionId, fingerprint: key, bookingId: decision.bookingId, paymentId: decision.paymentId, creatorId: decision.creatorId, currency: decision.currency, totalAmount: decision.totalAmount, creatorAmount: decision.creatorAmount, platformAmount: decision.platformAmount, customerRefundAmount: decision.customerRefundAmount, state: "HELD" }, session);
    return { entitlementId: String(created._id), state: "HELD", replayed: false };
  }
}
