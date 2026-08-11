import { WalletConversionOperationalClassification } from
  "../../enums/financial/walletConversionOperationalClassification.enum";
import { WalletConversionOperationalSeverity } from
  "../../enums/financial/walletConversionOperationalSeverity.enum";
import { WalletConversionRepairAction } from
  "../../enums/financial/walletConversionRepairAction.enum";

export type WalletConversionOperationalAllowedAction =
  | "RETRY"
  | WalletConversionRepairAction;

export interface WalletConversionOperationalResponseDto {
  /** Opaque Admin operational reference; never a MongoDB identifier. */
  reconciliationReference: string;
  conversionReference: string;
  classification: WalletConversionOperationalClassification;
  severity: WalletConversionOperationalSeverity;
  issues: string[];
  retryPerformed: boolean;
  repairPerformed: boolean;
  /** Backend-computed bounded actions for this exact reconciliation state. */
  allowedActions: WalletConversionOperationalAllowedAction[];
}

export const toWalletConversionOperationalResponseDto = (authority: {
  reconciliationReference: string;
  conversionReference: string;
  classification: WalletConversionOperationalClassification;
  severity: WalletConversionOperationalSeverity;
  issues: string[];
  retryPerformed: boolean;
  repairPerformed: boolean;
}, allowedActions: WalletConversionOperationalAllowedAction[] = []):
  WalletConversionOperationalResponseDto => ({
  reconciliationReference: authority.reconciliationReference,
  conversionReference: authority.conversionReference,
  classification: authority.classification,
  severity: authority.severity,
  issues: [...authority.issues],
  retryPerformed: authority.retryPerformed,
  repairPerformed: authority.repairPerformed,
  allowedActions: [...allowedActions],
});
