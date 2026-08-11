import { WalletTopUpOperationalAuditDocument, WalletTopUpOperationalAudit } from "../models/walletTopUpOperationalAudit.model";

export class WalletTopUpOperationalAuditRepository {
  create(input: Partial<WalletTopUpOperationalAuditDocument>) {
    return WalletTopUpOperationalAudit.create(input);
  }
}

export const walletTopUpOperationalAuditRepository = new WalletTopUpOperationalAuditRepository();
