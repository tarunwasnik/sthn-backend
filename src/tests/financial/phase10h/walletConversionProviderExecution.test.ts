import assert from "node:assert/strict";
import { test } from "node:test";

import InternalProviderEvent from
  "../../../models/internalProvider/internalProviderEvent.model";
import { InternalWalletConversionProviderRequest } from
  "../../../models/internalProvider/internalWalletConversionProviderRequest.model";
import { WalletConversionAudit } from
  "../../../models/walletConversionAudit.model";
import { WalletConversionRequest } from
  "../../../models/walletConversionRequest.model";
import { captureFrozenFinancialState, createProviderFixture, executeFailure,
  executeSuccess } from "./fixtures/walletConversionProviderFixtures";

export const registerExecutionTests = () => {
  test("phase10h successful execution reaches SUCCEEDED without accounting", async () => {
    const fixture = await createProviderFixture();
    const frozen = await captureFrozenFinancialState();
    const result = await executeSuccess(fixture);
    assert.deepEqual(Object.keys(result).sort(), ["completedAt",
      "conversionReference", "processingAt", "providerOutcome",
      "providerReference", "providerStatus"].sort());
    assert.equal(result.providerStatus, "SUCCEEDED");
    assert.equal(result.providerOutcome, "SUCCESS");
    assert.match(result.providerReference, /^IWCPR-/);
    const authority = await InternalWalletConversionProviderRequest.findOne({
      conversionReference: fixture.created.conversionReference,
    }).select("+providerRequestKey +userId +sourceWalletId +targetWalletId " +
      "+providerFingerprint +executionFingerprint +providerMetadata " +
      "+execution +payloads +failureReason").orFail();
    assert.equal(authority.version, 2);
    assert.equal(authority.isTerminal, true);
    assert.match(authority.providerExecutionReference, /^IWCXE-/);
    assert.equal(authority.failureCode, undefined);
    const request = await WalletConversionRequest.findOne({
      conversionReference: fixture.created.conversionReference,
    }).select("+providerMetadata").orFail();
    assert.equal(request.status, "APPROVED");
    assert.equal(request.providerStatus, "SUCCEEDED");
    assert.equal(request.providerOutcome, "SUCCESS");
    assert.equal(request.providerRequestReference,
      authority.providerRequestReference);
    assert.equal(await InternalProviderEvent.countDocuments({
      entityType: "WALLET_CONVERSION_PROVIDER_REQUEST",
    }), 4);
    assert.equal(await WalletConversionAudit.countDocuments({ action: { $in: [
      "WALLET_CONVERSION_PROVIDER_STARTED",
      "WALLET_CONVERSION_PROVIDER_SUCCEEDED",
    ] } }), 2);
    assert.equal(fixture.executions, 1);
    assert.deepEqual(await captureFrozenFinancialState(), frozen);
  });

  test("phase10h failed execution records deterministic failure without accounting", async () => {
    const fixture = await createProviderFixture({ createTargetWallet: true });
    const frozen = await captureFrozenFinancialState();
    const result = await executeFailure(fixture);
    assert.equal(result.providerStatus, "FAILED");
    assert.equal(result.providerOutcome, "FAILURE");
    const authority = await InternalWalletConversionProviderRequest.findOne({
      conversionReference: fixture.created.conversionReference,
    }).select("+failureReason").orFail();
    assert.equal(authority.failureCode, "SIMULATED_CONVERSION_FAILURE");
    assert.equal(authority.failureReason,
      "Deterministic conversion provider failure");
    const request = await WalletConversionRequest.findOne({
      conversionReference: fixture.created.conversionReference,
    }).orFail();
    assert.equal(request.status, "APPROVED");
    assert.equal(request.providerStatus, "FAILED");
    assert.equal(request.providerFailureCode,
      "SIMULATED_CONVERSION_FAILURE");
    assert.equal(await WalletConversionAudit.countDocuments({
      action: "WALLET_CONVERSION_PROVIDER_FAILED",
      failureCode: "SIMULATED_CONVERSION_FAILURE",
    }), 1);
    assert.deepEqual(await captureFrozenFinancialState(), frozen);
  });
};
