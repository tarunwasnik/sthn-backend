"use strict";
// backend/src/services/internalProvider/base/providerClock.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderClockService = void 0;
/**
 * ------------------------------------------------------------------
 * STHN Internal Provider Platform
 * Provider Clock Service
 * ------------------------------------------------------------------
 *
 * Centralized time abstraction for the Internal Provider.
 *
 * All provider services must obtain timestamps through this service
 * rather than directly calling Date.now() or new Date().
 *
 * This provides:
 *
 * • Consistent provider timestamps
 * • Centralized delay simulation
 * • Easier testing and future clock mocking
 * • Single source of provider time
 * ------------------------------------------------------------------
 */
class ProviderClockService {
    /**
     * Returns the current provider timestamp.
     */
    now() {
        return new Date();
    }
    /**
     * Returns the current provider timestamp in milliseconds.
     */
    nowMillis() {
        return Date.now();
    }
    /**
     * Returns the current provider timestamp as an ISO string.
     */
    nowIso() {
        return this.now().toISOString();
    }
    /**
     * Returns a future timestamp.
     */
    addMilliseconds(milliseconds) {
        return new Date(this.nowMillis() + milliseconds);
    }
    /**
     * Returns a future timestamp.
     */
    addSeconds(seconds) {
        return this.addMilliseconds(seconds * 1000);
    }
    /**
     * Returns a future timestamp.
     */
    addMinutes(minutes) {
        return this.addMilliseconds(minutes * 60000);
    }
    /**
     * Returns a future timestamp.
     */
    addHours(hours) {
        return this.addMilliseconds(hours * 3600000);
    }
    /**
     * Returns a future timestamp.
     */
    addDays(days) {
        return this.addMilliseconds(days * 86400000);
    }
    /**
     * Simulates provider processing latency.
     *
     * Used only by the Internal Provider simulator.
     */
    async sleep(milliseconds) {
        await new Promise((resolve) => setTimeout(resolve, milliseconds));
    }
    /**
     * Determines whether a timestamp has expired.
     */
    isExpired(expiresAt) {
        return expiresAt.getTime() <= this.nowMillis();
    }
    /**
     * Returns the elapsed time between two timestamps.
     */
    elapsedMilliseconds(from, to = this.now()) {
        return to.getTime() - from.getTime();
    }
}
exports.ProviderClockService = ProviderClockService;
exports.default = new ProviderClockService();
