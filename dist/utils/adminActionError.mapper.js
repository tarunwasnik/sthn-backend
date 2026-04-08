"use strict";
//backend/src/utils/adminActionError.mapper.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapAdminActionError = void 0;
const mapAdminActionError = (err) => {
    const message = err?.message || "Something went wrong";
    // Default
    let code = "EXECUTION_FAILED";
    if (message.includes("Unknown admin action")) {
        code = "UNKNOWN_ACTION";
    }
    else if (message.includes("requires a reason")) {
        code = "VALIDATION_ERROR";
    }
    else if (message.includes("validation")) {
        code = "VALIDATION_ERROR";
    }
    else if (message.includes("Confirmation token required")) {
        code = "CONFIRMATION_REQUIRED";
    }
    else if (message.includes("Confirmation token")) {
        code = "CONFIRMATION_INVALID";
    }
    else if (message.includes("Cannot")) {
        code = "ACTION_BLOCKED";
    }
    return {
        error: {
            code,
            message,
        },
    };
};
exports.mapAdminActionError = mapAdminActionError;
