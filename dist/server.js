"use strict";
// backend/src/server.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
/// <reference path="./types/express.d.ts" />
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const routes_1 = __importDefault(require("./routes"));
const sockets_1 = require("./sockets");
const expireBookings_job_1 = require("./jobs/expireBookings.job");
const completeBookings_job_1 = require("./jobs/completeBookings.job"); // ✅ ADD THIS
const interactionTrigger_job_1 = require("./jobs/interactionTrigger.job");
const sessionEndingSoon_job_1 = require("./jobs/sessionEndingSoon.job");
const disputeEscalation_job_1 = require("./jobs/disputeEscalation.job");
mongoose_1.default.set("bufferCommands", false);
const app = (0, express_1.default)();
/* ===================== MIDDLEWARE ===================== */
app.use((0, cors_1.default)({
    origin: "http://localhost:5173",
    credentials: true,
}));
app.use(express_1.default.json());
/* ===================== SERVER ===================== */
const PORT = process.env.PORT || 5000;
let jobRunning = false;
/* ===================== BACKGROUND JOBS ===================== */
async function runBackgroundJobs() {
    if (jobRunning)
        return;
    try {
        jobRunning = true;
        console.log("🔄 Running background jobs...");
        await (0, expireBookings_job_1.expireBookingsJob)();
        await (0, completeBookings_job_1.completeBookingsJob)(); // ✅ ADD THIS (CRITICAL)
        await (0, interactionTrigger_job_1.interactionTriggerJob)();
        await (0, sessionEndingSoon_job_1.sessionEndingSoonJob)();
        await (0, disputeEscalation_job_1.disputeEscalationJob)();
        console.log("✅ Background jobs completed");
    }
    catch (err) {
        console.error("❌ Background job error:", err);
    }
    finally {
        jobRunning = false;
    }
}
async function startJobLoop() {
    // ✅ WAIT BEFORE FIRST RUN
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log("⏱ Starting job loop...");
    while (true) {
        await runBackgroundJobs();
        await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
    }
}
/* ===================== START SERVER ===================== */
async function startServer() {
    try {
        await mongoose_1.default.connect(process.env.MONGODB_URI);
        console.log("✅ MongoDB connected");
        app.use("/api", routes_1.default);
        const httpServer = http_1.default.createServer(app);
        exports.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: "http://localhost:5173",
                credentials: true,
            },
        });
        (0, sockets_1.initSockets)(exports.io);
        httpServer.listen(PORT, () => {
            console.log(`🚀 Server + Socket.IO running on port ${PORT}`);
            startJobLoop();
            console.log("⏱ Background jobs scheduled");
        });
        process.on("SIGINT", async () => {
            console.log("🛑 Shutting down server...");
            await mongoose_1.default.connection.close();
            httpServer.close(() => {
                process.exit(0);
            });
        });
    }
    catch (err) {
        console.error("❌ MongoDB connection failed:", err);
        process.exit(1);
    }
}
startServer();
