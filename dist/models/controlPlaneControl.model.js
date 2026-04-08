"use strict";
//backend/src/models/controlPlaneControl.model.ts
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
exports.ControlPlaneControl = exports.ControlPlaneScope = exports.ControlPlaneEnforcement = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/**
 * Control Plane enforcement modes.
 */
var ControlPlaneEnforcement;
(function (ControlPlaneEnforcement) {
    ControlPlaneEnforcement["ALLOW"] = "ALLOW";
    ControlPlaneEnforcement["FORCE_DRY_RUN"] = "FORCE_DRY_RUN";
    ControlPlaneEnforcement["BLOCK"] = "BLOCK";
})(ControlPlaneEnforcement || (exports.ControlPlaneEnforcement = ControlPlaneEnforcement = {}));
/**
 * Control Plane scope.
 */
var ControlPlaneScope;
(function (ControlPlaneScope) {
    ControlPlaneScope["GLOBAL"] = "GLOBAL";
    ControlPlaneScope["ACTION"] = "ACTION";
    ControlPlaneScope["EMERGENCY"] = "EMERGENCY";
})(ControlPlaneScope || (exports.ControlPlaneScope = ControlPlaneScope = {}));
const ControlPlaneControlSchema = new mongoose_1.Schema({
    scope: {
        type: String,
        enum: Object.values(ControlPlaneScope),
        required: true,
        index: true,
    },
    target: {
        type: String,
        default: null,
        index: true,
    },
    enforcement: {
        type: String,
        enum: Object.values(ControlPlaneEnforcement),
        required: true,
    },
    reason: {
        type: String,
        required: true,
        maxlength: 1024,
    },
    createdBy: {
        adminId: {
            type: String,
            required: true,
            index: true,
        },
        email: {
            type: String,
        },
    },
    expiresAt: {
        type: Date,
        default: null,
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
}, {
    timestamps: true,
    versionKey: false,
});
/**
 * TTL index — exact expiry
 */
ControlPlaneControlSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/**
 * Safety invariants enforced at schema level
 */
ControlPlaneControlSchema.pre("validate", function () {
    if ((this.scope === ControlPlaneScope.GLOBAL ||
        this.scope === ControlPlaneScope.EMERGENCY) &&
        this.target !== null) {
        throw new Error(`${this.scope} controls must not define a target`);
    }
    if (this.scope === ControlPlaneScope.ACTION &&
        (!this.target || this.target.trim().length === 0)) {
        throw new Error("ACTION controls must define a valid target");
    }
});
exports.ControlPlaneControl = mongoose_1.default.models.ControlPlaneControl ||
    mongoose_1.default.model("ControlPlaneControl", ControlPlaneControlSchema);
