// backend/src/services/internalProvider/base/providerClock.service.ts

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

export class ProviderClockService {
  /**
   * Returns the current provider timestamp.
   */
  now(): Date {
    return new Date();
  }

  /**
   * Returns the current provider timestamp in milliseconds.
   */
  nowMillis(): number {
    return Date.now();
  }

  /**
   * Returns the current provider timestamp as an ISO string.
   */
  nowIso(): string {
    return this.now().toISOString();
  }

  /**
   * Returns a future timestamp.
   */
  addMilliseconds(milliseconds: number): Date {
    return new Date(this.nowMillis() + milliseconds);
  }

  /**
   * Returns a future timestamp.
   */
  addSeconds(seconds: number): Date {
    return this.addMilliseconds(seconds * 1_000);
  }

  /**
   * Returns a future timestamp.
   */
  addMinutes(minutes: number): Date {
    return this.addMilliseconds(minutes * 60_000);
  }

  /**
   * Returns a future timestamp.
   */
  addHours(hours: number): Date {
    return this.addMilliseconds(hours * 3_600_000);
  }

  /**
   * Returns a future timestamp.
   */
  addDays(days: number): Date {
    return this.addMilliseconds(days * 86_400_000);
  }

  /**
   * Simulates provider processing latency.
   *
   * Used only by the Internal Provider simulator.
   */
  async sleep(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  /**
   * Determines whether a timestamp has expired.
   */
  isExpired(expiresAt: Date): boolean {
    return expiresAt.getTime() <= this.nowMillis();
  }

  /**
   * Returns the elapsed time between two timestamps.
   */
  elapsedMilliseconds(from: Date, to: Date = this.now()): number {
    return to.getTime() - from.getTime();
  }
}

export default new ProviderClockService();
