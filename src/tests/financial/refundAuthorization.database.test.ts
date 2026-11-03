import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { RefundAuthorization } from "../../models/refundAuthorization.model";
import { Refund } from "../../models/refund.model";
import { Payment } from "../../models/payment.model";
import { PaymentOperation } from "../../models/paymentOperation.model";
import { Booking } from "../../models/booking.model";
import mongoose from "mongoose";
import { BookingFundReservation } from "../../models/bookingFundReservation.model";
import { Wallet } from "../../models/wallet.model";
import { LedgerEntry } from "../../models/ledgerEntry.model";
import User from "../../models/User";
import { UserProfile } from "../../models/userProfile.model";
import { RefundAuthorizationService, AuthorizedRefundDecision } from "../../services/financial/refundAuthorization.service";
import { refundAuthorizationRepository } from "../../repositories/refundAuthorization.repository";
import { RefundReason } from "../../enums/financial/refundReason.enum";
import { createBookingWalletFixture } from "./phase8a/fixtures/bookingWalletFixtures";
import { startReleaseHttpServer } from "./phase8b/fixtures/bookingWalletReleaseFixtures";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "./phase7h/helpers/database";
import { createBookingCheckoutQuote } from "../../services/booking/bookingCheckoutQuote.service";
import { CreatorEntitlement } from "../../models/creatorEntitlement.model";
import { CreatorEntitlementFinancialAllocation } from "../../models/creatorEntitlementFinancialAllocation.model";
import { Dispute } from "../../models/dispute.model";
import { Appeal } from "../../models/appeal.model";
import { AuthoritativeRefundDecisionReader } from "../../services/financial/authoritativeRefundDecisionReader.service";
import { RefundExecutionService } from "../../services/financial/refundExecution.service";
import { PaymentProviderInterface } from "../../contracts/financial/paymentProvider.interface";
import { RefundStatus } from "../../enums/financial/refundStatus.enum";
import { RefundProcessingWorker } from "../../services/financial/refundProcessingWorker.service";

