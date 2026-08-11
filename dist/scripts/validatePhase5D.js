"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const reserve = (available, reserved, amount) => { if (!Number.isSafeInteger(amount) || amount <= 0 || amount > available)
    throw new Error("invalid"); return { available: available - amount, reserved: reserved + amount }; };
const release = (available, reserved, amount) => { if (amount > reserved)
    throw new Error("invalid"); return { available: available + amount, reserved: reserved - amount }; };
strict_1.default.deepEqual(reserve(100000, 0, 60000), { available: 40000, reserved: 60000 });
strict_1.default.deepEqual(release(40000, 60000, 60000), { available: 100000, reserved: 0 });
strict_1.default.deepEqual({ available: 40000, reserved: 60000 - 60000 }, { available: 40000, reserved: 0 });
strict_1.default.throws(() => reserve(100, 0, 0));
strict_1.default.throws(() => reserve(100, 0, -1));
strict_1.default.throws(() => reserve(100, 0, 101));
strict_1.default.throws(() => reserve(100, 0, Number.MAX_SAFE_INTEGER + 1));
console.log("Phase 5D focused assertions passed.");
