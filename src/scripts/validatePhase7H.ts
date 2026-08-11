import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../..");
const workspace = path.resolve(root, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file: string) => fs.existsSync(path.join(root, file));
const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const testRoot = "src/tests/financial/phase7h";
for (const file of [
  "helpers/database.ts",
  "fixtures/topUpFixtures.ts",
  "walletTopUpFullFlow.test.ts",
  "walletTopUpReplay.test.ts",
  "walletTopUpConcurrency.test.ts",
  "walletTopUpInterruptionRecovery.test.ts",
  "walletTopUpProviderFailure.test.ts",
  "walletTopUpReconciliation.test.ts",
  "walletTopUpRepair.test.ts",
  "walletTopUpIntegrity.test.ts",
  "bookingPaymentRegression.test.ts",
  "phase7h.runtime.test.ts",
]) expect(exists(`${testRoot}/${file}`), `Missing Phase 7H runtime test file ${file}.`);

const database = read(`${testRoot}/helpers/database.ts`);
expect(database.includes('process.env.NODE_ENV, "test"') &&
  database.includes("/(test|testing|ci)/i") &&
  database.includes("MongoMemoryReplSet") &&
  database.includes("Refusing cleanup") &&
  database.includes("deleteMany") &&
  database.includes("disconnectPhase7HDatabase"),
  "MongoDB runtime isolation or cleanup guard is incomplete.");

const fullFlow = read(`${testRoot}/walletTopUpFullFlow.test.ts`);
const replay = read(`${testRoot}/walletTopUpReplay.test.ts`);
const concurrency = read(`${testRoot}/walletTopUpConcurrency.test.ts`);
const interruption = read(`${testRoot}/walletTopUpInterruptionRecovery.test.ts`);
const failure = read(`${testRoot}/walletTopUpProviderFailure.test.ts`);
const reconciliation = read(`${testRoot}/walletTopUpReconciliation.test.ts`);
const repair = read(`${testRoot}/walletTopUpRepair.test.ts`);
const integrity = read(`${testRoot}/walletTopUpIntegrity.test.ts`);
const booking = read(`${testRoot}/bookingPaymentRegression.test.ts`);
const suite = [
  fullFlow, replay, concurrency, interruption, failure,
  reconciliation, repair, integrity, booking,
].join("\n");

for (const marker of [
  "LedgerEntryType.WALLET_TOP_UP", "LedgerSource.INTERNAL_TOP_UP_FUNDING",
  "MoneyDirection.CREDIT", "LedgerAccount.CASH", "deltas.availableBalance",
  "reservedBalance", "lockedBalance", "WalletTopUpRequestStatus.COMPLETED",
]) expect(fullFlow.includes(marker), `Full-flow runtime proof missing ${marker}.`);
expect(replay.includes("const immediate") && replay.includes("Admin endpoint") &&
  replay.includes("ledgerCount, 1") && replay.includes("projectionCount, 1"),
  "Completed replay runtime proof is incomplete.");
expect(concurrency.includes("Array.from({ length: 10 }") &&
  concurrency.includes("Promise.allSettled") &&
  concurrency.includes("1_000") && concurrency.includes("2_500") &&
  concurrency.includes("400") && concurrency.includes("3_900"),
  "Same-request or same-Wallet concurrency proof is incomplete.");
for (const marker of [
  "provider success with no accounting", "Ledger-only state",
  "Ledger-plus-projection state",
]) expect(interruption.includes(marker), `Interruption recovery proof missing ${marker}.`);
for (const marker of [
  "guarded finalization is idempotent", "concurrent finalizers",
  "existing Ledger or projection rejects", "retry/failure race",
]) expect(failure.includes(marker), `Provider-failure runtime proof missing ${marker}.`);
expect(reconciliation.includes("concurrent inspections") &&
  reconciliation.includes("Classification.COMPLETED_VALID") &&
  reconciliation.includes("Classification.COMPLETED_CORRUPTED") &&
  reconciliation.includes("WalletTopUpRetryAttempt") &&
  reconciliation.includes("concurrent requests"),
  "Reconciliation classification, deduplication, or retry proof is incomplete.");
expect(repair.includes("exact replay is idempotent") &&
  repair.includes("stale snapshot rejects") &&
  repair.includes("concurrent identical repairs") &&
  repair.includes("repair forbidden"),
  "Repair idempotency, race, or forbidden-repair proof is incomplete.");
expect(integrity.includes("completed corruption fails closed") &&
  integrity.includes("Wallet-versus-Ledger proof") &&
  integrity.includes("MongoDB indexes") &&
  integrity.includes("explicit session"),
  "Corruption, integrity, index, or session proof is incomplete.");
expect(booking.includes("Payment.countDocuments") &&
  booking.includes("InternalPayment.countDocuments") &&
  booking.includes("unauthenticated/User/Creator rejected") &&
  booking.includes("audit persistence"),
  "Booking boundary, authorization, or audit proof is incomplete.");

for (const forbidden of [
  "setInterval(", "setTimeout(", "while (true)", "new Mutex",
  "globalLock", "productionWorker",
]) expect(!suite.includes(forbidden), `Phase 7H introduced forbidden runtime authority ${forbidden}.`);

const packageJson = read("package.json");
for (const script of [
  "validate:phase7h", "test:phase7h", "test:phase7h:full-flow",
  "test:phase7h:concurrency", "test:phase7h:reconciliation",
]) expect(packageJson.includes(`"${script}"`), `Missing package script ${script}.`);

const docs = path.join(
  workspace,
  "docs/implementation/phase-7h-runtime-financial-verification.md",
);
expect(fs.existsSync(docs), "Phase 7H runtime documentation is missing.");
console.log("Phase 7H runtime harness static validation passed; runtime behavior requires test:phase7h.");
