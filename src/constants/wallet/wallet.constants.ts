// backend/src/constants/wallet/wallet.constants.ts

/**
 * ============================================================
 * STHN Marketplace
 * Financial Domain
 * Wallet Constants
 * ============================================================
 */

/**
 * Default wallet currency.
 *
 * Wallets are initialized using the creator/user currency
 * selected during onboarding. This constant acts as the
 * fallback if no currency is available.
 */
export const DEFAULT_WALLET_CURRENCY = "INR";

/**
 * Current wallet projection version.
 *
 * Increment this only when the wallet projection structure
 * changes in a backward-incompatible way.
 */
export const WALLET_PROJECTION_VERSION = 1;

/**
 * Maximum number of wallet records processed during a
 * single rebuild batch.
 */
export const WALLET_REBUILD_BATCH_SIZE = 500;

/**
 * Maximum number of wallet records synchronized in a
 * single synchronization batch.
 */
export const WALLET_SYNC_BATCH_SIZE = 500;

/**
 * Default page size for wallet history queries.
 */
export const WALLET_HISTORY_PAGE_SIZE = 25;

/**
 * Maximum page size for wallet history queries.
 */
export const WALLET_HISTORY_MAX_PAGE_SIZE = 100;

/**
 * Default page size for wallet listing.
 */
export const WALLET_LIST_PAGE_SIZE = 25;

/**
 * Maximum page size for wallet listing.
 */
export const WALLET_LIST_MAX_PAGE_SIZE = 100;
