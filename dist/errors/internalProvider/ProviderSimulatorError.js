"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderSimulatorError = void 0;
const AppError_1 = require("../../utils/AppError");
/** Safe operational error for trusted Internal Provider simulation commands. */
class ProviderSimulatorError extends AppError_1.AppError {
    constructor(message, code, statusCode = 400) {
        super(message, statusCode);
        this.name = this.constructor.name;
        this.code = code;
    }
}
exports.ProviderSimulatorError = ProviderSimulatorError;
