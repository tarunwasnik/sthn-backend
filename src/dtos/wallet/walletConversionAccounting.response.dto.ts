import { WalletConversionRequestDocument } from
  "../../models/walletConversionRequest.model";

export const toWalletConversionAccountingResponseDto = (
  request: WalletConversionRequestDocument,
) => ({
  conversionReference: request.conversionReference,
  status: request.status,
  sourceCurrency: request.sourceCurrency,
  targetCurrency: request.targetCurrency,
  sourceAmount: request.sourceAmount,
  targetAmount: request.targetAmount,
  completedAt: request.completedAt,
});
