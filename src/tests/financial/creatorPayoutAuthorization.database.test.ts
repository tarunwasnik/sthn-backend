import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { CreatorEntitlement } from "../../models/creatorEntitlement.model";
import { CreatorPayoutAuthorization } from "../../models/creatorPayoutAuthorization.model";
import { Payout } from "../../models/payout.model";
import { PayoutDestination } from "../../models/payoutDestination.model";
import { Payment } from "../../models/payment.model";
import { Wallet } from "../../models/wallet.model";
import { CreatorBalance } from "../../models/creatorBalance.model";
import { LedgerEntry } from "../../models/ledgerEntry.model";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";
import { PayoutDestinationType } from "../../enums/financial/payoutDestinationType.enum";
import { PayoutDestinationVerificationStatus } from "../../enums/financial/payoutDestinationVerificationStatus.enum";
import { CreatorPayoutAuthorizationService, AuthorizedCreatorPayoutEligibility } from "../../services/financial/creatorPayoutAuthorization.service";
import { creatorPayoutAuthorizationRepository } from "../../repositories/creatorPayoutAuthorization.repository";
import { generateFinancialReference } from "../../utils/financial/reference.util";
import { createBookingWalletFixture } from "./phase8a/fixtures/bookingWalletFixtures";
import { startReleaseHttpServer } from "./phase8b/fixtures/bookingWalletReleaseFixtures";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";
import { createBookingCheckoutQuote } from "../../services/booking/bookingCheckoutQuote.service";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "standalone-payout-authorization-test";

before(async () => { await connectPhase7HDatabase(); await Promise.all([CreatorEntitlement.init(), CreatorPayoutAuthorization.init(), PayoutDestination.init()]); }, { timeout: 120_000 });
beforeEach(clearPhase7HDatabase);
after(disconnectPhase7HDatabase);

