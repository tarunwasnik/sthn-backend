import mongoose from "mongoose";
import "dotenv/config";
import { Withdrawal } from "../models/withdrawal.model";
import { CreatorBalance } from "../models/creatorBalance.model";
async function main() { if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required for read-only verification."); await mongoose.connect(process.env.MONGODB_URI); try { const [activeDuplicates, negativeBalances] = await Promise.all([Withdrawal.aggregate([{ $match: { isActiveObligation: true } }, { $group: { _id: "$creatorId", count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]), CreatorBalance.countDocuments({ $or: [{ availableBalance: { $lt: 0 } }, { reservedBalance: { $lt: 0 } }] })]); console.log(JSON.stringify({ activeWithdrawalDuplicates: activeDuplicates.length, negativeBalances }, null, 2)); } finally { await mongoose.disconnect(); } }
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
