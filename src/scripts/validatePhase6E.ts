import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const expect = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const withdrawalModel = read("models", "withdrawal.model.ts");
const withdrawalRepository = read("repositories", "withdrawal.repository.ts");
const executionService = read("services", "financial", "withdrawalDestinationExecution.service.ts");
const internalPayoutModel = read("models", "internalProvider", "internalPayout.model.ts");
const provider = read("services", "financial", "providers", "internalPayout.provider.ts");
const lifecycle = read("services", "financial", "withdrawalPayoutLifecycle.service.ts");
const contracts = read("contracts", "financial", "payoutProvider.types.ts");

expect(withdrawalModel.includes("encryptedPayload: { type: EncryptedWithdrawalDestinationSnapshotPayloadSchema") && withdrawalModel.includes("select: false"), "Withdrawal snapshot encrypted payload is not protected by default.");
expect(withdrawalRepository.includes("+destinationSnapshot.encryptedPayload"), "Secure withdrawal execution query does not explicitly select the snapshot payload.");
expect(executionService.includes("PayoutDestinationType.BANK_ACCOUNT") && executionService.includes("PayoutDestinationType.UPI"), "Execution service does not support both typed destination variants.");
expect(executionService.includes("WITHDRAWAL_DESTINATION_SNAPSHOT_REQUIRED") && executionService.includes("snapshot.version !== 1"), "Execution service does not reject missing or unsupported snapshots.");
expect(internalPayoutModel.includes("fingerprint: { type: String, required: true, immutable: true, select: false") && internalPayoutModel.includes("encryptedPayload: { type: EncryptedProviderDestinationPayloadSchema, required: true, immutable: true, select: false"), "InternalPayout protected destination fields are incomplete.");
expect(!internalPayoutModel.includes("accountNumber: {") && !internalPayoutModel.includes("upiId: {"), "InternalPayout exposes a raw destination field.");
expect(contracts.includes("PayoutProviderInitializationIdentity") && contracts.includes("destinationFingerprint: string"), "Provider initialization identity contract is missing.");
expect(provider.includes("initializationIdentity: this.initializationIdentity(existing)") && provider.includes("initializationIdentity: this.initializationIdentity(persisted)"), "Provider does not return persisted identity for replay and creation.");
expect(lifecycle.includes("verifyProviderInitializationIdentity(") && lifecycle.includes("identity.amount.amount !== withdrawal.amount") && lifecycle.includes("identity.amount.currency !== withdrawal.currency") && lifecycle.includes("identity.payoutId !== payout._id.toString()") && lifecycle.includes("identity.destinationSnapshotVersion !== destination.snapshotVersion") && lifecycle.includes("fingerprintsEqual(identity.destinationFingerprint, expectedFingerprint)"), "Lifecycle immutable provider identity verification is incomplete.");
expect(lifecycle.indexOf("verifyProviderInitializationIdentity(") < lifecycle.indexOf("synchronizeProviderInitialization("), "Provider identity verification is not before Financial synchronization.");
expect(lifecycle.includes("const providerResponse = await provider.initializePayout") && lifecycle.indexOf("const providerResponse = await provider.initializePayout") < lifecycle.indexOf("return this.synchronizeProviderInitialization("), "Provider invocation ordering is unsafe.");
expect(!provider.includes("console.log") && !executionService.includes("console.log"), "Sensitive destination execution code contains console logging.");

console.log("Phase 6E secure provider destination validation passed.");
