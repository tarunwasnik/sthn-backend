"use strict";
//backend/src/models/internalProvider/schemas/providerAudit.schema.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderAuditSchema = void 0;
const mongoose_1 = require("mongoose");
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Audit Schema
 * ------------------------------------------------------------------
 *
 * Shared audit information used across every Internal Provider model.
 * ------------------------------------------------------------------
 */
exports.ProviderAuditSchema = new mongoose_1.Schema({
    /**
     * User or system that created the record.
     */
    createdBy: {
        type: String,
        default: null,
        trim: true,
    },
    /**
     * User or system that last updated the record.
     */
    updatedBy: {
        type: String,
        default: null,
        trim: true,
    },
    /**
     * Optional administrative notes.
     */
    notes: {
        type: String,
        default: null,
        trim: true,
    },
    /**
     * Timestamp of the most recent lifecycle transition.
     */
    lastStatusChangedAt: {
        type: Date,
        default: Date.now,
    },
}, {
    _id: false,
});
exports.default = exports.ProviderAuditSchema;
