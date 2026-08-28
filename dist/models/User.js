"use strict";
//backend/src/models/User.ts
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
const mongoose_1 = __importStar(require("mongoose"));
const roles_1 = require("../constants/roles");
/* =========================================================
   USER SCHEMA
========================================================= */
const UserSchema = new mongoose_1.Schema({
    /* =======================================================
       AUTHENTICATION IDENTITY
    ======================================================= */
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        default: null,
    },
    authProvider: {
        type: String,
        enum: ["local", "google"],
        default: "local",
        index: true,
    },
    googleId: {
        type: String,
        default: null,
        index: true,
    },
    mobileCountryCode: {
        type: String,
        default: null,
        trim: true,
        maxlength: 5,
    },
    mobileNumber: {
        type: String,
        default: null,
        trim: true,
        maxlength: 15,
    },
    role: {
        type: String,
        enum: Object.values(roles_1.ROLES),
        default: roles_1.ROLES.USER,
    },
    status: {
        type: String,
        enum: ["pending_profile", "active", "suspended", "banned"],
        default: "pending_profile",
        index: true,
    },
    /* =======================================================
       CREATOR ELEVATION LIFECYCLE
    ======================================================= */
    creatorStatus: {
        type: String,
        enum: ["none", "pending", "approved", "rejected"],
        default: "none",
        index: true,
    },
    /* =======================================================
       TRUST & ABUSE CONTROL
    ======================================================= */
    abuseScore: {
        type: Number,
        default: 0,
        index: true,
    },
    /* =======================================================
       ACCOUNT GOVERNANCE
    ======================================================= */
    governanceState: {
        type: String,
        enum: [
            "ACTIVE",
            "PENDING_SUSPENSION",
            "SUSPENDED",
            "PENDING_BAN",
            "BANNED",
        ],
        default: "ACTIVE",
        index: true,
    },
    governanceTriggeredAt: {
        type: Date,
        default: null,
        index: true,
    },
    governanceReason: {
        type: String,
        default: null,
    },
    governanceTriggeredBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
    },
    /* =======================================================
       SUSPENSION BOOKING PROTECTION
    ======================================================= */
    suspensionProtectedUntil: {
        type: Date,
        default: null,
        index: true,
    },
    /* =======================================================
       BAN WITHDRAWAL LIFECYCLE
    ======================================================= */
    banWithdrawalWindowStartedAt: {
        type: Date,
        default: null,
        index: true,
    },
    banWithdrawalWindowEndsAt: {
        type: Date,
        default: null,
        index: true,
    },
    /* =======================================================
       UNCLAIMED / RESTRICTED FUNDS
    ======================================================= */
    unclaimedBalanceAmount: {
        type: Number,
        default: 0,
        min: 0,
    },
    unclaimedBalanceCurrency: {
        type: String,
        default: null,
        trim: true,
        uppercase: true,
    },
    unclaimedBalanceRecordedAt: {
        type: Date,
        default: null,
    },
    /* =======================================================
       USER COOLDOWN
    ======================================================= */
    userCooldownUntil: {
        type: Date,
        default: null,
        index: true,
    },
    userCooldownReason: {
        type: String,
        default: null,
    },
    userCooldownBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    userCooldownTriggeredAt: {
        type: Date,
        default: null,
        index: true,
    },
    /* =======================================================
       CREATOR COOLDOWN
    ======================================================= */
    creatorCooldownUntil: {
        type: Date,
        default: null,
        index: true,
    },
    creatorCooldownReason: {
        type: String,
        default: null,
    },
    creatorCooldownBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    creatorCooldownTriggeredAt: {
        type: Date,
        default: null,
        index: true,
    },
    /* =======================================================
       ADMIN MODE PERSISTENCE
    ======================================================= */
    adminMode: {
        type: String,
        enum: ["SYSTEM", "OPERATIONS"],
        default: null,
        index: true,
    },
}, {
    timestamps: true,
});
/* =========================================================
   MODEL
========================================================= */
exports.default = mongoose_1.default.model("User", UserSchema);
