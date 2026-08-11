import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const includesAll = (source: string, values: readonly string[]) =>
  values.every((value) => source.includes(value));
const between = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex >= 0 && endIndex > startIndex, `Could not locate source section ${start}.`);
  return source.slice(startIndex, endIndex);
};
const occurrences = (source: string, value: string) =>
  source.split(value).length - 1;

const orchestrator = read("src/services/financial/topUpAccountingOrchestrator.service.ts");
const accountingError = read("src/errors/financial/WalletTopUpAccountingError.ts");
const requestRepository = read("src/repositories/walletTopUpRequest.repository.ts");
const projectionRepository = read("src/repositories/wallet/walletProjectionOperation.repository.ts");
const requestModel = read("src/models/walletTopUpRequest.model.ts");
const projectionModel = read("src/models/walletProjectionOperation.model.ts");
const ledgerService = read("src/services/financial/ledger.service.ts");
const projectionService = read("src/services/wallet/walletProjection.service.ts");
const adminRoutes = read("src/routes/v1/admin.financial.routes.ts");

const identity = between(
  orchestrator,
  "  private accountingIdentity(",
  "  private projectionReference(",
);
expect(includesAll(identity, [
  "request.topUpReference",
  "funding.fundingReference",
  "request.userId",
  "request.walletId",
  "request.amount",
  "request.currency",
  "createHash(\"sha256\")",
  "transactionId",
  "postingKey",
  "operationKey",
]), "Deterministic accounting identity is incomplete.");
for (const forbidden of [
  "admin", "completedAt", "requestedAt", "Date.now", "new Date",
  "random", "randomUUID", "req.", "currentBalance", "availableBalance",
]) {
  expect(!identity.toLowerCase().includes(forbidden.toLowerCase()),
    `Accounting identity contains unstable input ${forbidden}.`);
}

const fundingValidation = between(
  orchestrator,
  "  private validateFundingIdentity(",
  "  private validateLedgerIdentity(",
);
expect(includesAll(fundingValidation, [
  "providerFundingId",
  "providerFundingReference",
  "funding._id.equals",
  "funding.topUpRequestId.equals",
  "funding.topUpReference",
  "InternalTopUpFundingStatus.SUCCEEDED",
  "funding.amount !== request.amount",
  "funding.currency !== request.currency",
  "\"PROVIDER_LINK_MISSING\"",
  "\"PROVIDER_LINK_CONFLICT\"",
  "\"PROVIDER_NOT_SUCCEEDED\"",
]), "Provider funding validation is incomplete.");
for (const mutation of ["markProcessing", "markSucceeded", "markFailed", "recordEvent", "createFunding"]) {
  expect(!orchestrator.includes(mutation), `Accounting orchestrator mutates provider funding via ${mutation}.`);
}

const ledgerValidation = between(
  orchestrator,
  "  private validateLedgerIdentity(",
  "  private validateProjectionIdentity(",
);
expect(includesAll(ledgerValidation, [
  "ledger.transactionId",
  "LedgerEntryType.WALLET_TOP_UP",
  "LedgerSource.INTERNAL_TOP_UP_FUNDING",
  "MoneyDirection.CREDIT",
  "LedgerAccount.CASH",
  "ledger.userId?.equals(request.userId)",
  "metadata.topUpReference",
  "metadata.providerFundingReference",
  "request.ledgerEntryId",
  "request.ledgerReference",
  "ledger.amount !== request.amount",
  "ledger.currency !== request.currency",
  "\"LEDGER_IDENTITY_CONFLICT\"",
]), "Ledger replay validation is incomplete.");

const ledgerEstablishment = between(
  orchestrator,
  "  private async establishOrReuseLedger(",
  "  private async establishOrReuseProjection(",
);
expect(includesAll(ledgerEstablishment, [
  "discovered",
  "if (!ledger)",
  "ledgerService.createCredit",
  "LedgerEntryType.WALLET_TOP_UP",
  "LedgerSource.INTERNAL_TOP_UP_FUNDING",
  "LedgerAccount.CASH",
  "identity.transactionId",
  "identity.postingKey",
  "ledgerEntryRepository.findByPostingKey(identity.postingKey)",
  "this.validateLedgerIdentity",
]), "Ledger creation/reuse boundary is incomplete.");
expect(!orchestrator.includes("ledgerEntryRepository.update") &&
  !orchestrator.includes("LedgerEntry.findOneAndUpdate"),
  "Accounting orchestrator contains a generic Ledger mutation.");

