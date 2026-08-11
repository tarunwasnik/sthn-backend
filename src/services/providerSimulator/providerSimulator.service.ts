//backend/src/services/providerSimulator/providerSimulator.service.ts

import { Payment } from "../../models/payment.model";

import { PaymentProvider } from "../../enums/financial/paymentProvider.enum";

import { PaymentError } from "../../errors/financial/PaymentError";
import { InternalWithdrawalProviderRequestStatus } from
  "../../enums/financial/internalWithdrawalProviderRequestStatus.enum";
import { WithdrawalProviderExecutionOutcome } from
  "../../enums/financial/withdrawalProviderExecutionOutcome.enum";
import { InternalWalletConversionProviderRequestStatus } from
  "../../enums/financial/internalWalletConversionProviderRequestStatus.enum";
import { WalletConversionProviderOutcome } from
  "../../enums/financial/walletConversionProviderOutcome.enum";

import { ProviderSimulatorError } from "../../errors/internalProvider/ProviderSimulatorError";

import {
  ProviderPayoutSimulationAction,
} from "../../constants/internalProvider";

import { paymentProviderService } from "../payment/provider/paymentProvider.service";
import ProviderPayoutService, {
  SimulateProviderPayoutTransitionResult,
} from "../internalProvider/payouts/providerPayout.service";

export interface SimulatePayoutInput {
  providerPayoutId: string;
  action: ProviderPayoutSimulationAction;
  adminId: string;
  failureCode?: string;
  failureReason?: string;
  note?: string;
}

export interface SimulateWithdrawalProviderInput {
  providerRequestReference: string;
  providerReference: string;
  executionReference: string;
  outcome: WithdrawalProviderExecutionOutcome;
  failureCode?: string;
  failureReason?: string;
}

export interface SimulateWithdrawalProviderResult {
  status:
    | InternalWithdrawalProviderRequestStatus.SUCCEEDED
    | InternalWithdrawalProviderRequestStatus.FAILED;
  responseCode: string;
  responseMessage?: string;
  responsePayload: Record<string, unknown>;
}

export interface SimulateWalletConversionProviderInput {
  providerRequestReference: string;
  providerExecutionReference: string;
  conversionReference: string;
  outcome: WalletConversionProviderOutcome;
  failureCode?: string;
  failureReason?: string;
}

export interface SimulateWalletConversionProviderResult {
  status: InternalWalletConversionProviderRequestStatus.SUCCEEDED |
    InternalWalletConversionProviderRequestStatus.FAILED;
  outcome: WalletConversionProviderOutcome;
  responseCode: string;
  failureCode?: string;
  failureReason?: string;
  responsePayload: Record<string, unknown>;
}

export class ProviderSimulatorService {
  simulateWalletConversionProvider(
    input: SimulateWalletConversionProviderInput,
  ): SimulateWalletConversionProviderResult {
    if (!/^IWCPR-[A-F0-9]{20}$/.test(input.providerRequestReference) ||
      !/^IWCXE-[A-F0-9]{20}$/.test(input.providerExecutionReference) ||
      !/^WCV-/.test(input.conversionReference) ||
      !Object.values(WalletConversionProviderOutcome).includes(input.outcome)) {
      throw new ProviderSimulatorError(
        "Invalid Wallet conversion provider simulation input.",
        "INVALID_WALLET_CONVERSION_PROVIDER_SIMULATION_INPUT",
      );
    }
    this.validateSafeString(input.failureCode, "failureCode", 64,
      /^[A-Z][A-Z0-9_]*$/);
    this.validateSafeString(input.failureReason, "failureReason", 500);
    if (input.outcome === WalletConversionProviderOutcome.SUCCESS) {
      if (input.failureCode !== undefined || input.failureReason !== undefined) {
        throw new ProviderSimulatorError(
          "Successful Wallet conversion cannot include failure data.",
          "INVALID_WALLET_CONVERSION_PROVIDER_SIMULATION_INPUT",
        );
      }
      return {
        status: InternalWalletConversionProviderRequestStatus.SUCCEEDED,
        outcome: WalletConversionProviderOutcome.SUCCESS,
        responseCode: "INTERNAL_CONVERSION_SUCCEEDED",
        responsePayload: {
          providerRequestReference: input.providerRequestReference,
          providerExecutionReference: input.providerExecutionReference,
          conversionReference: input.conversionReference,
          outcome: WalletConversionProviderOutcome.SUCCESS,
        },
      };
    }
    const failureCode = input.failureCode ?? "INTERNAL_CONVERSION_FAILED";
    const failureReason = input.failureReason ??
      "Internal Provider Wallet conversion simulation failed.";
    return {
      status: InternalWalletConversionProviderRequestStatus.FAILED,
      outcome: WalletConversionProviderOutcome.FAILURE,
      responseCode: failureCode, failureCode, failureReason,
      responsePayload: {
        providerRequestReference: input.providerRequestReference,
        providerExecutionReference: input.providerExecutionReference,
        conversionReference: input.conversionReference,
        outcome: WalletConversionProviderOutcome.FAILURE,
        failureCode, failureReason,
      },
    };
  }

