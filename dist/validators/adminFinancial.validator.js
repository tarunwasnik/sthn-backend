"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAdminPayoutListQuery = exports.parseAdminWithdrawalListQuery = exports.parseAdminCreatorBalanceListQuery = exports.parseAdminSettlementListQuery = exports.parseAdminRefundListQuery = exports.parseAdminPaymentListQuery = exports.paymentQuery = exports.adminListQuery = exports.adminObjectId = exports.adminReference = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const paymentStatus_enum_1 = require("../enums/financial/paymentStatus.enum");
const paymentProvider_enum_1 = require("../enums/financial/paymentProvider.enum");
const refundStatus_enum_1 = require("../enums/financial/refundStatus.enum");
const settlementStatus_enum_1 = require("../enums/financial/settlementStatus.enum");
const withdrawalStatus_enum_1 = require("../enums/financial/withdrawalStatus.enum");
const payoutStatus_enum_1 = require("../enums/financial/payoutStatus.enum");
const scalar = (v, name) => { if (typeof v !== "string" || !v.trim() || v.length > 160)
    throw new Error(`Invalid ${name}`); return v.trim(); };
const optional = (v, f) => v === undefined ? undefined : f(v);
const int = (v, name, fallback, max) => { if (v === undefined)
    return fallback; const value = scalar(v, name); if (!/^\d+$/.test(value))
    throw new Error(`Invalid ${name}`); const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > max)
    throw new Error(`Invalid ${name}`); return n; };
const date = (v, name) => { const s = scalar(v, name); const d = new Date(s); if (Number.isNaN(d.valueOf()))
    throw new Error(`Invalid ${name}`); return d; };
const object = (q) => { if (!q || typeof q !== "object" || Array.isArray(q))
    throw new Error("Invalid query"); for (const v of Object.values(q))
    if (typeof v !== "string" && v !== undefined)
        throw new Error("Query values must be scalar strings"); return q; };
const adminReference = (value) => scalar(value, "reference");
exports.adminReference = adminReference;
const adminObjectId = (value, name = "id") => { const id = scalar(value, name); if (!mongoose_1.default.Types.ObjectId.isValid(id))
    throw new Error(`Invalid ${name}`); return id; };
exports.adminObjectId = adminObjectId;
const adminListQuery = (input, enums = {}) => {
    const q = object(input);
    const allowed = new Set(["page", "limit", "dateFrom", "dateTo", "sortOrder", ...Object.keys(enums), "creatorId", "userId", "bookingId", "paymentId", "withdrawalId", "isActiveObligation"]);
    for (const key of Object.keys(q))
        if (!allowed.has(key))
            throw new Error(`Unsupported query field: ${key}`);
    const dateFrom = optional(q.dateFrom, x => date(x, "dateFrom"));
    const dateTo = optional(q.dateTo, x => date(x, "dateTo"));
    if (dateFrom && dateTo && dateFrom > dateTo)
        throw new Error("Invalid date range");
    const result = { page: int(q.page, "page", 1, 100000), limit: int(q.limit, "limit", 25, 100), ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) };
    if (q.sortOrder !== undefined && !["ASC", "DESC"].includes(scalar(q.sortOrder, "sortOrder").toUpperCase()))
        throw new Error("Invalid sortOrder");
    for (const [key, values] of Object.entries(enums))
        if (q[key] !== undefined) {
            const value = scalar(q[key], key).toUpperCase();
            if (!values.includes(value))
                throw new Error(`Invalid ${key}`);
            result[key] = value;
        }
    for (const key of ["creatorId", "userId", "bookingId", "paymentId", "withdrawalId"])
        if (q[key] !== undefined)
            result[key] = (0, exports.adminObjectId)(q[key], key);
    if (q.isActiveObligation !== undefined) {
        if (q.isActiveObligation !== "true" && q.isActiveObligation !== "false")
            throw new Error("Invalid isActiveObligation");
        result.isActiveObligation = q.isActiveObligation === "true";
    }
    return result;
};
exports.adminListQuery = adminListQuery;
const paymentQuery = (q) => (0, exports.adminListQuery)(q, { status: Object.values(paymentStatus_enum_1.PaymentStatus), provider: Object.values(paymentProvider_enum_1.PaymentProvider), currency: ["INR", "USD", "EUR", "THB"] });
exports.paymentQuery = paymentQuery;
exports.parseAdminPaymentListQuery = exports.paymentQuery;
const parseAdminRefundListQuery = (q) => (0, exports.adminListQuery)(q, { status: Object.values(refundStatus_enum_1.RefundStatus), currency: ["INR", "USD", "EUR", "THB"] });
exports.parseAdminRefundListQuery = parseAdminRefundListQuery;
const parseAdminSettlementListQuery = (q) => (0, exports.adminListQuery)(q, { status: Object.values(settlementStatus_enum_1.SettlementStatus), currency: ["INR", "USD", "EUR", "THB"] });
exports.parseAdminSettlementListQuery = parseAdminSettlementListQuery;
const parseAdminCreatorBalanceListQuery = (q) => (0, exports.adminListQuery)(q, { currency: ["INR", "USD", "EUR", "THB"] });
exports.parseAdminCreatorBalanceListQuery = parseAdminCreatorBalanceListQuery;
const parseAdminWithdrawalListQuery = (q) => (0, exports.adminListQuery)(q, { status: Object.values(withdrawalStatus_enum_1.WithdrawalStatus), currency: ["INR", "USD", "EUR", "THB"] });
exports.parseAdminWithdrawalListQuery = parseAdminWithdrawalListQuery;
const parseAdminPayoutListQuery = (q) => (0, exports.adminListQuery)(q, { status: Object.values(payoutStatus_enum_1.PayoutStatus), provider: Object.values(paymentProvider_enum_1.PaymentProvider), currency: ["INR", "USD", "EUR", "THB"] });
exports.parseAdminPayoutListQuery = parseAdminPayoutListQuery;
