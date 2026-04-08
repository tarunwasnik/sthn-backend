"use strict";
//backend/src/services/adminActions/adminActionValidator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAdminActionParams = void 0;
const validateAdminActionParams = (action, params) => {
    const allowedParams = action.params.map(p => p.name);
    // 1. Check required params
    for (const param of action.params) {
        if (param.required && !(param.name in params)) {
            return {
                ok: false,
                error: `Missing required param: ${param.name}`,
            };
        }
    }
    // 2. Reject unknown params
    for (const key of Object.keys(params)) {
        if (!allowedParams.includes(key)) {
            return {
                ok: false,
                error: `Unknown param: ${key}`,
            };
        }
    }
    // 3. Type validation
    for (const param of action.params) {
        const value = params[param.name];
        if (value === undefined)
            continue;
        switch (param.type) {
            case "string":
                if (typeof value !== "string") {
                    return {
                        ok: false,
                        error: `Param '${param.name}' must be a string`,
                    };
                }
                break;
            case "number":
                if (typeof value !== "number") {
                    return {
                        ok: false,
                        error: `Param '${param.name}' must be a number`,
                    };
                }
                break;
            case "boolean":
                if (typeof value !== "boolean") {
                    return {
                        ok: false,
                        error: `Param '${param.name}' must be a boolean`,
                    };
                }
                break;
        }
    }
    return { ok: true };
};
exports.validateAdminActionParams = validateAdminActionParams;
