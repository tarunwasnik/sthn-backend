"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const root = path_1.default.resolve(__dirname, "..");
const read = (...p) => fs_1.default.readFileSync(path_1.default.join(root, ...p), "utf8");
const expect = (ok, message) => { if (!ok)
    throw new Error(message); };
const repo = read("repositories", "walletTopUpRequest.repository.ts");
const service = read("services", "financial", "adminWalletTopUpDecision.service.ts");
const route = read("routes", "v1", "admin.financial.routes.ts");
const controller = read("controllers", "adminWalletTopUpDecision.controller.ts");
expect(repo.includes("status: WalletTopUpRequestStatus.PENDING") && repo.includes("approvePending") && repo.includes("rejectPending"), "Guarded pending transitions missing.");
expect(!repo.includes("updateStatus") && !repo.includes("genericUpdate"), "Generic status mutation found.");
expect(service.includes("WalletTopUpDecision.APPROVE") && service.includes("WalletTopUpDecision.REJECT") && service.includes("WALLET_TOP_UP_REQUEST_DECISION_CONFLICT"), "Decision/replay contract incomplete.");
expect(!service.includes("ledger") && !service.includes("provider") && !service.includes("Wallet.create"), "Financial side effect found.");
expect(controller.includes("req.user.id") && !controller.includes("decidedBy"), "Admin identity boundary invalid.");
expect(route.includes('router.patch("/wallet-top-up-requests/:topUpReference/decision", decideWalletTopUpRequest)'), "Admin decision route missing.");
console.log("Phase 7D wallet top-up decision validation passed.");
