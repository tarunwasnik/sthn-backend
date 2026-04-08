"use strict";
//backend/src/services/adminActions/adminActionSignal.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminActionAlerts = exports.getAdminActionSignals = exports.recordAdminActionSignal = void 0;
const adminActionAlert_service_1 = require("./adminActionAlert.service");
const signalBuffer = [];
const alertBuffer = [];
/**
 * Record anomaly signal
 * Signals are raw and unfiltered
 */
const recordAdminActionSignal = (signal) => {
    signalBuffer.push(signal);
    const alert = (0, adminActionAlert_service_1.processAdminActionSignal)(signal);
    if (alert) {
        alertBuffer.push(alert);
    }
};
exports.recordAdminActionSignal = recordAdminActionSignal;
const getAdminActionSignals = () => signalBuffer;
exports.getAdminActionSignals = getAdminActionSignals;
const getAdminActionAlerts = () => alertBuffer;
exports.getAdminActionAlerts = getAdminActionAlerts;
