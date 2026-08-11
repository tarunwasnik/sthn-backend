"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalController = exports.WithdrawalController = void 0;
const withdrawal_service_1 = require("../services/financial/withdrawal.service");
const creatorWithdrawalRequest_service_1 = require("../services/financial/creatorWithdrawalRequest.service");
const withdrawalPayoutLifecycle_service_1 = require("../services/financial/withdrawalPayoutLifecycle.service");
const withdrawalStatus_enum_1 = require("../enums/financial/withdrawalStatus.enum");
class WithdrawalController {
    serialize(withdrawal, payout) {
        return {
            withdrawal: {
                _id: withdrawal._id,
                withdrawalReference: withdrawal.withdrawalReference,
                amount: withdrawal.amount,
                currency: withdrawal.currency,
                status: withdrawal.status,
                requestedAt: withdrawal.requestedAt,
                reservedAt: withdrawal.reservedAt,
                processingAt: withdrawal.processingAt,
                completedAt: withdrawal.completedAt,
                failedAt: withdrawal.failedAt,
                failureReason: withdrawal.failureReason,
                ...(withdrawal.destinationSnapshot ? {
                    destination: {
                        version: withdrawal.destinationSnapshot.version,
                        destinationReference: withdrawal.destinationSnapshot.destinationReference,
                        type: withdrawal.destinationSnapshot.type,
                        maskedIdentifier: withdrawal.destinationSnapshot.maskedIdentifier,
                        accountNumberLast4: withdrawal.destinationSnapshot.accountNumberLast4,
                        ifscDisplay: withdrawal.destinationSnapshot.ifscDisplay,
                        verificationStatus: withdrawal.destinationSnapshot.verificationStatus,
                        verifiedAt: withdrawal.destinationSnapshot.verifiedAt,
                        snapshotCreatedAt: withdrawal.destinationSnapshot.snapshotCreatedAt,
                    },
                } : {}),
            },
            payout: {
                _id: payout._id,
                payoutReference: payout.payoutReference,
                status: payout.status,
            },
        };
    }
    async requestWithdrawal(req, res, next) {
        try {
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
                return;
            }
            if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
                res.status(400).json({ success: false, message: "Invalid withdrawal request." });
                return;
            }
            const allowedFields = new Set(["amount", "currency", "destinationReference", "idempotencyKey"]);
            const unsupported = Object.keys(req.body).find((field) => !allowedFields.has(field));
            if (unsupported) {
                res.status(400).json({ success: false, message: `Unsupported withdrawal field: ${unsupported}.` });
                return;
            }
            const { amount, currency, destinationReference, idempotencyKey } = req.body;
            const withdrawal = await creatorWithdrawalRequest_service_1.creatorWithdrawalRequestService.request({
                authenticatedUserId: req.user.id,
                amount: {
                    amount,
                    currency,
                },
                destinationReference,
                idempotencyKey,
            });
            res.status(201).json({
                success: true,
                data: withdrawal,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async refreshWithdrawalPayout(req, res, next) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: "Unauthorized" });
                return;
            }
            const withdrawal = await withdrawal_service_1.withdrawalService.getWithdrawal(req.params.withdrawalId);
            if (withdrawal.creatorId.toString() !== req.user.id) {
                res.status(403).json({ success: false, message: "Forbidden" });
                return;
            }
            const processed = await withdrawalPayoutLifecycle_service_1.withdrawalPayoutLifecycleService.processInitializedWithdrawalPayout(withdrawal._id.toString());
            res.status(200).json({
                success: true,
                data: this.serialize(processed.withdrawal, processed.payout),
            });
        }
        catch (error) {
            next(error);
        }
    }
    async cancelWithdrawal(req, res, next) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: "Unauthorized" });
                return;
            }
            const withdrawal = await withdrawal_service_1.withdrawalService.cancelWithdrawal(req.params.withdrawalId, req.user.id, typeof req.body?.reason === "string" ? req.body.reason : undefined);
            res.status(200).json({ success: true, data: { withdrawalReference: withdrawal.withdrawalReference, status: withdrawal.status, cancelledAt: withdrawal.cancelledAt } });
        }
        catch (error) {
            next(error);
        }
    }
    async listWithdrawals(req, res, next) { try {
        if (!req.user) {
            res.status(401).json({ success: false });
            return;
        }
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
        const { withdrawalRepository } = await Promise.resolve().then(() => __importStar(require("../repositories/withdrawal.repository")));
        const rows = await withdrawalRepository.listByCreator(req.user.id, page, limit, typeof req.query.status === "string" ? req.query.status : undefined);
        res.json({ success: true, data: rows.map((w) => ({ withdrawalReference: w.withdrawalReference, amount: w.amount, currency: w.currency, status: w.status, requestedAt: w.requestedAt, cancelledAt: w.cancelledAt, failedAt: w.failedAt, completedAt: w.completedAt })) });
    }
    catch (error) {
        next(error);
    } }
    async getWithdrawalByReference(req, res, next) { try {
        if (!req.user) {
            res.status(401).json({ success: false });
            return;
        }
        const { withdrawalRepository } = await Promise.resolve().then(() => __importStar(require("../repositories/withdrawal.repository")));
        const withdrawal = await withdrawalRepository.findByReferenceForCreator(req.params.withdrawalReference, req.user.id);
        if (!withdrawal) {
            res.status(404).json({ success: false, message: "Withdrawal not found" });
            return;
        }
        res.json({ success: true, data: { withdrawalReference: withdrawal.withdrawalReference, amount: withdrawal.amount, currency: withdrawal.currency, status: withdrawal.status, requestedAt: withdrawal.requestedAt, cancelledAt: withdrawal.cancelledAt, failedAt: withdrawal.failedAt, completedAt: withdrawal.completedAt, cancellationAllowed: withdrawal.status === withdrawalStatus_enum_1.WithdrawalStatus.RESERVED } });
    }
    catch (error) {
        next(error);
    } }
}
exports.WithdrawalController = WithdrawalController;
exports.withdrawalController = new WithdrawalController();
