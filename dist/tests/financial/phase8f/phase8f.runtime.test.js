"use strict";
/// <reference path="../../../types/express.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const featureFlagCache_service_1 = require("../../../services/controlPlane/featureFlagCache.service");
const database_1 = require("../phase7h/helpers/database");
const bookingCreatorSettlementOperationalAudit_test_1 = require("./bookingCreatorSettlementOperationalAudit.test");
const bookingCreatorSettlementReconciliation_test_1 = require("./bookingCreatorSettlementReconciliation.test");
const bookingCreatorSettlementRegression_test_1 = require("./bookingCreatorSettlementRegression.test");
const bookingCreatorSettlementRepair_test_1 = require("./bookingCreatorSettlementRepair.test");
const bookingCreatorSettlementRetry_test_1 = require("./bookingCreatorSettlementRetry.test");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase8f-test-jwt-secret";
(0, node_test_1.before)(async () => {
    await (0, database_1.connectPhase7HDatabase)();
}, { timeout: 120000 });
(0, node_test_1.beforeEach)(async () => {
    await (0, database_1.clearPhase7HDatabase)();
    featureFlagCache_service_1.featureFlagCache.invalidate();
});
(0, node_test_1.after)(async () => {
    await (0, database_1.disconnectPhase7HDatabase)();
}, { timeout: 30000 });
(0, bookingCreatorSettlementReconciliation_test_1.registerBookingCreatorSettlementReconciliationTests)();
(0, bookingCreatorSettlementRetry_test_1.registerBookingCreatorSettlementRetryTests)();
(0, bookingCreatorSettlementRepair_test_1.registerBookingCreatorSettlementRepairTests)();
(0, bookingCreatorSettlementOperationalAudit_test_1.registerBookingCreatorSettlementOperationalAuditTests)();
(0, bookingCreatorSettlementRegression_test_1.registerBookingCreatorSettlementOperationalRegressionTests)();
