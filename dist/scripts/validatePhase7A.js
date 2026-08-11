"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const root = path_1.default.resolve(__dirname, "..");
const read = (...parts) => fs_1.default.readFileSync(path_1.default.join(root, ...parts), "utf8");
const expect = (condition, message) => {
    if (!condition)
        throw new Error(message);
};
const reasons = read("enums", "financial", "withdrawalEligibilityReason.enum.ts");
const policy = read("services", "financial", "withdrawalEligibility.service.ts");
const withdrawals = read("services", "financial", "withdrawal.service.ts");
for (const reason of ["INVALID_AMOUNT", "CREATOR_INACTIVE", "GOVERNANCE_BLOCK", "NO_VERIFIED_DESTINATION", "UNSUPPORTED_CURRENCY", "INSUFFICIENT_BALANCE", "PENDING_WITHDRAWAL"]) {
    expect(reasons.includes(`${reason} = \"${reason}\"`), `Missing eligibility reason ${reason}.`);
}
expect(policy.includes("| { allowed: true }") && policy.includes("| { allowed: false; reason: WithdrawalEligibilityReason }"), "Eligibility result is not discriminated.");
expect(policy.includes("isValidMoney(input.amount)") && policy.includes("input.amount.amount <= 0"), "Positive amount validation is missing.");
expect(policy.includes("CreatorProfile.findOne") && policy.includes('creator.status !== "active"'), "Creator active-profile check is missing.");
expect(policy.includes("hasNoAccountAccess") && !policy.includes("blocksOutgoingBookings") && !policy.includes("blocksAcceptingBookings"), "Governance boundary is broader than hard account denial.");
expect(policy.includes("payoutDestinationService.get") && !policy.includes("encryptedPayload"), "Selected destination safe read is missing.");
expect(policy.includes("creatorBalanceService.getBalance") && !policy.includes("wallet"), "CreatorBalance authority is missing or Wallet is used.");
expect(policy.includes("balance.currency !== input.amount.currency") && policy.includes("balance.availableBalance < input.amount.amount"), "Currency or balance checks are missing.");
expect(policy.includes("withdrawalRepository.findActiveByCreator"), "Active withdrawal precheck is missing.");
for (const forbidden of ["startSession", ".create(", "reserveAvailableBalance", "ledgerService", "initializePayout", "createFinancialAudit", "generateFinancialReference"]) {
    expect(!policy.includes(forbidden), `Eligibility policy is not read-only: ${forbidden}`);
}
const existingIndex = withdrawals.indexOf("if (existing) {");
const eligibilityIndex = withdrawals.indexOf("withdrawalEligibilityService.evaluate");
const transactionIndex = withdrawals.indexOf("const session = await mongoose.startSession()");
expect(existingIndex >= 0 && existingIndex < eligibilityIndex && eligibilityIndex < transactionIndex, "Idempotency and eligibility ordering is incorrect.");
expect(withdrawals.includes("createWithdrawalBindingSnapshot") && withdrawals.includes("findActiveByCreator(input.creatorId, session)") && withdrawals.includes("reserveAvailableBalance"), "Transactional withdrawal protections were removed.");
console.log("Phase 7A withdrawal eligibility validation passed.");
