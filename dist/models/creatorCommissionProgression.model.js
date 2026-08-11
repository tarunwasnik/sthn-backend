"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatorCommissionProgression = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const creatorCommissionTier_enum_1 = require("../enums/financial/creatorCommissionTier.enum");
const CreatorCommissionProgressionSchema = new mongoose_1.Schema({
    creatorId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, unique: true, immutable: true, index: true },
    qualifiedActiveMonthCount: { type: Number, required: true, default: 0, min: 0 },
    currentCommissionRateBps: { type: Number, required: true, default: 2000, enum: [2000, 1500, 1000] },
    currentTier: { type: String, required: true, default: creatorCommissionTier_enum_1.CreatorCommissionTier.TIER_ONE, enum: Object.values(creatorCommissionTier_enum_1.CreatorCommissionTier) },
    lastQualifiedMonth: { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
}, { timestamps: true });
exports.CreatorCommissionProgression = mongoose_1.default.model("CreatorCommissionProgression", CreatorCommissionProgressionSchema);
