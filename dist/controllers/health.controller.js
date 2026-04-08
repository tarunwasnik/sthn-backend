"use strict";
//backend/src/controllers/health.controller.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheck = healthCheck;
exports.readinessCheck = readinessCheck;
async function healthCheck(_req, res) {
    res.json({
        status: "ok",
        uptime: process.uptime(),
    });
}
async function readinessCheck(_req, res) {
    res.json({
        ready: true,
        timestamp: new Date().toISOString(),
    });
}