process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "standalone-refund-test";
before(async () => { await connectPhase7HDatabase(); await Promise.all([RefundAuthorization.init(), CreatorEntitlementFinancialAllocation.init()]); }, { timeout: 120_000 }); beforeEach(clearPhase7HDatabase); after(disconnectPhase7HDatabase);
async function fixture() {
  const f = await createBookingWalletFixture({ walletAmount: 0, slotAmounts: [500] });
  const user = await User.create({ email: `${new Types.ObjectId()}@test.local`, role: "user", status: "active" });
  await UserProfile.create({ userId: user._id, username: `r${String(user._id)}`, dateOfBirth: new Date("1990-01-01"), interests: ["test"], bio: "test", avatar: "https://test.local/a", cover: "https://test.local/c", profilePhotos: ["https://test.local/1", "https://test.local/2"], profileStatus: "verified" });
  const server = await startReleaseHttpServer();
  try {
    const key=`refund-${new Types.ObjectId()}`; const quote=createBookingCheckoutQuote({ customerId:String(user._id), creatorId:String(f.actors.creatorId), serviceId:String(f.serviceId), slotIds:f.slotIds.map(String), currency:"INR", serviceAmount:f.serviceAmount, customerFeeAmount:f.platformFeeAmount,totalAmount:f.totalAmount });
    const response = await fetch(`${server.baseUrl}/api/v1/bookings/request`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET!)}`, "Idempotency-Key":key }, body: JSON.stringify({ serviceId: String(f.serviceId), slotIds: f.slotIds.map(String), paymentMethod: "INTERNAL", checkoutQuote:quote.token,idempotencyKey:key }) });
    const body = await response.json() as { booking: { _id: string }; message?: string }; assert.equal(response.status, 201, body.message);
    const payment = await Payment.findOne({ bookingId: body.booking._id }).orFail(); const operation = await PaymentOperation.findOne({ paymentId: payment._id }).orFail();
    const decision: AuthorizedRefundDecision = { authority: "test-refund-decisions", decisionId: "refund-1", policyVersion: "test-policy-v1", bookingId: payment.bookingId, paymentId: payment._id, customerId: user._id, creatorId: f.actors.creatorId, provider: payment.provider, providerPaymentId: payment.providerPaymentId!, currency: payment.currency, amount: payment.amount, reason: RefundReason.OTHER };
    return { f, user, payment, operation, decision };
  } finally { await server.close(); }
}
const serviceFor = (read: () => AuthorizedRefundDecision | null, caps = { fullRefund: true, partialRefund: false, idempotent: true, authenticatedLookup: true }) => new RefundAuthorizationService({ async readAuthorized() { return read(); } }, { capabilities() { return caps; } });

test("authorized full refunds converge without wallet, ledger, or provider movement", async () => {
  const f = await fixture(); assert.equal(await Wallet.countDocuments({ userId: f.user._id }), 0);
  const ledgers = await LedgerEntry.countDocuments(); const wallets = await Wallet.countDocuments(); const service = serviceFor(() => f.decision);
  const values = await Promise.all(Array.from({ length: 5 }, () => service.authorize({ authority: f.decision.authority, decisionId: f.decision.decisionId })));
  assert.equal(new Set(values.map(x => x.authorizationId)).size, 1); assert.equal(values.filter(x => !x.replayed).length, 1);
  const refund = await Refund.findById(values[0].refundId).orFail(); assert.equal(refund.status, "APPROVED"); assert.equal(refund.providerPaymentId, f.payment.providerPaymentId); assert.equal(refund.amount, f.payment.amount);
  assert.equal(await RefundAuthorization.countDocuments(), 1); assert.equal(await LedgerEntry.countDocuments(), ledgers); assert.equal(await Wallet.countDocuments(), wallets); assert.equal(await BookingFundReservation.countDocuments(), 0);
  assert.equal((await service.authorize({ authority: f.decision.authority, decisionId: f.decision.decisionId })).replayed, true);
});

test("missing, shadow, mismatched, excessive, and partial Internal decisions fail closed", async () => {
  const f = await fixture(); const key = { authority: f.decision.authority, decisionId: f.decision.decisionId };
  await assert.rejects(() => serviceFor(() => null).authorize(key), /not authorized/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, authority: "shadow-calculation" })).authorize(key), /not authorized/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, paymentId: new Types.ObjectId() })).authorize(key), /do not reconcile/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, currency: "USD" })).authorize(key), /do not reconcile/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, amount: f.payment.amount + 1 })).authorize(key), /exceeds/);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, amount: f.payment.amount - 1 })).authorize(key), /does not support/);
  assert.equal(await Refund.countDocuments(), 0);
});

test("unknown funding, conflicting replay, completed refund, and rollback never create a second authorization", async () => {
  const f = await fixture(); const key = { authority: f.decision.authority, decisionId: f.decision.decisionId };
  await PaymentOperation.updateOne({ _id: f.operation._id }, { $set: { status: "UNKNOWN" } });
  await assert.rejects(() => serviceFor(() => f.decision).authorize(key), /do not reconcile/); assert.equal(await RefundAuthorization.countDocuments(), 0);
  await PaymentOperation.updateOne({ _id: f.operation._id }, { $set: { status: "CONFIRMED" } });
  const service = serviceFor(() => f.decision); await service.authorize(key);
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, policyVersion: "other" })).authorize(key), /conflicts/);
  await Refund.updateOne({ paymentId: f.payment._id }, { $set: { status: "COMPLETED" } });
  await assert.rejects(() => serviceFor(() => ({ ...f.decision, decisionId: "refund-2" })).authorize({ authority: f.decision.authority, decisionId: "refund-2" }), /exceeds/);
  const original = refundAuthorizationRepository.createAuthorization;
  try {
    await clearPhase7HDatabase(); const fresh = await fixture();
    refundAuthorizationRepository.createAuthorization = async (data, session) => { await original.call(refundAuthorizationRepository, data, session); throw new Error("after authorization insert"); };
    await assert.rejects(() => serviceFor(() => fresh.decision).authorize({ authority: fresh.decision.authority, decisionId: fresh.decision.decisionId }), /after authorization insert/);
    assert.equal(await Refund.countDocuments(), 0); assert.equal(await RefundAuthorization.countDocuments(), 0);
  } finally { refundAuthorizationRepository.createAuthorization = original; }
});

test("concurrent distinct full-refund decisions serialize at the payment fence", async () => {
  const f = await fixture(); const service = serviceFor(() => f.decision);
  const results = await Promise.allSettled([
    service.authorize({ authority: f.decision.authority, decisionId: f.decision.decisionId }),
    serviceFor(() => ({ ...f.decision, decisionId: "other-full-refund" })).authorize({ authority: f.decision.authority, decisionId: "other-full-refund" }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.equal(await RefundAuthorization.countDocuments(), 1);
  assert.equal(await Refund.countDocuments(), 1);
});

test("authorized refund dispatch is claimed once and authenticated evidence finalizes it", async () => {
  const f = await fixture(); const authorization = await serviceFor(() => f.decision).authorize({ authority: f.decision.authority, decisionId: f.decision.decisionId });
  let createCalls = 0; let lookupCalls = 0;
  const provider: PaymentProviderInterface = {
    provider: f.payment.provider,
    dispositionRefundCapabilities: { fullRefund: true, partialRefund: true, idempotent: true, authenticatedLookup: true },
    async createPaymentSession() { throw new Error("unexpected"); }, async verifyPayment() { return { verified: false, providerStatus: "unexpected" }; }, async getPaymentStatus() { return { providerPaymentId: "unexpected", providerStatus: "unexpected" }; }, async cancelPayment() { return { providerPaymentId: "unexpected", providerStatus: "unexpected" }; }, async verifyWebhook() { return { verified: false, providerEventId: "", providerEventType: "", payload: {} }; },
    async createRefund(request) { createCalls++; return { providerRefundId: "refund-provider-1", providerStatus: "PENDING", payload: { request: request.refundReference } }; },
    async getTerminationEvidence(request) { lookupCalls++; return { outcome: "VERIFIED", kind: "REFUND", paymentId: request.paymentId, providerPaymentId: request.providerPaymentId, amount: request.amount, providerStatus: "processed", result: "SUCCESS", refundId: request.refundId!, providerOperationReference: request.providerOperationReference! }; },
  };
  const execution = new RefundExecutionService(() => provider);
  const first = await execution.execute(authorization.refundId); const replay = await execution.execute(authorization.refundId);
  assert.equal(first.state, "COMPLETED"); assert.equal(replay.state, "COMPLETED"); assert.equal(replay.replayed, true); assert.equal(createCalls, 1); assert.equal(lookupCalls, 1);
  const refund = await Refund.findById(authorization.refundId).orFail(); assert.equal(refund.providerRefundId, "refund-provider-1"); assert.equal(refund.status, "COMPLETED");
});

test("crash-style processing without a provider refund reference becomes UNKNOWN and never redispatches", async () => {
  const f = await fixture(); const authorization = await serviceFor(() => f.decision).authorize({ authority: f.decision.authority, decisionId: f.decision.decisionId });
  await Refund.updateOne({ _id: authorization.refundId }, { $set: { status: "PROCESSING" } });
  let calls = 0; const execution = new RefundExecutionService(() => ({ provider: f.payment.provider, async createPaymentSession() { throw new Error("unexpected"); }, async verifyPayment() { return { verified:false, providerStatus:"unexpected" }; }, async getPaymentStatus() { return { providerPaymentId:"", providerStatus:"unexpected" }; }, async cancelPayment() { return { providerPaymentId:"", providerStatus:"unexpected" }; }, async createRefund() { calls++; throw new Error("must not dispatch"); }, async verifyWebhook() { return { verified:false, providerEventId:"", providerEventType:"", payload:{} }; } }));
  await assert.rejects(() => execution.reconcile(authorization.refundId), /without a provider reference/); assert.equal(calls, 0); assert.equal((await Refund.findById(authorization.refundId).orFail()).status, "UNKNOWN");
});

test("concurrent executors issue one provider refund and replay the durable result", async () => {
  const f = await fixture(); const authorization = await serviceFor(() => f.decision).authorize({ authority: f.decision.authority, decisionId: f.decision.decisionId });
  let calls = 0; const provider: PaymentProviderInterface = { provider:f.payment.provider, dispositionRefundCapabilities:{fullRefund:true,partialRefund:true,idempotent:true,authenticatedLookup:true}, async createPaymentSession(){throw new Error("unexpected");}, async verifyPayment(){return {verified:false,providerStatus:"x"};}, async getPaymentStatus(){return {providerPaymentId:"",providerStatus:"x"};}, async cancelPayment(){return {providerPaymentId:"",providerStatus:"x"};}, async verifyWebhook(){return {verified:false,providerEventId:"",providerEventType:"",payload:{}};}, async createRefund(){calls++; return {providerRefundId:"refund-race",providerStatus:"PENDING"};}, async getTerminationEvidence(r){return {outcome:"VERIFIED",kind:"REFUND",paymentId:r.paymentId,providerPaymentId:r.providerPaymentId,amount:r.amount,providerStatus:"processed",result:"SUCCESS",refundId:r.refundId!,providerOperationReference:r.providerOperationReference!};} };
  const execution = new RefundExecutionService(() => provider); const results = await Promise.all([execution.execute(authorization.refundId), execution.execute(authorization.refundId)]);
  assert.equal(calls, 1); assert.equal((await Refund.findById(authorization.refundId).orFail()).status,"COMPLETED"); assert.ok(results.every(x=>["PROCESSING","PENDING","COMPLETED"].includes(x.state)));
});

test("pending, malformed, and later successful reconciliation never completes without matching evidence", async () => {
  const f=await fixture(); const authorization=await serviceFor(()=>f.decision).authorize({authority:f.decision.authority,decisionId:f.decision.decisionId}); let mode:"PENDING"|"MALFORMED"|"SUCCESS"="PENDING";
  const provider: PaymentProviderInterface={provider:f.payment.provider,dispositionRefundCapabilities:{fullRefund:true,partialRefund:true,idempotent:true,authenticatedLookup:true},async createPaymentSession(){throw new Error("unexpected");},async verifyPayment(){return {verified:false,providerStatus:"x"};},async getPaymentStatus(){return {providerPaymentId:"",providerStatus:"x"};},async cancelPayment(){return {providerPaymentId:"",providerStatus:"x"};},async verifyWebhook(){return {verified:false,providerEventId:"",providerEventType:"",payload:{}};},async createRefund(){return {providerRefundId:"refund-pending",providerStatus:"PENDING"};},async getTerminationEvidence(r){if(mode==="MALFORMED")return {outcome:"VERIFIED",kind:"REFUND",paymentId:"other",providerPaymentId:r.providerPaymentId,amount:r.amount,providerStatus:"processed",result:"SUCCESS",refundId:r.refundId!,providerOperationReference:r.providerOperationReference!};return {outcome:"VERIFIED",kind:"REFUND",paymentId:r.paymentId,providerPaymentId:r.providerPaymentId,amount:r.amount,providerStatus:mode==="SUCCESS"?"processed":"pending",result:mode==="SUCCESS"?"SUCCESS":"PENDING",refundId:r.refundId!,providerOperationReference:r.providerOperationReference!};}};
  const execution=new RefundExecutionService(()=>provider); assert.equal((await execution.execute(authorization.refundId)).state,"PENDING"); mode="MALFORMED"; await assert.rejects(()=>execution.reconcile(authorization.refundId),/does not reconcile/); assert.equal((await Refund.findById(authorization.refundId).orFail()).status,"PENDING"); mode="SUCCESS"; assert.equal((await execution.reconcile(authorization.refundId)).state,"COMPLETED");
});

test("generic execution rejects the termination-owned late-capture authority", async () => {
  const f=await fixture(); const decision={...f.decision,authority:"TERMINAL_LATE_CAPTURE_V1",decisionId:String(f.payment.bookingId)}; const authorization=await serviceFor(()=>decision).authorize({authority:decision.authority,decisionId:decision.decisionId}); await assert.rejects(()=>new RefundExecutionService(()=>undefined).execute(authorization.refundId),/termination recovery/); assert.equal((await Refund.findById(authorization.refundId).orFail()).status,"APPROVED");
});

test("refund worker inspection is bounded, ownership-aware, and cannot dispatch without the isolated guard", async () => {
  const f=await fixture(); const authorization=await serviceFor(()=>f.decision).authorize({authority:f.decision.authority,decisionId:f.decision.decisionId}); let executeCalls=0; let reconcileCalls=0;
  const worker=new RefundProcessingWorker({async execute(){executeCalls++; return {refundId:authorization.refundId,state:RefundStatus.COMPLETED,replayed:false};},async reconcile(){reconcileCalls++; return {refundId:authorization.refundId,state:RefundStatus.PENDING,replayed:false};}} as any);
  const inspection=await worker.run({mode:"INSPECTION",limit:1}); assert.equal(inspection.discovered,1); assert.equal(executeCalls,0); assert.equal(reconcileCalls,0); assert.equal((await Refund.findById(authorization.refundId).orFail()).status,"APPROVED");
  const before=process.env.STHN_ISOLATED_FINANCIAL_TEST; delete process.env.STHN_ISOLATED_FINANCIAL_TEST;
  try { await assert.rejects(()=>worker.run({mode:"ISOLATED_TEST_DISPATCH"}),/explicitly isolated/); } finally { if(before===undefined) delete process.env.STHN_ISOLATED_FINANCIAL_TEST; else process.env.STHN_ISOLATED_FINANCIAL_TEST=before; }
});

test("final dispute allocation is the only partial-refund authority and a final appeal supersedes it", async () => {
  const f = await fixture(); const booking = await Booking.findById(f.payment.bookingId).orFail();
  const entitlement = await CreatorEntitlement.create({ decisionAuthority:"test", decisionId:"allocation", fingerprint:"x", bookingId:booking._id,paymentId:f.payment._id,creatorId:booking.creatorId,currency:f.payment.currency,totalAmount:f.payment.amount,creatorAmount:400,platformAmount:f.payment.amount-400,customerRefundAmount:0,state:"HELD" });
  const dispute = await Dispute.create({ bookingId:booking._id,raisedBy:f.user._id,raisedByRole:"USER",reason:"x",status:"RESOLVED" });
  await CreatorEntitlementFinancialAllocation.create({ authority:"DISPUTE_FINAL_DECISION_V1",decisionId:String(dispute._id),fingerprint:"d",entitlementId:entitlement._id,bookingId:booking._id,paymentId:f.payment._id,disputeId:dispute._id,creatorId:booking.creatorId,customerId:f.user._id,currency:f.payment.currency,totalAmount:f.payment.amount,approvedCreatorAmount:300,approvedCustomerRefundAmount:100,platformAmount:f.payment.amount-400,decidedBy:f.user._id,finalizedAt:new Date(),reasonReference:"x",version:1 });
  const reader=new AuthoritativeRefundDecisionReader(); const session=await mongoose.startSession(); let decision: AuthorizedRefundDecision | null; try { decision=await session.withTransaction(() => reader.readAuthorized("DISPUTE_FINAL_DECISION_V1",String(dispute._id),session)); } finally { await session.endSession(); }
  assert.equal(decision?.amount,100); const partial=serviceFor(()=>decision,{fullRefund:true,partialRefund:true,idempotent:true,authenticatedLookup:true}); await partial.authorize({authority:"DISPUTE_FINAL_DECISION_V1",decisionId:String(dispute._id)}); assert.equal(await Refund.countDocuments(),1);
  const appeal=await Appeal.create({disputeId:dispute._id,raisedBy:f.user._id,raisedByRole:"USER",reason:"x",status:"REJECTED",decision:{action:"CONFIRM_DECISION",decidedBy:f.user._id,decidedAt:new Date()}});
  const later=await mongoose.startSession(); try { await later.withTransaction(async()=>{assert.equal(await reader.readAuthorized("DISPUTE_FINAL_DECISION_V1",String(dispute._id),later),null);}); } finally { await later.endSession(); }
  assert.equal(await CreatorEntitlement.findById(entitlement._id).orFail().then(x=>x.creatorAmount),400);
});
