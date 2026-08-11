"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotWithdrawalOperationalMoney = exports.adminToken = exports.createInitializedWithdrawalProviderFixture = exports.createHealthyWithdrawalFixture = exports.createPendingFinalizationFixture = exports.startCreatorWithdrawalHttpServer = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const auditLog_model_1 = require("../../../../models/auditLog.model");
const creatorWithdrawalRequest_model_1 = require("../../../../models/creatorWithdrawalRequest.model");
const ledgerEntry_model_1 = require("../../../../models/ledgerEntry.model");
const wallet_model_1 = require("../../../../models/wallet.model");
const walletProjectionOperation_model_1 = require("../../../../models/walletProjectionOperation.model");
const creatorWithdrawalFinalization_service_1 = require("../../../../services/financial/creatorWithdrawalFinalization.service");
const admin_routes_1 = __importDefault(require("../../../../routes/v1/admin.routes"));
const admin_financial_routes_1 = __importDefault(require("../../../../routes/v1/admin.financial.routes"));
const booking_routes_1 = __importDefault(require("../../../../routes/v1/booking.routes"));
const creatorCancelBooking_routes_1 = __importDefault(require("../../../../routes/v1/creatorCancelBooking.routes"));
const creatorBookingDecision_routes_1 = __importDefault(require("../../../../routes/v1/creatorBookingDecision.routes"));
const withdrawal_routes_1 = __importDefault(require("../../../../routes/v1/withdrawal.routes"));
const errorHandler_1 = require("../../../../middlewares/errorHandler");
const notFound_1 = require("../../../../middlewares/notFound");
const creatorWithdrawalFinalizationFixtures_1 = require("../../phase9d/fixtures/creatorWithdrawalFinalizationFixtures");
const withdrawalProviderExecutionFixtures_1 = require("../../phase9c/fixtures/withdrawalProviderExecutionFixtures");
Object.defineProperty(exports, "createInitializedWithdrawalProviderFixture", { enumerable: true, get: function () { return withdrawalProviderExecutionFixtures_1.createInitializedWithdrawalProviderFixture; } });
const startCreatorWithdrawalHttpServer = async () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use("/api/v1/bookings", booking_routes_1.default);
    app.use("/api/v1/bookings/creator", creatorCancelBooking_routes_1.default);
    app.use("/api/v1/creator", creatorBookingDecision_routes_1.default);
    app.use("/api/v1/admin/financial", admin_financial_routes_1.default);
    app.use("/api/v1/admin", admin_routes_1.default);
    app.use("/api/v1/withdrawals", withdrawal_routes_1.default);
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    const server = node_http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("Phase 9E test server did not bind.");
    return { baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
};
exports.startCreatorWithdrawalHttpServer = startCreatorWithdrawalHttpServer;
const createPendingFinalizationFixture = (baseUrl, outcome) => (0, creatorWithdrawalFinalizationFixtures_1.createTerminalWithdrawalFixture)(baseUrl, outcome);
exports.createPendingFinalizationFixture = createPendingFinalizationFixture;
const createHealthyWithdrawalFixture = async (baseUrl, outcome) => {
    const fixture = await (0, exports.createPendingFinalizationFixture)(baseUrl, outcome);
    const finalization = await creatorWithdrawalFinalization_service_1.creatorWithdrawalFinalizationService.finalize(fixture.withdrawal.withdrawalReference);
    return { ...fixture, finalization };
};
exports.createHealthyWithdrawalFixture = createHealthyWithdrawalFixture;
const adminToken = (id) => jsonwebtoken_1.default.sign({ id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1h" });
exports.adminToken = adminToken;
const snapshotWithdrawalOperationalMoney = async (withdrawalReference, walletId) => {
    const wallet = await wallet_model_1.Wallet.findById(walletId).orFail();
    const withdrawal = await creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.findOne({
        withdrawalReference,
    }).orFail();
    return {
        wallet: {
            currentBalance: wallet.currentBalance,
            availableBalance: wallet.availableBalance,
            reservedBalance: wallet.reservedBalance,
            lockedBalance: wallet.lockedBalance,
            projectionVersion: wallet.projectionVersion,
        },
        withdrawal: { status: withdrawal.status, amount: withdrawal.amount,
            currency: withdrawal.currency, version: withdrawal.version },
        ledgerCount: await ledgerEntry_model_1.LedgerEntry.countDocuments(),
        projectionCount: await walletProjectionOperation_model_1.WalletProjectionOperation.countDocuments(),
        terminalAuditCount: await auditLog_model_1.AuditLog.countDocuments({
            action: { $in: ["CREATOR_WITHDRAWAL_COMPLETED",
                    "CREATOR_WITHDRAWAL_FAILED"] },
        }),
    };
};
exports.snapshotWithdrawalOperationalMoney = snapshotWithdrawalOperationalMoney;
