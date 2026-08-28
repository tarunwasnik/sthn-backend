"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const adminWalletTopUpRequest_controller_1 = require("../../controllers/adminWalletTopUpRequest.controller");
const walletTopUpRequestStatus_enum_1 = require("../../enums/financial/walletTopUpRequestStatus.enum");
const walletTopUpRequest_repository_1 = require("../../repositories/walletTopUpRequest.repository");
const walletTopUpRequest_service_1 = require("../../services/financial/walletTopUpRequest.service");
const originalListByStatus = walletTopUpRequest_repository_1.walletTopUpRequestRepository.listByStatus.bind(walletTopUpRequest_repository_1.walletTopUpRequestRepository);
const originalListAdminByStatus = walletTopUpRequest_service_1.walletTopUpRequestService.listAdminByStatus.bind(walletTopUpRequest_service_1.walletTopUpRequestService);
(0, node_test_1.after)(() => {
    walletTopUpRequest_repository_1.walletTopUpRequestRepository.listByStatus = originalListByStatus;
    walletTopUpRequest_service_1.walletTopUpRequestService.listAdminByStatus = originalListAdminByStatus;
});
(0, node_test_1.test)("admin top-up reads select the requested persisted lifecycle status", async () => {
    let receivedStatus;
    walletTopUpRequest_repository_1.walletTopUpRequestRepository.listByStatus = async (status) => {
        receivedStatus = status;
        return [{ topUpReference: "TOPUP-READ-CONTRACT", amount: 100, currency: "USD", status, requestedAt: new Date() }];
    };
    const requests = await walletTopUpRequest_service_1.walletTopUpRequestService.listAdminByStatus(walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING);
    strict_1.default.equal(receivedStatus, walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING);
    strict_1.default.deepEqual(requests.map((request) => request.status), [walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PROCESSING]);
});
(0, node_test_1.test)("admin top-up list defaults to pending and rejects unsupported status filters", async () => {
    const calls = [];
    walletTopUpRequest_service_1.walletTopUpRequestService.listAdminByStatus = async (status) => {
        calls.push(status);
        return [];
    };
    const response = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await adminWalletTopUpRequest_controller_1.adminWalletTopUpRequestController.list({ query: {} }, response, (() => undefined));
    strict_1.default.deepEqual(calls, [walletTopUpRequestStatus_enum_1.WalletTopUpRequestStatus.PENDING]);
    strict_1.default.equal(response.statusCode, 200);
    await adminWalletTopUpRequest_controller_1.adminWalletTopUpRequestController.list({ query: { status: "NOT_A_STATUS" } }, response, (() => undefined));
    strict_1.default.equal(response.statusCode, 400);
});
