"use strict";
//backend/src/services/adminActions/idempotencyKey.util.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIdempotencyKey = void 0;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Phase 25 — Version-aware idempotency key
 *
 * Same admin + same action + same VERSION + same target + same params
 * => same idempotency key
 *
 * Different version => different key (even if everything else matches)
 */
const createIdempotencyKey = ({ adminId, actionKey, actionVersion, // 🕰️ Phase 25
targetId, paramsHash, }) => {
    const raw = `${adminId}:${actionKey}:v${actionVersion}:${targetId}:${paramsHash}`;
    return crypto_1.default.createHash("sha256").update(raw).digest("hex");
};
exports.createIdempotencyKey = createIdempotencyKey;
