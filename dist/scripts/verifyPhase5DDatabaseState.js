"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
require("dotenv/config");
const withdrawal_model_1 = require("../models/withdrawal.model");
const creatorBalance_model_1 = require("../models/creatorBalance.model");
async function main() { if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required for read-only verification."); await mongoose_1.default.connect(process.env.MONGODB_URI); try {
    const [activeDuplicates, negativeBalances] = await Promise.all([withdrawal_model_1.Withdrawal.aggregate([{ $match: { isActiveObligation: true } }, { $group: { _id: "$creatorId", count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]), creatorBalance_model_1.CreatorBalance.countDocuments({ $or: [{ availableBalance: { $lt: 0 } }, { reservedBalance: { $lt: 0 } }] })]);
    console.log(JSON.stringify({ activeWithdrawalDuplicates: activeDuplicates.length, negativeBalances }, null, 2));
}
finally {
    await mongoose_1.default.disconnect();
} }
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
