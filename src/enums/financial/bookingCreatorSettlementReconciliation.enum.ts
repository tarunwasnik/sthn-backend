export enum BookingCreatorSettlementReconciliationStatus {
  OPEN = "OPEN",
  RESOLVED = "RESOLVED",
}

export enum BookingCreatorSettlementReconciliationResult {
  VALID = "VALID",
  ISSUES_FOUND = "ISSUES_FOUND",
}

export enum BookingCreatorSettlementRepairAction {
  RESTORE_MISSING_AUDIT = "RESTORE_MISSING_AUDIT",
  RESTORE_REPLAY_METADATA = "RESTORE_REPLAY_METADATA",
}
