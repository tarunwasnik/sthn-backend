"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.planLegacyWalletUserUniqueIndexRemoval = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
require("dotenv/config");
const wallet_model_1 = require("../models/wallet.model");
const keysEqual = (actual, expected) => {
    const actualEntries = Object.entries(actual);
    const expectedEntries = Object.entries(expected);
    return actualEntries.length === expectedEntries.length &&
        expectedEntries.every(([key, value], index) => actualEntries[index]?.[0] === key && actualEntries[index]?.[1] === value);
};
const planLegacyWalletUserUniqueIndexRemoval = (indexes) => {
    const compoundCurrencyIndex = indexes.find((index) => index.unique === true && keysEqual(index.key, { userId: 1, currency: 1 }));
    if (!compoundCurrencyIndex) {
        throw new Error("Wallet compound unique { userId: 1, currency: 1 } index is required before migration.");
    }
    const namedUserIndex = indexes.find((index) => index.name === "userId_1");
    if (!namedUserIndex)
        return { compoundCurrencyIndex };
    if (namedUserIndex.unique !== true ||
        !keysEqual(namedUserIndex.key, { userId: 1 })) {
        throw new Error("Wallet index userId_1 does not match the expected stale unique { userId: 1 } signature.");
    }
    return { staleUserUniqueIndex: namedUserIndex, compoundCurrencyIndex };
};
exports.planLegacyWalletUserUniqueIndexRemoval = planLegacyWalletUserUniqueIndexRemoval;
const hasDuplicateWalletOwnershipCurrencies = async () => {
    const duplicates = await wallet_model_1.Wallet.aggregate([
        { $group: { _id: { userId: "$userId", currency: "$currency" },
                count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $count: "count" },
    ]);
    return duplicates[0]?.count ?? 0;
};
const main = async () => {
    const apply = process.argv.includes("--apply");
    if (process.env.NODE_ENV === "production") {
        throw new Error("Wallet index maintenance is not permitted in production.");
    }
    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI is required for Wallet index maintenance.");
    }
    await mongoose_1.default.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 15000,
    });
    try {
        const indexes = await wallet_model_1.Wallet.collection.indexes();
        const plan = (0, exports.planLegacyWalletUserUniqueIndexRemoval)(indexes);
        const duplicateOwnershipCurrencies = await hasDuplicateWalletOwnershipCurrencies();
        if (duplicateOwnershipCurrencies) {
            throw new Error("Wallet duplicate { userId, currency } ownership pairs exist; migration aborted.");
        }
        const report = {
            mode: apply ? "apply" : "dry-run",
            compoundCurrencyIndex: plan.compoundCurrencyIndex.name,
            staleUserUniqueIndex: plan.staleUserUniqueIndex?.name ?? null,
            duplicateOwnershipCurrencies,
            dropped: false,
        };
        if (!apply || !plan.staleUserUniqueIndex) {
            console.log(JSON.stringify(report, null, 2));
            return;
        }
        await wallet_model_1.Wallet.collection.dropIndex(plan.staleUserUniqueIndex.name);
        console.log(JSON.stringify({ ...report, dropped: true }, null, 2));
    }
    finally {
        await mongoose_1.default.disconnect();
    }
};
if (require.main === module) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
