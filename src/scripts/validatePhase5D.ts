import assert from "node:assert/strict";
const reserve = (available: number, reserved: number, amount: number) => { if (!Number.isSafeInteger(amount) || amount <= 0 || amount > available) throw new Error("invalid"); return { available: available - amount, reserved: reserved + amount }; };
const release = (available: number, reserved: number, amount: number) => { if (amount > reserved) throw new Error("invalid"); return { available: available + amount, reserved: reserved - amount }; };
assert.deepEqual(reserve(100_000, 0, 60_000), { available: 40_000, reserved: 60_000 });
assert.deepEqual(release(40_000, 60_000, 60_000), { available: 100_000, reserved: 0 });
assert.deepEqual({ available: 40_000, reserved: 60_000 - 60_000 }, { available: 40_000, reserved: 0 });
assert.throws(() => reserve(100, 0, 0)); assert.throws(() => reserve(100, 0, -1)); assert.throws(() => reserve(100, 0, 101)); assert.throws(() => reserve(100, 0, Number.MAX_SAFE_INTEGER + 1));
console.log("Phase 5D focused assertions passed.");
