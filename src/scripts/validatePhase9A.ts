import fs from "node:fs";
import path from "node:path";

const backend = path.resolve(__dirname, "../..");
const workspace = path.resolve(backend, "..");
const read = (file: string) =>
  fs.readFileSync(path.join(backend, file), "utf8");
const exists = (file: string) =>
  fs.existsSync(path.join(backend, file));
const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const hasAll = (source: string, values: string[], label: string) => {
  for (const value of values) {
    expect(source.includes(value), `${label}: ${value}`);
  }
};

const required = [
  "src/enums/financial/creatorWithdrawalRequestStatus.enum.ts",
  "src/errors/financial/CreatorWithdrawalRequestError.ts",
  "src/utils/financial/creatorWithdrawalRequestIdentity.util.ts",
  "src/models/creatorWithdrawalRequest.model.ts",
  "src/repositories/creatorWithdrawalRequest.repository.ts",
  "src/services/financial/creatorWithdrawalRequest.service.ts",
  "src/tests/financial/phase9a/phase9a.runtime.test.ts",
  "src/tests/financial/phase9a/withdrawalReservation.test.ts",
  "src/tests/financial/phase9a/withdrawalReplay.test.ts",
  "src/tests/financial/phase9a/withdrawalConcurrency.test.ts",
  "src/tests/financial/phase9a/withdrawalFailure.test.ts",
  "src/tests/financial/phase9a/withdrawalEligibility.test.ts",
  "src/tests/financial/phase9a/withdrawalRegression.test.ts",
  "src/tests/financial/phase9a/fixtures/creatorWithdrawalRequestFixtures.ts",
];
for (const file of required) {
  expect(exists(file), `Missing Phase 9A file: ${file}`);
}

const status = read(required[0]);
const identity = read(required[2]);
const model = read(required[3]);
const repository = read(required[4]);
const service = read(required[5]);
const controller = read("src/controllers/withdrawal.controller.ts");
const accounts = read("src/enums/financial/ledgerAccount.enum.ts");
const entryTypes = read("src/enums/financial/ledgerEntryType.enum.ts");
const sources = read("src/enums/financial/ledgerSource.enum.ts");
const actions = read("src/enums/financial/auditAction.enum.ts");
const tests = required.filter((file) => file.includes("/phase9a/"))
  .map(read).join("\n");
const packageJson = read("package.json");

hasAll(status, ['PENDING = "PENDING"', 'RESERVED = "RESERVED"'],
  "Withdrawal reservation statuses missing");
for (const forbidden of [
  "claimFinalizationIdentity",
  "finalizeClaimed",
  "CREATOR_WITHDRAWAL_COMPLETED",
  "CREATOR_WITHDRAWAL_FAILED_RELEASED",
  "WITHDRAWAL_PROVIDER_FINALIZATION",
]) {
  expect(!service.includes(forbidden),
    `Phase 9A implements later withdrawal finalization: ${forbidden}`);
}
hasAll(model, [
  "withdrawalReference",
  "withdrawalKey",
  "creatorId",
  "creatorUserId",
  "walletId",
  "destinationId",
  "reservedAmount",
  "requestFingerprint",
  "ledgerTransactionReference",
  "projectionReference",
  "requestedAt",
  "version",
  "creator_withdrawal_one_active",
], "Withdrawal authority incomplete");
hasAll(identity, [
  "creatorId",
  "creatorUserId",
  "walletId",
  "destinationId",
  "destinationReference",
  "currency",
  "amount",
  "withdrawalReference",
  "requestFingerprint",
], "Deterministic identity incomplete");
hasAll(repository, [
  "createPending",
  "findByKey",
  "findActiveByCreatorUser",
  "CreatorWithdrawalRequestStatus.RESERVED",
], "Withdrawal repository authority incomplete");
hasAll(service, [
  "withdrawalEligibilityService.evaluate",
  "CreatorProfile.findOne",
  "walletRepository.findByUserAndCurrency",
  "PayoutDestinationVerificationStatus.VERIFIED",
  "assertSettlementIntegrity",
  "LedgerAccount.WALLET_AVAILABLE",
  "LedgerAccount.WITHDRAWAL_RESERVED",
  "ledgerService.createDebit",
  "ledgerService.createCredit",
  "walletProjectionService.applyProjectionMutation",
  "availableBalance: -authority.amount",
  "reservedBalance: authority.amount",
  "CreatorWithdrawalRequestStatus.RESERVED",
  "AuditAction.CREATOR_WITHDRAWAL_REQUESTED",
  "validateReplay",
  "session.withTransaction",
], "Withdrawal reservation service incomplete");
hasAll(accounts, ['WITHDRAWAL_RESERVED = "WITHDRAWAL_RESERVED"'],
  "Withdrawal Ledger account missing");
hasAll(entryTypes, [
  'CREATOR_WITHDRAWAL_RESERVED = "CREATOR_WITHDRAWAL_RESERVED"',
], "Withdrawal Ledger type missing");
hasAll(sources, [
  'CREATOR_WITHDRAWAL_RESERVATION = "CREATOR_WITHDRAWAL_RESERVATION"',
], "Withdrawal Ledger source missing");
hasAll(actions, [
  'CREATOR_WITHDRAWAL_REQUESTED = "CREATOR_WITHDRAWAL_REQUESTED"',
], "Withdrawal audit action missing");

const requestStart = controller.indexOf("async requestWithdrawal");
const refreshStart = controller.indexOf("async refreshWithdrawalPayout");
const requestController = controller.slice(requestStart, refreshStart);
hasAll(requestController, [
  "creatorWithdrawalRequestService.request",
  "authenticatedUserId: req.user.id",
], "Authenticated withdrawal entrypoint missing");
for (const forbidden of [
  "initializeReservedWithdrawalPayout",
  "processInitializedWithdrawalPayout",
  "walletId:",
  "creatorId:",
  "userId:",
]) {
  expect(!requestController.includes(forbidden),
    `Phase 9A request entrypoint contains forbidden authority: ${forbidden}`);
}
for (const forbidden of [
  "InternalPayment",
  "InternalTopUpFunding",
  "providerPayout",
  "internalPayout",
  "bank transfer",
  "UPI transfer",
  "refundService",
  "Payout.create",
  "WithdrawalStatus.COMPLETED",
]) {
  expect(!service.includes(forbidden),
    `Phase 9A service contains forbidden later-phase dependency: ${forbidden}`);
}
expect(!/Wallet\.(update|findOneAndUpdate|findByIdAndUpdate|create)/.test(service),
  "Phase 9A service directly mutates Wallet.");

hasAll(tests, [
  "one balanced Ledger transaction",
  "validation replay preserve one reservation",
  "ten identical requests converge",
  "every injected reservation interruption rolls back",
  "rejects unauthenticated or client identity fields",
  "preserves Phase 8F integrity",
], "Phase 9A runtime proof incomplete");
expect(packageJson.includes('"validate:phase9a"') &&
  packageJson.includes('"test:phase9a"'),
  "Phase 9A package commands missing.");
expect(fs.existsSync(path.join(
  workspace,
  "docs/implementation/phase-9a-withdrawal-wallet-reservation.md",
)), "Phase 9A documentation missing.");

console.log(
  "Phase 9A Creator withdrawal Wallet reservation static validation passed; MongoDB behavior requires test:phase9a.",
);
