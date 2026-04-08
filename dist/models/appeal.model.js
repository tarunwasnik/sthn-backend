"use strict";
//backend/src/models/appeal.model.ts
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
exports.Appeal = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const AppealSchema = new mongoose_1.Schema({
    disputeId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Dispute",
        required: true,
        unique: true, // 🔒 one appeal per dispute
        index: true,
    },
    raisedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    raisedByRole: {
        type: String,
        enum: ["USER", "CREATOR"],
        required: true,
    },
    reason: {
        type: String,
        required: true,
        maxlength: 1500,
    },
    evidence: {
        type: [String],
        default: [],
    },
    status: {
        type: String,
        enum: ["OPEN", "UPHELD", "REJECTED"],
        default: "OPEN",
        index: true,
    },
    decision: {
        action: {
            type: String,
            enum: ["REVERSE_DECISION", "CONFIRM_DECISION"],
        },
        note: String,
        decidedBy: {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "User",
        },
        decidedAt: Date,
    },
}, { timestamps: true });
exports.Appeal = mongoose_1.default.model("Appeal", AppealSchema);
