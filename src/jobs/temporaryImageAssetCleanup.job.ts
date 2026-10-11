import { temporaryImageAssetCleanupService } from "../services/imageModeration/temporaryImageAssetCleanup.service";

/**
 * Intentionally not registered with the API-server scheduler in R7B. R7E must
 * provide an explicitly enabled, observable worker topology before activation.
 */
export const temporaryImageAssetCleanupJob = async (input: { limit?: number } = {}) => temporaryImageAssetCleanupService.processBatch(input);
