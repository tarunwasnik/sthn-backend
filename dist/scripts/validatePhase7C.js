"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const root = path_1.default.resolve(__dirname, "..");
const read = (...parts) => fs_1.default.readFileSync(path_1.default.join(root, ...parts), "utf8");
const expect = (ok, message) => { if (!ok)
    throw new Error(message); };
const model = read("models", "walletTopUpRequest.model.ts");
const service = read("services", "financial", "walletTopUpRequest.service.ts");
const userController = read("controllers", "walletTopUpRequest.controller.ts");
const adminRoutes = read("routes", "v1", "admin.financial.routes.ts");
const routes = read("routes", "v1", "wallet.routes.ts");
expect(model.includes("WalletTopUpRequestStatus") && model.includes("default: WalletTopUpRequestStatus.PENDING"), "Pending-only creation missing.");
expect(model.includes("{ userId: 1, idempotencyKey: 1 }, { unique: true }") && model.includes("topUpReference: { type: String, required: true, unique: true"), "Identity indexes missing.");
expect(model.includes("immutable: true") && model.includes("requestFingerprint"), "Immutable request identity missing.");
expect(service.includes("createIdempotencyFingerprint(\"WALLET_TOP_UP_REQUEST\"") && service.includes("findByUserAndIdempotencyKey") && service.includes("WALLET_TOP_UP_REQUEST_IDEMPOTENCY_CONFLICT"), "Idempotency flow missing.");
expect(service.includes("walletCreationService.createWallet") && service.includes("isValidMoney") && !service.includes("ledgerService") && !service.includes("initializePayout"), "Wallet resolution or no-side-effect boundary missing.");
expect(userController.includes("req.user.id") && userController.includes('req.header("Idempotency-Key")') && !userController.includes("walletId"), "Authenticated ownership or header key missing.");
expect(routes.includes('"/top-up-requests"') && adminRoutes.includes('"/wallet-top-up-requests"'), "Required read routes missing.");
console.log("Phase 7C wallet top-up request validation passed.");
