"use strict";
//backend/src/services/providerSimulator/providerSimulator.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerSimulatorService = exports.ProviderSimulatorService = void 0;
const payment_model_1 = require("../../models/payment.model");
const paymentProvider_enum_1 = require("../../enums/financial/paymentProvider.enum");
const PaymentError_1 = require("../../errors/financial/PaymentError");
const internalWithdrawalProviderRequestStatus_enum_1 = require("../../enums/financial/internalWithdrawalProviderRequestStatus.enum");
const withdrawalProviderExecutionOutcome_enum_1 = require("../../enums/financial/withdrawalProviderExecutionOutcome.enum");
const internalWalletConversionProviderRequestStatus_enum_1 = require("../../enums/financial/internalWalletConversionProviderRequestStatus.enum");
const walletConversionProviderOutcome_enum_1 = require("../../enums/financial/walletConversionProviderOutcome.enum");
const ProviderSimulatorError_1 = require("../../errors/internalProvider/ProviderSimulatorError");
const internalProvider_1 = require("../../constants/internalProvider");
const paymentProvider_service_1 = require("../payment/provider/paymentProvider.service");
const providerPayout_service_1 = __importDefault(require("../internalProvider/payouts/providerPayout.service"));
class ProviderSimulatorService {
    simulateWalletConversionProvider(input) {
        if (!/^IWCPR-[A-F0-9]{20}$/.test(input.providerRequestReference) ||
            !/^IWCXE-[A-F0-9]{20}$/.test(input.providerExecutionReference) ||
            !/^WCV-/.test(input.conversionReference) ||
            !Object.values(walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome).includes(input.outcome)) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Invalid Wallet conversion provider simulation input.", "INVALID_WALLET_CONVERSION_PROVIDER_SIMULATION_INPUT");
        }
        this.validateSafeString(input.failureCode, "failureCode", 64, /^[A-Z][A-Z0-9_]*$/);
        this.validateSafeString(input.failureReason, "failureReason", 500);
        if (input.outcome === walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS) {
            if (input.failureCode !== undefined || input.failureReason !== undefined) {
                throw new ProviderSimulatorError_1.ProviderSimulatorError("Successful Wallet conversion cannot include failure data.", "INVALID_WALLET_CONVERSION_PROVIDER_SIMULATION_INPUT");
            }
            return {
                status: internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.SUCCEEDED,
                outcome: walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS,
                responseCode: "INTERNAL_CONVERSION_SUCCEEDED",
                responsePayload: {
                    providerRequestReference: input.providerRequestReference,
                    providerExecutionReference: input.providerExecutionReference,
                    conversionReference: input.conversionReference,
                    outcome: walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.SUCCESS,
                },
            };
        }
        const failureCode = input.failureCode ?? "INTERNAL_CONVERSION_FAILED";
        const failureReason = input.failureReason ??
            "Internal Provider Wallet conversion simulation failed.";
        return {
            status: internalWalletConversionProviderRequestStatus_enum_1.InternalWalletConversionProviderRequestStatus.FAILED,
            outcome: walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.FAILURE,
            responseCode: failureCode, failureCode, failureReason,
            responsePayload: {
                providerRequestReference: input.providerRequestReference,
                providerExecutionReference: input.providerExecutionReference,
                conversionReference: input.conversionReference,
                outcome: walletConversionProviderOutcome_enum_1.WalletConversionProviderOutcome.FAILURE,
                failureCode, failureReason,
            },
        };
    }
    simulateWithdrawalProvider(input) {
        if (!/^IWPR-[A-F0-9]{20}$/.test(input.providerRequestReference) ||
            !/^INTERNAL-WD-[A-F0-9]{24}$/.test(input.providerReference) ||
            !/^IWXE-[A-F0-9]{20}$/.test(input.executionReference) ||
            !Object.values(withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome)
                .includes(input.outcome)) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Invalid withdrawal provider simulation input.", "INVALID_WITHDRAWAL_PROVIDER_SIMULATION_INPUT");
        }
        this.validateSafeString(input.failureCode, "failureCode", 64, /^[A-Z][A-Z0-9_]*$/);
        this.validateSafeString(input.failureReason, "failureReason", 500);
        if (input.outcome === withdrawalProviderExecutionOutcome_enum_1.WithdrawalProviderExecutionOutcome.SUCCESS) {
            if (input.failureCode !== undefined || input.failureReason !== undefined) {
                throw new ProviderSimulatorError_1.ProviderSimulatorError("Successful withdrawal simulation cannot include failure data.", "INVALID_WITHDRAWAL_PROVIDER_SIMULATION_INPUT");
            }
            return {
                status: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED,
                responseCode: "INTERNAL_PROVIDER_SUCCEEDED",
                responsePayload: {
                    providerRequestReference: input.providerRequestReference,
                    providerReference: input.providerReference,
                    executionReference: input.executionReference,
                    outcome: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.SUCCEEDED,
                },
            };
        }
        const failureCode = input.failureCode ?? "INTERNAL_PROVIDER_FAILED";
        const failureReason = input.failureReason ??
            "Internal Provider withdrawal simulation failed.";
        return {
            status: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED,
            responseCode: failureCode,
            responseMessage: failureReason,
            responsePayload: {
                providerRequestReference: input.providerRequestReference,
                providerReference: input.providerReference,
                executionReference: input.executionReference,
                outcome: internalWithdrawalProviderRequestStatus_enum_1.InternalWithdrawalProviderRequestStatus.FAILED,
                failureCode,
                failureReason,
            },
        };
    }
    /**
     * Ensures the payment exists and belongs to the
     * INTERNAL provider.
     */
    async getInternalPayment(paymentId) {
        const payment = await payment_model_1.Payment.findById(paymentId);
        if (!payment) {
            throw new PaymentError_1.PaymentError("Payment not found.");
        }
        if (payment.provider !== paymentProvider_enum_1.PaymentProvider.INTERNAL) {
            throw new PaymentError_1.PaymentError("Simulation is only supported for the INTERNAL provider.");
        }
        return payment;
    }
    /* -------------------------------------------------------------------------- */
    /* Payment Verification                                                       */
    /* -------------------------------------------------------------------------- */
    async simulateVerification(paymentId) {
        const payment = await this.getInternalPayment(paymentId);
        return paymentProvider_service_1.paymentProviderService.verifyPayment(payment.provider, {
            providerPaymentId: payment.providerPaymentId,
            providerOrderId: payment.providerOrderId,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Payment Status                                                             */
    /* -------------------------------------------------------------------------- */
    async simulateStatus(paymentId) {
        const payment = await this.getInternalPayment(paymentId);
        return paymentProvider_service_1.paymentProviderService.getPaymentStatus(payment.provider, {
            providerPaymentId: payment.providerPaymentId,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Refund                                                                      */
    /* -------------------------------------------------------------------------- */
    async simulateRefund(paymentId, amount, reason) {
        const payment = await this.getInternalPayment(paymentId);
        return paymentProvider_service_1.paymentProviderService.createRefund(payment.provider, {
            refundId: payment._id.toString(),
            bookingId: payment.bookingId.toString(),
            refundReference: `SIM-REF-${Date.now()}`,
            paymentReference: payment.paymentReference,
            providerPaymentId: payment.providerPaymentId,
            amount: {
                amount,
                currency: payment.currency,
            },
            reason,
            idempotencyKey: `sim-refund:${payment._id.toString()}:${amount}`,
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Webhook                                                                     */
    /* -------------------------------------------------------------------------- */
    async simulateWebhook(paymentId, body) {
        const payment = await this.getInternalPayment(paymentId);
        return paymentProvider_service_1.paymentProviderService.verifyWebhook(payment.provider, {
            headers: {},
            body,
            signature: "internal-simulator",
        });
    }
    /* -------------------------------------------------------------------------- */
    /* Payout Simulation                                                          */
    /* -------------------------------------------------------------------------- */
    async simulatePayout(input) {
        this.validatePayoutSimulationInput(input);
        return providerPayout_service_1.default.simulatePayoutTransition({
            providerPayoutId: input.providerPayoutId,
            action: input.action,
            adminId: input.adminId,
            failureCode: input.failureCode,
            failureMessage: input.failureReason,
            note: input.note,
        });
    }
    validatePayoutSimulationInput(input) {
        if (!input.providerPayoutId || !/^INT_PAYOUT_[A-F0-9]+$/.test(input.providerPayoutId)) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Invalid Internal Provider payout identifier.", "INVALID_PROVIDER_PAYOUT_ID");
        }
        if (!Object.values(internalProvider_1.ProviderPayoutSimulationAction).includes(input.action)) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError("Invalid provider payout simulation action.", "INVALID_PROVIDER_PAYOUT_SIMULATION_ACTION");
        }
        this.validateSafeString(input.failureCode, "failureCode", 64, /^[A-Z][A-Z0-9_]*$/);
        this.validateSafeString(input.failureReason, "failureReason", 500);
        this.validateSafeString(input.note, "note", 500);
    }
    validateSafeString(value, field, maxLength, pattern) {
        if (value === undefined) {
            return;
        }
        if (typeof value !== "string" ||
            !value.trim() ||
            value.trim().length > maxLength ||
            (pattern !== undefined && !pattern.test(value.trim()))) {
            throw new ProviderSimulatorError_1.ProviderSimulatorError(`Invalid ${field}.`, "INVALID_PROVIDER_PAYOUT_SIMULATION_INPUT");
        }
    }
}
exports.ProviderSimulatorService = ProviderSimulatorService;
exports.providerSimulatorService = new ProviderSimulatorService();
