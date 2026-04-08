// backend/src/jobs/disputeEscalation.job.ts

import { Dispute } from "../models/dispute.model";
import User from "../models/User";

/**
 * Dispute SLA escalation + signal detector
 *
 * Signals:
 * - SLA_SOFT_BREACH
 * - SLA_HARD_BREACH
 * - REPEAT_OFFENDER (abuseScore >= 20)
 */
export const disputeEscalationJob = async () => {
  const now = new Date();

  const disputes = await Dispute.find({
    status: "OPEN",
  });

  if (disputes.length === 0) return;

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

    const offender = await User.findById(dispute.raisedBy)
      .select("abuseScore")
      .lean();

    if (offender && offender.abuseScore >= 20) {
      nextSignals.add("REPEAT_OFFENDER");
    }

    /* ================= SKIP WRITE IF NOTHING CHANGED ================= */

    const signalsArray = Array.from(nextSignals);

    if (
      nextLevel === dispute.escalationLevel &&
      signalsArray.length === dispute.signals.length &&
      signalsArray.every((s) => dispute.signals.includes(s))
    ) {
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