const projectionValidation = between(
  orchestrator,
  "  private validateProjectionIdentity(",
  "  private validateProcessingRequestLinks(",
);
expect(includesAll(projectionValidation, [
  "operation.operationReference",
  "this.projectionReference(identity.operationKey)",
  "operation.operationKey",
  "operation.walletId.equals(request.walletId)",
  "operation.userId.equals(request.userId)",
  "operation.currency",
  "operation.deltas.availableBalance",
  "operation.deltas.reservedBalance !== 0",
  "operation.deltas.lockedBalance !== 0",
  "operation.ledgerEntryIds.length !== 1",
  "operation.fingerprint",
  "this.projectionFingerprint",
  "request.walletProjectionOperationId",
  "request.walletProjectionOperationReference",
  "\"PROJECTION_IDENTITY_CONFLICT\"",
]), "Wallet projection replay validation is incomplete.");

const projectionEstablishment = between(
  orchestrator,
  "  private async establishOrReuseProjection(",
  "  private async validateCompletedAccountingReplay(",
);
expect(includesAll(projectionEstablishment, [
  "discovered",
  "if (!operation)",
  "walletProjectionService.applyProjectionMutation",
  "walletProjectionOperationRepository.findByOperationKey(identity.operationKey)",
  "this.validateProjectionIdentity",
]), "Wallet projection creation/reuse boundary is incomplete.");
for (const forbidden of [
  "Wallet.find", "applyConditionalDelta", "$inc", ".save(",
  "availableBalance =", "currentBalance =", "reservedBalance =", "lockedBalance =",
]) {
  expect(!orchestrator.includes(forbidden), `Orchestrator directly mutates Wallet state via ${forbidden}.`);
}

const processingLinks = between(
  orchestrator,
  "  private validateProcessingRequestLinks(",
  "  private async establishOrReuseLedger(",
);
expect(includesAll(processingLinks, [
  "request.accountingTransactionId",
  "\"TRANSACTION_CONFLICT\"",
  "request.ledgerEntryId",
  "request.ledgerReference",
  "\"LEDGER_NOT_FOUND\"",
  "request.walletProjectionOperationId",
  "request.walletProjectionOperationReference",
  "\"PROJECTION_NOT_FOUND\"",
  "if (!ledger)",
  "this.validateLedgerIdentity",
  "this.validateProjectionIdentity",
]), "PROCESSING partial-state conflict validation is incomplete.");

const completedReplay = between(
  orchestrator,
  "  private async validateCompletedAccountingReplay(",
  "  private validateCompletionWinner(",
);
expect(includesAll(completedReplay, [
  "findByReferenceForAccounting",
  "providerFundingId",
  "providerFundingReference",
  "ledgerEntryId",
  "ledgerReference",
  "walletProjectionOperationId",
  "walletProjectionOperationReference",
  "accountingTransactionId",
  "completedAt",
  "accountingCompletedAt",
  "internalTopUpFundingRepository.findByFundingReference",
  "ledgerEntryRepository.findById",
  "walletProjectionOperationRepository.findById",
  "walletRepository.findById",
  "this.validateFundingIdentity",
  "this.validateLedgerIdentity",
  "this.validateProjectionIdentity",
]), "Completed replay graph validation or durable links are incomplete.");
for (const write of [
  "createCredit", "createEntry", "applyProjectionMutation", "applyConditionalDelta",
  "completeProcessingWithAccounting", "markSucceeded", "markFailed", "recordEvent", ".save(",
]) {
  expect(!completedReplay.includes(write), `Completed replay is not read-only: ${write}.`);
}

