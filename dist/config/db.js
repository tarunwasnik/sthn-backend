"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = connectDB;
//backend/src/config/db.ts
const mongoose_1 = __importDefault(require("mongoose"));
async function connectDB() {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error("MONGODB_URI is not defined in environment variables");
        }
        await mongoose_1.default.connect(uri);
        console.log("✅ MongoDB connected");
    }
    catch (error) {
        console.error("❌ MongoDB connection failed", error);
        process.exit(1);
    }
}
