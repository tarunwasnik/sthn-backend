"use strict";
//backend/src/utils/circuitBreaker.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = exports.createInMemoryBreakerState = void 0;
/**
 * Default in-memory state factory
 */
const createInMemoryBreakerState = () => ({
    state: "CLOSED",
    failureCount: 0,
    lastFailureAt: null,
});
exports.createInMemoryBreakerState = createInMemoryBreakerState;
/**
 * Core circuit breaker
 */
class CircuitBreaker {
    constructor(state, config) {
        this.state = state;
        this.config = config;
    }
    /**
     * Whether a call is allowed right now
     */
    canProceed(now = Date.now()) {
        if (this.state.state === "CLOSED") {
            return true;
        }
        if (this.state.state === "OPEN") {
            if (this.state.lastFailureAt !== null &&
                now - this.state.lastFailureAt >= this.config.openDurationMs) {
                // Move to HALF_OPEN lazily
                this.state.state = "HALF_OPEN";
                return true;
            }
            return false;
        }
        // HALF_OPEN → allow exactly one attempt
        return true;
    }
    /**
     * Record a successful call
     */
    recordSuccess() {
        this.state.failureCount = 0;
        this.state.lastFailureAt = null;
        this.state.state = "CLOSED";
    }
    /**
     * Record a failed call
     */
    recordFailure(now = Date.now()) {
        this.state.failureCount += 1;
        this.state.lastFailureAt = now;
        if (this.state.failureCount >= this.config.failureThreshold) {
            this.state.state = "OPEN";
        }
    }
    /**
     * Read-only snapshot (for diagnostics)
     */
    getSnapshot() {
        return { ...this.state };
    }
}
exports.CircuitBreaker = CircuitBreaker;
