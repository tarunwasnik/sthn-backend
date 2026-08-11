"use strict";
// backend/src/constants/wallet/wallet.constants.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.WALLET_LIST_MAX_PAGE_SIZE = exports.WALLET_LIST_PAGE_SIZE = exports.WALLET_HISTORY_MAX_PAGE_SIZE = exports.WALLET_HISTORY_PAGE_SIZE = exports.WALLET_SYNC_BATCH_SIZE = exports.WALLET_REBUILD_BATCH_SIZE = exports.WALLET_PROJECTION_VERSION = exports.DEFAULT_WALLET_CURRENCY = void 0;
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
exports.DEFAULT_WALLET_CURRENCY = "INR";
/**
 * Current wallet projection version.
 *
 * Increment this only when the wallet projection structure
 * changes in a backward-incompatible way.
 */
exports.WALLET_PROJECTION_VERSION = 1;
/**
 * Maximum number of wallet records processed during a
 * single rebuild batch.
 */
exports.WALLET_REBUILD_BATCH_SIZE = 500;
/**
 * Maximum number of wallet records synchronized in a
 * single synchronization batch.
 */
exports.WALLET_SYNC_BATCH_SIZE = 500;
/**
 * Default page size for wallet history queries.
 */
exports.WALLET_HISTORY_PAGE_SIZE = 25;
/**
 * Maximum page size for wallet history queries.
 */
exports.WALLET_HISTORY_MAX_PAGE_SIZE = 100;
/**
 * Default page size for wallet listing.
 */
exports.WALLET_LIST_PAGE_SIZE = 25;
/**
 * Maximum page size for wallet listing.
 */
exports.WALLET_LIST_MAX_PAGE_SIZE = 100;