async function fixture() {
  const f = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [500] });
  const customer = await User.create({ email: `${new Types.ObjectId()}@test.local`, role: "user", status: "active" });
  await UserProfile.create({ userId: customer._id, username: `p${String(customer._id)}`, dateOfBirth: new Date("1990-01-01"), interests: ["test"], bio: "test", avatar: "https://test.local/a", cover: "https://test.local/c", profilePhotos: ["https://test.local/1", "https://test.local/2"], profileStatus: "verified" });
  const server = await startReleaseHttpServer();
  try {
    const key = `payout-authorization-${new Types.ObjectId()}`;
    const quote = createBookingCheckoutQuote({ customerId: String(customer._id), creatorId: String(f.actors.creatorId), serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), currency: "INR", serviceAmount: f.serviceAmount, customerFeeAmount: f.platformFeeAmount, totalAmount: f.totalAmount });
    const response = await fetch(`${server.baseUrl}/api/v1/bookings/request`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${jwt.sign({ id: String(customer._id), role: "user" }, process.env.JWT_SECRET!)}`, "Idempotency-Key": key }, body: JSON.stringify({ serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), paymentMethod: "INTERNAL", checkoutQuote: quote.token, idempotencyKey: key }) });
    const body = await response.json() as { booking: { _id: string }; message?: string };
    assert.equal(response.status, 201, body.message);
    const payment = await Payment.findOne({ bookingId: body.booking._id }).orFail();
    const entitlement = await CreatorEntitlement.create({ decisionAuthority: "test-allocation", decisionId: "allocation-1", fingerprint: "test", bookingId: payment.bookingId, paymentId: payment._id, creatorId: f.actors.creatorId, currency: payment.currency, totalAmount: payment.amount, creatorAmount: 400, platformAmount: payment.amount - 400, customerRefundAmount: 0, state: "ELIGIBLE", eligibleAt: new Date() });
    const destination = await PayoutDestination.create({ destinationReference: generateFinancialReference("PAYOUT_DESTINATION"), creatorId: f.actors.creatorId, type: PayoutDestinationType.UPI, verificationStatus: PayoutDestinationVerificationStatus.VERIFIED, isActive: true, declaredCountry: "IN", verifiedCountry: "IN", idempotencyKey: `destination-${new Types.ObjectId()}`, destinationFingerprint: `fingerprint-${new Types.ObjectId()}`, requestFingerprint: `request-${new Types.ObjectId()}`, encryptedPayload: { version: 1, ciphertext: "ciphertext", iv: "iv", authTag: "tag" }, maskedIdentifier: "a•••z@upi", verifiedAt: new Date() });
    const decision: AuthorizedCreatorPayoutEligibility = { authority: "test-payout-release", decisionId: "payout-1", entitlementId: entitlement._id, creatorId: f.actors.creatorId, bookingId: payment.bookingId, paymentId: payment._id, payoutDestinationId: destination._id, destinationCountry: "IN", provider: PaymentProvider.CUSTOM, amount: entitlement.creatorAmount, currency: entitlement.currency, eligibilityState: "ELIGIBLE", hasUnresolvedFinancialLock: false, hasConflictingObligation: false };
    return { f, customer, payment, entitlement, destination, decision };
  } finally { await server.close(); }
}

const supported = { payoutAvailable: true, idempotent: true, authenticatedLookup: true, simulator: false, destinationTypes: [PayoutDestinationType.UPI] as const, currencies: ["INR"] as const, countries: ["IN"] as const };
const serviceFor = (read: () => AuthorizedCreatorPayoutEligibility | null, caps = supported) => new CreatorPayoutAuthorizationService({ async readAuthorized() { return read(); } }, { capabilities() { return caps; } });

test("valid authorization is one immutable provider-neutral obligation without wallet, balance, ledger, or provider movement", async () => {
  const f = await fixture();
  const [wallets, balances, ledger] = await Promise.all([Wallet.countDocuments(), CreatorBalance.countDocuments(), LedgerEntry.countDocuments()]);
  const values = await Promise.all(Array.from({ length: 5 }, () => serviceFor(() => f.decision).authorize({ authority: f.decision.authority, decisionId: f.decision.decisionId })));
  assert.equal(new Set(values.map(value => value.payoutId)).size, 1);
  assert.equal(values.filter(value => !value.replayed).length, 1);
  const payout = await Payout.findById(values[0].payoutId).orFail();
  assert.equal(payout.sourceType, "ENTITLEMENT"); assert.equal(payout.status, "CREATED"); assert.equal(payout.amount, f.entitlement.creatorAmount); assert.equal(String(payout.payoutDestinationId), String(f.destination._id));
  assert.equal(payout.providerPayoutId, undefined); assert.equal(payout.completedAt, undefined); assert.equal(payout.initiatedAt, undefined);
  assert.equal(await CreatorPayoutAuthorization.countDocuments(), 1); assert.equal(await Payout.countDocuments(), 1);
  assert.equal(await Wallet.countDocuments(), wallets); assert.equal(await CreatorBalance.countDocuments(), balances); assert.equal(await LedgerEntry.countDocuments(), ledger);
  assert.equal((await serviceFor(() => f.decision).authorize({ authority: f.decision.authority, decisionId: f.decision.decisionId })).replayed, true);
});

test("held alone, missing approval, wrong identities, inactive destinations, and unsupported corridors fail closed", async () => {
  const f = await fixture(); const key = { authority: f.decision.authority, decisionId: f.decision.decisionId };
  await assert.rejects(() => serviceFor(() => null).authorize(key), /not authorized/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, eligibilityState: "HELD" })).authorize(key), /not eligible/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, hasUnresolvedFinancialLock: true })).authorize(key), /not eligible/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, creatorId: new Types.ObjectId() })).authorize(key), /does not reconcile/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, bookingId: new Types.ObjectId() })).authorize(key), /does not reconcile/);
  await PayoutDestination.updateOne({ _id: f.destination._id }, { $set: { isActive: false } });
  await assert.rejects(() => serviceFor(() => f.decision).authorize(key), /destination is not eligible/);
  await PayoutDestination.updateOne({ _id: f.destination._id }, { $set: { isActive: true } });
  await assert.rejects(() => serviceFor(() => f.decision, { ...supported, payoutAvailable: false }).authorize(key), /capability is unavailable/);
  await assert.rejects(() => serviceFor(() => f.decision, { ...supported, simulator: true }).authorize(key), /capability is unavailable/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, amount: f.decision.amount - 1 })).authorize(key), /does not match the undisputed entitlement/);
  assert.equal(await Payout.countDocuments(), 0);
});

test("conflicting replay and a second decision for one entitlement cannot create another payable obligation", async () => {
  const f = await fixture(); const key = { authority: f.decision.authority, decisionId: f.decision.decisionId };
  await serviceFor(() => f.decision).authorize(key);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, destinationCountry: "US" })).authorize(key), /conflicts/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, decisionId: "second-payout" })).authorize({ authority: f.decision.authority, decisionId: "second-payout" }), /conflicting payout obligation/);
  assert.equal(await Payout.countDocuments(), 1); assert.equal(await CreatorPayoutAuthorization.countDocuments(), 1);
});

test("concurrent distinct decisions and transaction failure leave at most one, or no, payout obligation", async () => {
  const f = await fixture();
  const concurrent = await Promise.allSettled([
    serviceFor(() => f.decision).authorize({ authority: f.decision.authority, decisionId: f.decision.decisionId }),
    serviceFor(() => ({ ...f.decision, decisionId: "other-decision" })).authorize({ authority: f.decision.authority, decisionId: "other-decision" }),
  ]);
  assert.equal(concurrent.filter(value => value.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter(value => value.status === "rejected").length, 1);
  assert.equal(await Payout.countDocuments(), 1);
  await clearPhase7HDatabase(); const fresh = await fixture(); const original = creatorPayoutAuthorizationRepository.createAuthorization;
  try {
    creatorPayoutAuthorizationRepository.createAuthorization = async (data, session) => { await original.call(creatorPayoutAuthorizationRepository, data, session); throw new Error("after authorization insert"); };
    await assert.rejects(() => serviceFor(() => fresh.decision).authorize({ authority: fresh.decision.authority, decisionId: fresh.decision.decisionId }), /after authorization insert/);
    assert.equal(await Payout.countDocuments(), 0); assert.equal(await CreatorPayoutAuthorization.countDocuments(), 0);
  } finally { creatorPayoutAuthorizationRepository.createAuthorization = original; }
});