  simulateWithdrawalProvider(
    input: SimulateWithdrawalProviderInput,
  ): SimulateWithdrawalProviderResult {
    if (
      !/^IWPR-[A-F0-9]{20}$/.test(input.providerRequestReference) ||
      !/^INTERNAL-WD-[A-F0-9]{24}$/.test(input.providerReference) ||
      !/^IWXE-[A-F0-9]{20}$/.test(input.executionReference) ||
      !Object.values(WithdrawalProviderExecutionOutcome)
        .includes(input.outcome)
    ) {
      throw new ProviderSimulatorError(
        "Invalid withdrawal provider simulation input.",
        "INVALID_WITHDRAWAL_PROVIDER_SIMULATION_INPUT",
      );
    }
    this.validateSafeString(
      input.failureCode,
      "failureCode",
      64,
      /^[A-Z][A-Z0-9_]*$/,
    );
    this.validateSafeString(input.failureReason, "failureReason", 500);
    if (input.outcome === WithdrawalProviderExecutionOutcome.SUCCESS) {
      if (input.failureCode !== undefined || input.failureReason !== undefined) {
        throw new ProviderSimulatorError(
          "Successful withdrawal simulation cannot include failure data.",
          "INVALID_WITHDRAWAL_PROVIDER_SIMULATION_INPUT",
        );
      }
      return {
        status: InternalWithdrawalProviderRequestStatus.SUCCEEDED,
        responseCode: "INTERNAL_PROVIDER_SUCCEEDED",
        responsePayload: {
          providerRequestReference: input.providerRequestReference,
          providerReference: input.providerReference,
          executionReference: input.executionReference,
          outcome: InternalWithdrawalProviderRequestStatus.SUCCEEDED,
        },
      };
    }
    const failureCode = input.failureCode ?? "INTERNAL_PROVIDER_FAILED";
    const failureReason = input.failureReason ??
      "Internal Provider withdrawal simulation failed.";
    return {
      status: InternalWithdrawalProviderRequestStatus.FAILED,
      responseCode: failureCode,
      responseMessage: failureReason,
      responsePayload: {
        providerRequestReference: input.providerRequestReference,
        providerReference: input.providerReference,
        executionReference: input.executionReference,
        outcome: InternalWithdrawalProviderRequestStatus.FAILED,
        failureCode,
        failureReason,
      },
    };
  }

  /**
   * Ensures the payment exists and belongs to the
   * INTERNAL provider.
   */
  private async getInternalPayment(paymentId: string) {
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      throw new PaymentError("Payment not found.");
    }

    if (payment.provider !== PaymentProvider.INTERNAL) {
      throw new PaymentError(
        "Simulation is only supported for the INTERNAL provider.",
      );
    }

    return payment;
  }

  /* -------------------------------------------------------------------------- */
  /* Payment Verification                                                       */
  /* -------------------------------------------------------------------------- */

  async simulateVerification(paymentId: string) {
    const payment = await this.getInternalPayment(paymentId);

    return paymentProviderService.verifyPayment(payment.provider, {
      providerPaymentId: payment.providerPaymentId!,
      providerOrderId: payment.providerOrderId,
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Payment Status                                                             */
  /* -------------------------------------------------------------------------- */

  async simulateStatus(paymentId: string) {
    const payment = await this.getInternalPayment(paymentId);

    return paymentProviderService.getPaymentStatus(payment.provider, {
      providerPaymentId: payment.providerPaymentId!,
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Refund                                                                      */
  /* -------------------------------------------------------------------------- */

  async simulateRefund(paymentId: string, amount: number, reason?: string) {
    const payment = await this.getInternalPayment(paymentId);

    return paymentProviderService.createRefund(payment.provider, {
      refundId: payment._id.toString(),
      bookingId: payment.bookingId.toString(),
      refundReference: `SIM-REF-${Date.now()}`,

      paymentReference: payment.paymentReference,

      providerPaymentId: payment.providerPaymentId!,

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

  async simulateWebhook(paymentId: string, body: Record<string, unknown>) {
    const payment = await this.getInternalPayment(paymentId);

    return paymentProviderService.verifyWebhook(payment.provider, {
      headers: {},

      body,

      signature: "internal-simulator",
    });
  }

  /* -------------------------------------------------------------------------- */
  /* Payout Simulation                                                          */
  /* -------------------------------------------------------------------------- */

  async simulatePayout(
    input: SimulatePayoutInput,
  ): Promise<SimulateProviderPayoutTransitionResult> {
    this.validatePayoutSimulationInput(input);

    return ProviderPayoutService.simulatePayoutTransition({
      providerPayoutId: input.providerPayoutId,
      action: input.action,
      adminId: input.adminId,
      failureCode: input.failureCode,
      failureMessage: input.failureReason,
      note: input.note,
    });
  }

  private validatePayoutSimulationInput(input: SimulatePayoutInput): void {
    if (!input.providerPayoutId || !/^INT_PAYOUT_[A-F0-9]+$/.test(input.providerPayoutId)) {
      throw new ProviderSimulatorError(
        "Invalid Internal Provider payout identifier.",
        "INVALID_PROVIDER_PAYOUT_ID",
      );
    }

    if (!Object.values(ProviderPayoutSimulationAction).includes(input.action)) {
      throw new ProviderSimulatorError(
        "Invalid provider payout simulation action.",
        "INVALID_PROVIDER_PAYOUT_SIMULATION_ACTION",
      );
    }

    this.validateSafeString(input.failureCode, "failureCode", 64, /^[A-Z][A-Z0-9_]*$/);
    this.validateSafeString(input.failureReason, "failureReason", 500);
    this.validateSafeString(input.note, "note", 500);
  }

  private validateSafeString(
    value: string | undefined,
    field: string,
    maxLength: number,
    pattern?: RegExp,
  ): void {
    if (value === undefined) {
      return;
    }

    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.trim().length > maxLength ||
      (pattern !== undefined && !pattern.test(value.trim()))
    ) {
      throw new ProviderSimulatorError(
        `Invalid ${field}.`,
        "INVALID_PROVIDER_PAYOUT_SIMULATION_INPUT",
      );
    }
  }
}

export const providerSimulatorService = new ProviderSimulatorService();
