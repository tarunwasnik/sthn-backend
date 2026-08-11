import { WalletConversionRequestDocument } from
  "../../models/walletConversionRequest.model";
import { WalletConversionDecision } from
  "../../enums/financial/walletConversionDecision.enum";
import { WalletConversionRequestStatus } from
  "../../enums/financial/walletConversionRequestStatus.enum";
import { scaledRateToDecimal } from "../../utils/financial/fxDecimal.util";

export const toWalletConversionRequestResponseDto =
  (request: WalletConversionRequestDocument) => {
  const approvedAuthority = [WalletConversionRequestStatus.APPROVED,
    WalletConversionRequestStatus.COMPLETED,
    WalletConversionRequestStatus.FAILED].includes(request.status);
  return ({
    conversionReference: request.conversionReference,
    status: request.status,
    decision: approvedAuthority
      ? WalletConversionDecision.APPROVE
      : request.status === WalletConversionRequestStatus.REJECTED
        ? WalletConversionDecision.REJECT : undefined,
    sourceCurrency: request.sourceCurrency,
    targetCurrency: request.targetCurrency,
    sourceAmount: request.sourceAmount,
    targetAmount: request.targetAmount,
    fxSnapshotReference: request.fxSnapshotReference,
    fxProvider: request.fxProvider,
    fxEffectiveDate: request.fxEffectiveDate,
    rate: scaledRateToDecimal({ value: request.rateValue,
      scale: request.rateScale }),
    inverseRate: scaledRateToDecimal({ value: request.inverseRateValue,
      scale: request.inverseRateScale }),
    requestedAt: request.requestedAt,
    decidedAt: request.decidedAt,
    approvedAt: approvedAuthority
      ? request.decidedAt : undefined,
    rejectedAt: request.status === WalletConversionRequestStatus.REJECTED
      ? request.decidedAt : undefined,
    rejectionCode: request.rejectionCode,
    rejectionReason: request.rejectionReason,
    providerReference: request.providerRequestReference,
    providerStatus: request.providerStatus,
    providerOutcome: request.providerOutcome,
    providerProcessingAt: request.providerProcessingAt,
    providerCompletedAt: request.providerCompletedAt,
    completedAt: request.completedAt,
  });
};
