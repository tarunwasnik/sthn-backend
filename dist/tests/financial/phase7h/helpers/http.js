"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTestHttpServer = void 0;
const node_http_1 = __importDefault(require("node:http"));
const express_1 = __importDefault(require("express"));
const admin_financial_routes_1 = __importDefault(require("../../../../routes/v1/admin.financial.routes"));
const notFound_1 = require("../../../../middlewares/notFound");
const errorHandler_1 = require("../../../../middlewares/errorHandler");
const startTestHttpServer = async () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use("/api/v1/admin/financial", admin_financial_routes_1.default);
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    const server = node_http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("Test HTTP server did not bind.");
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
};
exports.startTestHttpServer = startTestHttpServer;
