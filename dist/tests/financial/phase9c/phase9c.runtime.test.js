"use strict";
/// <reference path="../../../types/express.d.ts" />
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const creatorWithdrawalRequest_model_1 = require("../../../models/creatorWithdrawalRequest.model");
const internalProviderEvent_model_1 = __importDefault(require("../../../models/internalProvider/internalProviderEvent.model"));
const internalWithdrawalProviderRequest_model_1 = require("../../../models/internalProvider/internalWithdrawalProviderRequest.model");
const featureFlagCache_service_1 = require("../../../services/controlPlane/featureFlagCache.service");
const database_1 = require("../phase7h/helpers/database");
const withdrawalProviderConcurrency_test_1 = require("./withdrawalProviderConcurrency.test");
const withdrawalProviderFailure_test_1 = require("./withdrawalProviderFailure.test");
const withdrawalProviderExecution_test_1 = require("./withdrawalProviderExecution.test");
const withdrawalProviderRegression_test_1 = require("./withdrawalProviderRegression.test");
const withdrawalProviderReplay_test_1 = require("./withdrawalProviderReplay.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase9c-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
    await Promise.all([
        creatorWithdrawalRequest_model_1.CreatorWithdrawalRequest.init(),
        internalWithdrawalProviderRequest_model_1.InternalWithdrawalProviderRequest.init(),
        internalProviderEvent_model_1.default.init(),
    ]);
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
    featureFlagCache_service_1.featureFlagCache.invalidate();
});
(0, node_test_1.after)(async () => {
    await (0, database_1.disconnectPhase7HDatabase)();
}, { timeout: 30000 });
(0, withdrawalProviderExecution_test_1.registerWithdrawalProviderExecutionTests)();
(0, withdrawalProviderReplay_test_1.registerWithdrawalProviderExecutionReplayTests)();
(0, withdrawalProviderConcurrency_test_1.registerWithdrawalProviderExecutionConcurrencyTests)();
(0, withdrawalProviderFailure_test_1.registerWithdrawalProviderExecutionFailureTests)();
(0, withdrawalProviderRegression_test_1.registerWithdrawalProviderExecutionRegressionTests)();
