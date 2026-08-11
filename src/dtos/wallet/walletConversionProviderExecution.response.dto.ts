import { InternalWalletConversionProviderRequestDocument } from
  "../../models/internalProvider/internalWalletConversionProviderRequest.model";

export const toWalletConversionProviderExecutionResponseDto = (
  authority: InternalWalletConversionProviderRequestDocument,
) => ({
  conversionReference: authority.conversionReference,
  providerReference: authority.providerRequestReference,
  providerStatus: authority.providerStatus,
  providerOutcome: authority.providerOutcome,
  processingAt: authority.processingAt,
  completedAt: authority.completedAt,
});
