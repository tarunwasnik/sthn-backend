"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const creatorWithdrawalReconciliation_model_1 = require("../../../models/creatorWithdrawalReconciliation.model");
const creatorWithdrawalRepairOperation_model_1 = require("../../../models/creatorWithdrawalRepairOperation.model");
const creatorWithdrawalRetryAttempt_model_1 = require("../../../models/creatorWithdrawalRetryAttempt.model");
const featureFlagCache_service_1 = require("../../../services/controlPlane/featureFlagCache.service");
const database_1 = require("../phase7h/helpers/database");
const withdrawalOperationalInspection_test_1 = require("./withdrawalOperationalInspection.test");
const withdrawalReconciliation_test_1 = require("./withdrawalReconciliation.test");
const withdrawalRetry_test_1 = require("./withdrawalRetry.test");
const withdrawalRepair_test_1 = require("./withdrawalRepair.test");
const withdrawalOperationalAudit_test_1 = require("./withdrawalOperationalAudit.test");
const withdrawalOperationalConcurrency_test_1 = require("./withdrawalOperationalConcurrency.test");
const withdrawalOperationalFailure_test_1 = require("./withdrawalOperationalFailure.test");
const withdrawalOperationalRegression_test_1 = require("./withdrawalOperationalRegression.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase9e-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
    await Promise.all([creatorWithdrawalReconciliation_model_1.CreatorWithdrawalReconciliation.init(),
        creatorWithdrawalRetryAttempt_model_1.CreatorWithdrawalRetryAttempt.init(),
        creatorWithdrawalRepairOperation_model_1.CreatorWithdrawalRepairOperation.init()]);
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
    featureFlagCache_service_1.featureFlagCache.invalidate();
});
(0, node_test_1.after)(async () => (0, database_1.disconnectPhase7HDatabase)(), { timeout: 30000 });
(0, withdrawalOperationalInspection_test_1.registerWithdrawalOperationalInspectionTests)();
(0, withdrawalReconciliation_test_1.registerWithdrawalReconciliationTests)();
(0, withdrawalRetry_test_1.registerWithdrawalRetryTests)();
(0, withdrawalRepair_test_1.registerWithdrawalRepairTests)();
(0, withdrawalOperationalAudit_test_1.registerWithdrawalOperationalAuditTests)();
(0, withdrawalOperationalConcurrency_test_1.registerWithdrawalOperationalConcurrencyTests)();
(0, withdrawalOperationalFailure_test_1.registerWithdrawalOperationalFailureTests)();
(0, withdrawalOperationalRegression_test_1.registerWithdrawalOperationalRegressionTests)();
