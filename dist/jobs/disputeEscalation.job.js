"use strict";
// backend/src/jobs/disputeEscalation.job.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disputeEscalationJob = void 0;
const dispute_model_1 = require("../models/dispute.model");
const User_1 = __importDefault(require("../models/User"));
/**
 * Dispute SLA escalation + signal detector
 *
 * Signals:
 * - SLA_SOFT_BREACH
 * - SLA_HARD_BREACH
 * - REPEAT_OFFENDER (abuseScore >= 20)
 */
const disputeEscalationJob = async () => {
    const now = new Date();
    const disputes = await dispute_model_1.Dispute.find({
        status: "OPEN",
    });
    if (disputes.length === 0)
        return;
    for (const dispute of disputes) {
        const createdAt = dispute.createdAt;
        const slaMs = dispute.slaHours * 60 * 60 * 1000;
        const softAt = createdAt.getTime() + slaMs;
        const hardAt = createdAt.getTime() + slaMs * 2;
        let nextLevel = dispute.escalationLevel;
        const nextSignals = new Set(dispute.signals);
        /* ================= SLA ESCALATION ================= */
        if (now.getTime() > softAt) {
            nextLevel = "SOFT";
            nextSignals.add("SLA_SOFT_BREACH");
        }
        if (now.getTime() > hardAt) {
            nextLevel = "HARD";
            nextSignals.add("SLA_HARD_BREACH");
        }
        /* ================= REPEAT OFFENDER CHECK ================= */
        const offender = await User_1.default.findById(dispute.raisedBy)
            .select("abuseScore")
            .lean();
        if (offender && offender.abuseScore >= 20) {
            nextSignals.add("REPEAT_OFFENDER");
        }
        /* ================= SKIP WRITE IF NOTHING CHANGED ================= */
        const signalsArray = Array.from(nextSignals);
        if (nextLevel === dispute.escalationLevel &&
            signalsArray.length === dispute.signals.length &&
            signalsArray.every((s) => dispute.signals.includes(s))) {
            continue;
        }
        /* ================= UPDATE DISPUTE ================= */
        if (!dispute.escalatedAt && nextLevel !== "NONE") {
            dispute.escalatedAt = now;
        }
        dispute.escalationLevel = nextLevel;
        dispute.signals = signalsArray;
        await dispute.save();
    }
};
exports.disputeEscalationJob = disputeEscalationJob;