const guardRecovery = between(
  orchestrator,
  "  private async completeProcessingOrRecover(",
  "  async complete(",
);
expect(includesAll(guardRecovery, [
  "completeProcessingWithAccounting",
  "walletProjectionOperationReference: operation.operationReference",
  "const completedAt = new Date()",
  "findByReferenceForAccounting",
  "WalletTopUpRequestStatus.COMPLETED",
  "this.completedWinnerOrThrow",
  "WalletTopUpRequestStatus.PROCESSING",
  "\"INVALID_REQUEST_STATUS\"",
  "\"COMPLETION_CONFLICT\"",
]), "Guard-loser recovery is incomplete.");
expect(occurrences(guardRecovery, "await complete()") === 2,
  "Guarded completion must execute initially and retry exactly once.");
expect(occurrences(guardRecovery, "findByReferenceForAccounting") === 2,
  "Guard recovery must reload after each guarded completion loss.");
for (const duplicateEffect of ["createCredit", "applyProjectionMutation"]) {
  expect(!guardRecovery.includes(duplicateEffect),
    `Guard recovery can duplicate a financial effect via ${duplicateEffect}.`);
}

const winnerValidation = between(
  orchestrator,
  "  private validateCompletionWinner(",
  "  private async completedWinnerOrThrow(",
);
expect(includesAll(winnerValidation, [
  "winner.providerFundingId?.equals",
  "winner.providerFundingReference",
  "winner.ledgerEntryId?.equals",
  "winner.ledgerReference",
  "winner.walletProjectionOperationId?.equals",
  "winner.walletProjectionOperationReference",
  "winner.accountingTransactionId",
  "winner.amount",
  "winner.currency",
  "\"COMPLETION_CONFLICT\"",
]), "Completion winner identity comparison is incomplete.");

const publicComplete = between(
  orchestrator,
  "  async complete(",
  "\n  }\n}\n\nexport const",
);
const completedBranch = publicComplete.indexOf(
  "request.status === WalletTopUpRequestStatus.COMPLETED",
);
const ledgerStage = publicComplete.indexOf("this.establishOrReuseLedger");
const projectionStage = publicComplete.indexOf("this.establishOrReuseProjection");
expect(completedBranch >= 0 && completedBranch < ledgerStage && completedBranch < projectionStage,
  "COMPLETED replay does not exit before accounting-write stages.");
expect(includesAll(publicComplete, [
  "WalletTopUpRequestStatus.PROCESSING",
  "ledgerEntryRepository.findByPostingKey(identity.postingKey)",
  "walletProjectionOperationRepository.findByOperationKey(identity.operationKey)",
  "this.validateProcessingRequestLinks",
  "this.establishOrReuseLedger",
  "this.establishOrReuseProjection",
  "this.completeProcessingOrRecover",
  "walletRepository.findById(request.walletId)",
  "wallet.userId.equals(request.userId)",
  "wallet.currency !== request.currency",
]), "PROCESSING continuation or Wallet validation is incomplete.");
expect(publicComplete.indexOf("findByPostingKey(identity.postingKey)") <
  publicComplete.indexOf("this.establishOrReuseLedger"),
  "Prior Ledger stage is not discovered before Ledger establishment.");
expect(publicComplete.indexOf("findByOperationKey(identity.operationKey)") <
  publicComplete.indexOf("this.establishOrReuseProjection"),
  "Prior projection stage is not discovered before projection establishment.");

expect(requestRepository.includes(
  "status: WalletTopUpRequestStatus.PROCESSING",
) && requestRepository.includes(
  "status: WalletTopUpRequestStatus.COMPLETED",
), "Top-up accounting completion is not a guarded PROCESSING to COMPLETED transition.");
expect(includesAll(requestRepository, [
  "providerFundingReference",
  "ledgerEntryId",
  "ledgerReference",
  "walletProjectionOperationId",
  "walletProjectionOperationReference",
  "accountingTransactionId",
  "accountingCompletedAt",
  "completedAt",
]), "Guarded completion does not persist the durable accounting graph.");
expect(!requestRepository.includes("updateStatus") &&
  !requestRepository.includes("genericUpdate"),
  "Generic top-up status mutation was introduced.");
expect(requestRepository.includes(
  '.select("+providerFundingId +ledgerEntryId +walletProjectionOperationId")',
), "Accounting lookup does not select hidden request links.");
expect(requestModel.includes("providerFundingId:") &&
  requestModel.includes("ledgerEntryId:") &&
  requestModel.includes("walletProjectionOperationId:"),
  "Top-up request durable accounting fields are missing.");

