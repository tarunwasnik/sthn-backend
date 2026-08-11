import fs from "node:fs";
import path from "node:path";

const backend = path.resolve(__dirname, "../..");
const workspace = path.resolve(backend, "..");
const read = (file: string) => fs.readFileSync(path.join(backend, file), "utf8");
const exists = (file: string) => fs.existsSync(path.join(backend, file));
const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const hasAll = (source: string, values: string[], label: string) => {
  for (const value of values) expect(source.includes(value), `${label}: ${value}`);
};

const required = [
  "src/enums/financial/bookingCreatorSettlementFailureClassification.enum.ts",
  "src/enums/financial/bookingCreatorSettlementReconciliation.enum.ts",
  "src/errors/financial/BookingCreatorSettlementOperationalError.ts",
  "src/models/bookingCreatorSettlementReconciliation.model.ts",
  "src/models/bookingCreatorSettlementRetryAttempt.model.ts",
  "src/models/bookingCreatorSettlementRepairOperation.model.ts",
  "src/repositories/bookingCreatorSettlementReconciliation.repository.ts",
  "src/repositories/bookingCreatorSettlementRetryAttempt.repository.ts",
  "src/repositories/bookingCreatorSettlementRepairOperation.repository.ts",
  "src/services/financial/bookingCreatorSettlementOperationalInspection.service.ts",
  "src/services/financial/bookingCreatorSettlementReconciliation.service.ts",
  "src/services/financial/bookingCreatorSettlementRetry.service.ts",
  "src/services/financial/bookingCreatorSettlementRepair.service.ts",
  "src/tests/financial/phase8f/phase8f.runtime.test.ts",
  "src/tests/financial/phase8f/bookingCreatorSettlementReconciliation.test.ts",
  "src/tests/financial/phase8f/bookingCreatorSettlementRetry.test.ts",
  "src/tests/financial/phase8f/bookingCreatorSettlementRepair.test.ts",
  "src/tests/financial/phase8f/bookingCreatorSettlementOperationalAudit.test.ts",
  "src/tests/financial/phase8f/bookingCreatorSettlementRegression.test.ts",
];
for (const file of required) expect(exists(file), `Missing Phase 8F file: ${file}`);

const inspection = read(required[9]);
const reconciliation = read(required[10]);
const retry = read(required[11]);
const repair = read(required[12]);
const classifications = read(required[0]);
const actions = read("src/enums/financial/auditAction.enum.ts");
const tests = required.filter((file) => file.includes("/phase8f/"))
  .map(read).join("\n");
const packageJson = read("package.json");

hasAll(classifications, [
  "REPLAY_REQUIRED",
  "PENDING",
  "CORRUPTED_LEDGER",
  "CORRUPTED_PROJECTION",
  "CORRUPTED_SETTLEMENT",
  "MISSING_AUDIT",
  "INTEGRITY_FAILURE",
  "UNKNOWN",
], "Failure classification missing");
hasAll(inspection, [
  'booking.status !== "COMPLETED"',
  "PaymentStatus.CAPTURED",
  "BookingFundReservationStatus.CAPTURED",
  "BookingEscrowAllocationStatus.ALLOCATED",
  "LedgerAccount.CREATOR_PAYABLE",
  "LedgerAccount.WALLET_AVAILABLE",
  "BOOKING_CREATOR_SETTLED",
  "BOOKING_CREATOR_WALLET_SETTLEMENT",
  "allocationSettlementEntries",
  "expectedProjectionFingerprint",
  "SETTLEMENT_AUDIT_MISSING",
  "REPLAY_METADATA_MISSING",
  "snapshotFingerprint",
], "Read-only inspection proof missing");
hasAll(reconciliation, [
  "upsertObservation",
  "BOOKING_CREATOR_SETTLEMENT_RECONCILED",
  "session.withTransaction",
], "Reconciliation authority missing");
hasAll(retry, [
  "guardOperationalPendingToSettled",
  "BOOKING_CREATOR_SETTLEMENT_RETRIED",
  "REPLAY_REQUIRED",
  "financialEffectValid",
  "validateReplay",
  "session.withTransaction",
], "Retry authority missing");
hasAll(repair, [
  "RESTORE_MISSING_AUDIT",
  "RESTORE_REPLAY_METADATA",
  "guardRestoreLedgerEntryIds",
  "BOOKING_CREATOR_SETTLEMENT_REPAIRED",
  "financialEffectValid",
  "session.withTransaction",
], "Repair authority missing");
hasAll(actions, [
  "BOOKING_CREATOR_SETTLEMENT_RECONCILED",
  "BOOKING_CREATOR_SETTLEMENT_RETRIED",
  "BOOKING_CREATOR_SETTLEMENT_REPAIRED",
], "Operational audit actions missing");

for (const service of [inspection, reconciliation, retry, repair]) {
  for (const forbidden of [
    "walletProjectionService",
    "ledgerService",
    "InternalPayment",
    "InternalTopUpFunding",
    "payoutService",
    "withdrawalService",
    "refundService",
    "payoutDestination",
  ]) expect(!service.includes(forbidden),
    `Forbidden Phase 8F dependency found: ${forbidden}`);
}
expect(!/Wallet\.(update|findOneAndUpdate|findByIdAndUpdate|create)/.test(
  [inspection, reconciliation, retry, repair].join("\n"),
), "Phase 8F directly mutates a Wallet.");

hasAll(tests, [
  "complete Phase 8E graph without financial mutation",
  "ten concurrent reconciliation",
  "classifies Ledger, projection, settlement, audit, and PENDING",
  "concurrent retries",
  "missing audit repair",
  "concurrent replay-metadata repairs",
  "forbids repair of corrupted accounting",
  "reconciliation audit failure rolls back",
  "retry audit failure rolls back",
  "repair operational-audit failure rolls back",
  "no Wallet, accounting, provider, payout, withdrawal, or refund effect",
], "Phase 8F runtime proof missing");

expect(packageJson.includes('"validate:phase8f"') &&
  packageJson.includes('"test:phase8f"'),
  "Phase 8F package commands missing.");
expect(fs.existsSync(path.join(
  workspace,
  "docs/implementation/phase-8f-settlement-operational-integrity.md",
)), "Phase 8F documentation missing.");

console.log(
  "Phase 8F settlement operational integrity static validation passed; MongoDB behavior requires test:phase8f.",
);
