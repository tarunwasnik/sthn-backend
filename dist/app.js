"use strict";
//backend/src/app.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const routes_1 = __importDefault(require("./routes"));
const notFound_1 = require("./middlewares/notFound");
const errorHandler_1 = require("./middlewares/errorHandler");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Routes
app.use("/api", routes_1.default);
// Global handlers
app.use(notFound_1.notFound);
app.use(errorHandler_1.errorHandler);
exports.default = app;