expect(projectionRepository.includes("findById") &&
  projectionRepository.includes('.select("+fingerprint")') &&
  projectionRepository.includes("findByOperationKey"),
  "Projection operation replay lookups or hidden fingerprint selection are missing.");
expect(includesAll(projectionModel, [
  "operationReference:",
  "walletId:",
  "userId:",
  "currency:",
  "operationKey:",
  "fingerprint:",
  "deltas:",
  "ledgerEntryIds:",
]), "Projection operation immutable identity model is incomplete.");
expect(ledgerService.includes("async createCredit(") &&
  projectionService.includes("async applyProjectionMutation("),
  "Required bounded Ledger or Wallet projection abstraction is missing.");

for (const code of [
  "WALLET_TOP_UP_ACCOUNTING_NOT_FOUND",
  "WALLET_TOP_UP_ACCOUNTING_INVALID_REQUEST_STATUS",
  "WALLET_TOP_UP_ACCOUNTING_PROVIDER_LINK_MISSING",
  "WALLET_TOP_UP_ACCOUNTING_PROVIDER_LINK_CONFLICT",
  "WALLET_TOP_UP_ACCOUNTING_PROVIDER_NOT_SUCCEEDED",
  "WALLET_TOP_UP_ACCOUNTING_WALLET_NOT_FOUND",
  "WALLET_TOP_UP_ACCOUNTING_WALLET_OWNERSHIP_CONFLICT",
  "WALLET_TOP_UP_ACCOUNTING_CURRENCY_CONFLICT",
  "WALLET_TOP_UP_ACCOUNTING_AMOUNT_CONFLICT",
  "WALLET_TOP_UP_ACCOUNTING_LEDGER_NOT_FOUND",
  "WALLET_TOP_UP_ACCOUNTING_LEDGER_IDENTITY_CONFLICT",
  "WALLET_TOP_UP_ACCOUNTING_PROJECTION_NOT_FOUND",
  "WALLET_TOP_UP_ACCOUNTING_PROJECTION_IDENTITY_CONFLICT",
  "WALLET_TOP_UP_ACCOUNTING_LINK_MISSING",
  "WALLET_TOP_UP_ACCOUNTING_TRANSACTION_CONFLICT",
  "WALLET_TOP_UP_ACCOUNTING_COMPLETION_CONFLICT",
  "WALLET_TOP_UP_ACCOUNTING_INTEGRITY_ERROR",
]) {
  expect(accountingError.includes(code), `Accounting error contract is missing ${code}.`);
}
expect(!/this\.error\(\s*["'`][^"'`]*(fingerprint|idempotency|index|database filter|_id)/i.test(orchestrator),
  "Client-facing accounting error exposes internal persistence details.");

for (const forbiddenBoundary of [
  "paymentLifecycleService",
  "InternalPayment",
  "PaymentLifecycle",
  "bookingRepository",
  "settlementService",
  "refundService",
  "earningsService",
  "commissionService",
  "withdrawalService",
  "payoutService",
  "governanceService",
]) {
  expect(!orchestrator.includes(forbiddenBoundary),
    `Phase 7F crosses a frozen domain boundary via ${forbiddenBoundary}.`);
}
for (const forbiddenMechanism of [
  "new Map(", "new Set(", "Mutex", "setInterval(", "setTimeout(",
  "reconcile", "repair", "worker", "randomUUID", "Math.random",
]) {
  expect(!orchestrator.toLowerCase().includes(forbiddenMechanism.toLowerCase()),
    `Forbidden Phase 7F mechanism found: ${forbiddenMechanism}.`);
}
expect(!orchestrator.includes("/ 100") && !orchestrator.includes("* 100") &&
  !orchestrator.includes("Math.round") && !orchestrator.includes("parseFloat"),
  "Phase 7F converts minor-unit amounts.");
expect(adminRoutes.includes("complete-accounting"),
  "Phase 7F accounting route is missing.");

console.log("Phase 7F accounting orchestration validation passed.");
