"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const creatorWithdrawalReconciliation_model_1 = require("../../../models/creatorWithdrawalReconciliation.model");
const creatorWithdrawalRepairOperation_model_1 = require("../../../models/creatorWithdrawalRepairOperation.model");
const creatorWithdrawalRetryAttempt_model_1 = require("../../../models/creatorWithdrawalRetryAttempt.model");
const featureFlagCache_service_1 = require("../../../services/controlPlane/featureFlagCache.service");
const database_1 = require("../phase7h/helpers/database");
const marketplaceSuccessfulFlow_test_1 = require("./marketplaceSuccessfulFlow.test");
const marketplaceReplay_test_1 = require("./marketplaceReplay.test");
const marketplaceConcurrency_test_1 = require("./marketplaceConcurrency.test");
const marketplaceFinancialIntegrity_test_1 = require("./marketplaceFinancialIntegrity.test");
const marketplaceRegression_test_1 = require("./marketplaceRegression.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase10a-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
    await Promise.all([
        creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.init(),
        creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt.init(),
        creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.init(),
    ]);
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
    featureFlagCache_service_1.featureFlagCache.invalidate();
});
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, marketplaceSuccessfulFlow_test_1.registerMarketplaceSuccessfulFlowTests)();
(0, marketplaceReplay_test_1.registerMarketplaceReplayTests)();
(0, marketplaceConcurrency_test_1.registerMarketplaceConcurrencyTests)();
(0, marketplaceFinancialIntegrity_test_1.registerMarketplaceFinancialIntegrityTests)();
(0, marketplaceRegression_test_1.registerMarketplaceRegressionTests)();
