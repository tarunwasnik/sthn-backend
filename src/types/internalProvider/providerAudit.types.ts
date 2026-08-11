//backend/src/types/internalProvider/providerAudit.types.ts

/**
 * ------------------------------------------------------------------
 * Provider Audit Information
 * ------------------------------------------------------------------
 *
 * Common audit fields shared across every
 * Internal Provider model.
 * ------------------------------------------------------------------
 */

export interface ProviderAuditInfo {
  /**
   * User or system that created the record.
   */
  createdBy?: string;

  /**
   * User or system that last updated the record.
   */
  updatedBy?: string;

  /**
   * Optional administrative notes.
   */
  notes?: string;

  /**
   * Last lifecycle transition timestamp.
   */
  lastStatusChangedAt?: Date;
}
