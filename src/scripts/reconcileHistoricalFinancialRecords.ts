import mongoose from "mongoose";
import dotenv from "dotenv";
import { historicalFinancialReconciliationService } from "../services/financial/historicalFinancialReconciliation.service";

dotenv.config();
const args = process.argv.slice(2);
const value = (name: string) => args[args.indexOf(name) + 1];
const dryRun = !args.includes("--apply");
const batchSize = Number(value("--batch-size") ?? 100);
const limit = Number(value("--limit") ?? batchSize);
if (
  !Number.isSafeInteger(batchSize) ||
  !Number.isSafeInteger(limit) ||
  batchSize < 1 ||
  limit < 1
)
  throw new Error("--batch-size and --limit must be positive safe integers.");
if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  try {
    const report =
      await historicalFinancialReconciliationService.reconcileBatch({
        dryRun,
        limit,
        paymentId: value("--payment-id"),
        bookingId: value("--booking-id"),
      });
    console.log(
      JSON.stringify(
        { mode: dryRun ? "dry-run" : "apply", batchSize, ...report },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((error) => {
  console.error(
    "Historical financial reconciliation failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
