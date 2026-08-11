"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const withdrawalReservedBalanceReconciliation_service_1 = require("../services/financial/withdrawalReservedBalanceReconciliation.service");
async function main() { if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required"); const args = process.argv.slice(2); const dryRun = !args.includes("--apply"); const limitArg = args.find((arg) => arg.startsWith("--limit=")); const limit = Number(limitArg?.split("=")[1] ?? 100); await mongoose_1.default.connect(process.env.MONGODB_URI); try {
    console.log(JSON.stringify(await withdrawalReservedBalanceReconciliation_service_1.withdrawalReservedBalanceReconciliationService.reconcile({ dryRun, limit }), null, 2));
}
finally {
    await mongoose_1.default.disconnect();
} }
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
