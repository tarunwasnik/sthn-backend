"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toWalletConversionRequestResponseDto = void 0;
const walletConversionDecision_enum_1 = require("../../enums/financial/walletConversionDecision.enum");
const walletConversionRequestStatus_enum_1 = require("../../enums/financial/walletConversionRequestStatus.enum");
const fxDecimal_util_1 = require("../../utils/financial/fxDecimal.util");
const toWalletConversionRequestResponseDto = (request) => {
    const approvedAuthority = [walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.APPROVED,
        walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.COMPLETED,
        walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.FAILED].includes(request.status);
    return ({
        conversionReference: request.conversionReference,
        status: request.status,
        decision: approvedAuthority
            ? walletConversionDecision_enum_1.WalletConversionDecision.APPROVE
            : request.status === walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.REJECTED
                ? walletConversionDecision_enum_1.WalletConversionDecision.REJECT : undefined,
        sourceCurrency: request.sourceCurrency,
        targetCurrency: request.targetCurrency,
        sourceAmount: request.sourceAmount,
        targetAmount: request.targetAmount,
        fxSnapshotReference: request.fxSnapshotReference,
        fxProvider: request.fxProvider,
        fxEffectiveDate: request.fxEffectiveDate,
        rate: (0, fxDecimal_util_1.scaledRateToDecimal)({ value: request.rateValue,
            scale: request.rateScale }),
        inverseRate: (0, fxDecimal_util_1.scaledRateToDecimal)({ value: request.inverseRateValue,
            scale: request.inverseRateScale }),
        requestedAt: request.requestedAt,
        decidedAt: request.decidedAt,
        approvedAt: approvedAuthority
            ? request.decidedAt : undefined,
        rejectedAt: request.status === walletConversionRequestStatus_enum_1.WalletConversionRequestStatus.REJECTED
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
exports.toWalletConversionRequestResponseDto = toWalletConversionRequestResponseDto;
