import assert from "node:assert/strict";
import { after, test } from "node:test";

import { adminWalletTopUpRequestController } from "../../controllers/adminWalletTopUpRequest.controller";
import { WalletTopUpRequestStatus } from "../../enums/financial/walletTopUpRequestStatus.enum";
import { walletTopUpRequestRepository } from "../../repositories/walletTopUpRequest.repository";
import { walletTopUpRequestService } from "../../services/financial/walletTopUpRequest.service";

const originalListByStatus = walletTopUpRequestRepository.listByStatus.bind(walletTopUpRequestRepository);
const originalListAdminByStatus = walletTopUpRequestService.listAdminByStatus.bind(walletTopUpRequestService);

after(() => {
  walletTopUpRequestRepository.listByStatus = originalListByStatus;
  walletTopUpRequestService.listAdminByStatus = originalListAdminByStatus;
});

test("admin top-up reads select the requested persisted lifecycle status", async () => {
  let receivedStatus: WalletTopUpRequestStatus | undefined;
  walletTopUpRequestRepository.listByStatus = async (status) => {
    receivedStatus = status;
    return [{ topUpReference: "TOPUP-READ-CONTRACT", amount: 100, currency: "USD", status, requestedAt: new Date() }] as never;
  };

  const requests = await walletTopUpRequestService.listAdminByStatus(WalletTopUpRequestStatus.PROCESSING);
  assert.equal(receivedStatus, WalletTopUpRequestStatus.PROCESSING);
  assert.deepEqual(requests.map((request) => request.status), [WalletTopUpRequestStatus.PROCESSING]);
});

test("admin top-up list defaults to pending and rejects unsupported status filters", async () => {
  const calls: WalletTopUpRequestStatus[] = [];
  walletTopUpRequestService.listAdminByStatus = async (status) => {
    calls.push(status);
    return [];
  };
  const response = { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };

  await adminWalletTopUpRequestController.list({ query: {} } as never, response as never, (() => undefined) as never);
  assert.deepEqual(calls, [WalletTopUpRequestStatus.PENDING]);
  assert.equal(response.statusCode, 200);

  await adminWalletTopUpRequestController.list({ query: { status: "NOT_A_STATUS" } } as never, response as never, (() => undefined) as never);
  assert.equal(response.statusCode, 400);
});
