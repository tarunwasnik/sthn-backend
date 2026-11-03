import { RefundStatus } from "../../enums/financial/refundStatus.enum";
import { refundAuthorizationRepository } from "../../repositories/refundAuthorization.repository";
import { RefundExecutionError, RefundExecutionService, refundExecutionService } from "./refundExecution.service";

export type RefundWorkerMode = "INSPECTION" | "RECONCILIATION" | "ISOLATED_TEST_DISPATCH";
export class RefundProcessingWorker {
  constructor(private readonly execution: Pick<RefundExecutionService, "execute" | "reconcile"> = refundExecutionService) {}
  async run(input: { mode: RefundWorkerMode; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    if (input.mode === "ISOLATED_TEST_DISPATCH" && (process.env.NODE_ENV !== "test" || process.env.STHN_ISOLATED_FINANCIAL_TEST !== "true")) throw new Error("Refund dispatch is disabled outside explicitly isolated tests.");
    const statuses = input.mode === "RECONCILIATION" ? [RefundStatus.PROCESSING, RefundStatus.PENDING, RefundStatus.UNKNOWN] : [RefundStatus.APPROVED];
    const candidates = await refundAuthorizationRepository.findCandidates(statuses, limit);
    const report = { discovered: candidates.length, dispatched: 0, reconciled: 0, blocked: 0, unknown: 0, items: [] as Array<{ refundId: string; status: string }> };
    for (const candidate of candidates) {
      try {
        const authorization = await refundAuthorizationRepository.findByRefundId(candidate._id);
        if (!authorization || authorization.authority === "TERMINAL_LATE_CAPTURE_V1" || authorization.terminationOperationId) { report.blocked++; report.items.push({ refundId: String(candidate._id), status: "TERMINATION_OR_AUTHORIZATION_BLOCKED" }); continue; }
        if (input.mode === "INSPECTION") { report.items.push({ refundId: String(candidate._id), status: candidate.status }); continue; }
        const result = input.mode === "RECONCILIATION" ? await this.execution.reconcile(String(candidate._id)) : await this.execution.execute(String(candidate._id));
        if (input.mode === "RECONCILIATION") report.reconciled++; else report.dispatched++;
        report.items.push({ refundId: result.refundId, status: result.state });
      } catch (error) {
        const known = error instanceof RefundExecutionError ? error : undefined;
        if (known?.code === "UNKNOWN") report.unknown++; else report.blocked++;
        report.items.push({ refundId: String(candidate._id), status: known?.code ?? "BLOCKED" });
      }
    }
    return report;
  }
}
export const refundProcessingWorker = new RefundProcessingWorker();
