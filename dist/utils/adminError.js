"use strict";
//backend/src/utils/adminError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminError = void 0;
const adminError = (message, code = "ADMIN_ERROR") => {
    return {
        error: {
            code,
            message
        },
        meta: {
            generatedAt: new Date().toISOString()
        }
    };
};
exports.adminError = adminError;
