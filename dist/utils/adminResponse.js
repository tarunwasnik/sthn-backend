"use strict";
//backend/src/utils/adminResponse.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminResponse = void 0;
const adminResponse = (options) => {
    const meta = {
        generatedAt: new Date().toISOString()
    };
    if (options.pagination) {
        const { page, limit, total } = options.pagination;
        meta.page = page;
        meta.limit = limit;
        meta.total = total;
        meta.hasNextPage = page * limit < total;
    }
    return {
        data: options.data,
        meta
    };
};
exports.adminResponse = adminResponse;
