//backend/src/utils/circuitBreaker.ts

/**
 * Phase 28 — Circuit Breaker Primitive
 *
 * Purpose:
 * - Prevent cascading failures
 * - Fail fast when a subsystem is unhealthy
 * - Recover automatically after cooldown
 *
 * No side effects.
 * No timers.
 * State advances only on interaction.
 */

/**
 * Circuit breaker states
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Minimal state interface
 *
 * Can be replaced later with:
 * - shared memory
 * - Redis
 * - test doubles
 */
export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number | null;
}

/**
 * Configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number; // failures before opening
  openDurationMs: number;   // cooldown before half-open
}

/**
 * Default in-memory state factory
 */
export const createInMemoryBreakerState =
  (): CircuitBreakerState => ({
    state: "CLOSED",
    failureCount: 0,
    lastFailureAt: null,
  });

/**
 * Core circuit breaker
 */
export class CircuitBreaker {
  private readonly state: CircuitBreakerState;
  private readonly config: CircuitBreakerConfig;

  constructor(
    state: CircuitBreakerState,
    config: CircuitBreakerConfig
  ) {
    this.state = state;
    this.config = config;
  }

  /**
   * Whether a call is allowed right now
   */
  canProceed(now: number = Date.now()): boolean {
    if (this.state.state === "CLOSED") {
      return true;
    }

    if (this.state.state === "OPEN") {
      if (
        this.state.lastFailureAt !== null &&
        now - this.state.lastFailureAt >= this.config.openDurationMs
      ) {
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
  recordSuccess(): void {
    this.state.failureCount = 0;
    this.state.lastFailureAt = null;
    this.state.state = "CLOSED";
  }

  /**
   * Record a failed call
   */
  recordFailure(now: number = Date.now()): void {
    this.state.failureCount += 1;
    this.state.lastFailureAt = now;

    if (
      this.state.failureCount >= this.config.failureThreshold
    ) {
      this.state.state = "OPEN";
    }
  }

  /**
   * Read-only snapshot (for diagnostics)
   */
  getSnapshot(): CircuitBreakerState {
    return { ...this.state };
  }
}