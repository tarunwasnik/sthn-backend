//backend/src/services/adminActions/adminActionSignal.service.ts



import {
  AdminActionAnomalySignal,
} from "./adminActionAnomaly.types";
import {
  processAdminActionSignal,
} from "./adminActionAlert.service";

const signalBuffer: AdminActionAnomalySignal[] = [];
const alertBuffer: any[] = [];

/**
 * Record anomaly signal
 * Signals are raw and unfiltered
 */
export const recordAdminActionSignal = (
  signal: AdminActionAnomalySignal
) => {
  signalBuffer.push(signal);

  const alert = processAdminActionSignal(signal);
  if (alert) {
    alertBuffer.push(alert);
  }
};

export const getAdminActionSignals = () => signalBuffer;

export const getAdminActionAlerts = () => alertBuffer;