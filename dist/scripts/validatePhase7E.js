"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const root = path_1.default.resolve(__dirname, "../..");
const read = (file) => fs_1.default.readFileSync(path_1.default.join(root, file), "utf8");
const need = (file, value) => { if (!read(file).includes(value))
    throw new Error(`${file} missing ${value}`); };
need("src/models/internalTopUpFunding.model.ts", "topUpRequestId");
need("src/services/financial/internalTopUpFunding.service.ts", "ProviderEventService.recordEvent");
need("src/services/financial/topUpFundingOrchestrator.service.ts", "startProcessingApproved");
need("src/routes/v1/admin.financial.routes.ts", "start-processing");
console.log("Phase 7E static validation passed.");
