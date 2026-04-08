"use strict";
//backend/src/rervices/controlPlane/featuredFlagCache.service.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.featureFlagCache = void 0;
class FeatureFlagCache {
    constructor() {
        this.flags = null;
        this.lastLoadedAt = 0;
        this.TTL = 10000; // 10 seconds
    }
    isValid() {
        return Date.now() - this.lastLoadedAt < this.TTL;
    }
    get() {
        return this.flags;
    }
    set(flags) {
        this.flags = flags;
        this.lastLoadedAt = Date.now();
    }
    invalidate() {
        this.flags = null;
    }
}
exports.featureFlagCache = new FeatureFlagCache();
