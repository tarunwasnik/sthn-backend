// backend/src/server.ts

/// <reference path="./types/express.d.ts" />

import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import routes from "./routes";
import { initSockets } from "./sockets";

import { expireBookingsJob } from "./jobs/expireBookings.job";
import { completeBookingsJob } from "./jobs/completeBookings.job";
import { interactionTriggerJob } from "./jobs/interactionTrigger.job";
import { sessionEndingSoonJob } from "./jobs/sessionEndingSoon.job";
import { disputeEscalationJob } from "./jobs/disputeEscalation.job";
import { settleBookingsJob } from "./jobs/settleBookings.job";
import { profileVerificationReconciliationJob } from "./jobs/profileVerificationReconciliation.job";
import { faceVerificationEvidenceCleanupJob } from "./jobs/faceVerificationEvidenceCleanup.job";

import { errorHandler } from "./middlewares/errorHandler"; // ✅ ADDED

mongoose.set("bufferCommands", false);

const app = express();

/* ===================== CORS CONFIG ===================== */

const allowedOrigins = [
  "http://localhost:5173",
  "https://sthn-frontend.vercel.app",
  "https://sthn-frontend-hmcpkqxce-tarunwasniks-projects.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

/* ===================== SOCKET SINGLETON ===================== */

export let io: Server;

/* ===================== SERVER ===================== */

const PORT = process.env.PORT || 5000;

let jobRunning = false;
let jobLoopStopping = false;
let jobLoopPromise: Promise<void> | null = null;
let jobLoopTimer: NodeJS.Timeout | null = null;
let resolveJobLoopDelay: (() => void) | null = null;

/* ===================== BACKGROUND JOBS ===================== */

async function runBackgroundJobs() {
  if (jobRunning) return;

  try {
    jobRunning = true;

    console.log("🔄 Running background jobs...");

    await expireBookingsJob();
    await completeBookingsJob();
    await interactionTriggerJob();
    await sessionEndingSoonJob();
    await disputeEscalationJob();
    await settleBookingsJob();
    await profileVerificationReconciliationJob();
    await faceVerificationEvidenceCleanupJob();

    console.log("✅ Background jobs completed");
  } catch (err) {
    console.error("❌ Background job error:", err);
  } finally {
    jobRunning = false;
  }
}

const waitForJobLoopDelay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    resolveJobLoopDelay = () => {
      resolveJobLoopDelay = null;
      resolve();
    };

    jobLoopTimer = setTimeout(() => {
      jobLoopTimer = null;
      resolveJobLoopDelay?.();
    }, milliseconds);
  });

async function startJobLoop() {
  if (jobLoopPromise) return jobLoopPromise;

  jobLoopStopping = false;

  jobLoopPromise = (async () => {
    await waitForJobLoopDelay(5000);

    if (jobLoopStopping) return;

    console.log("⏱ Starting job loop...");

    while (!jobLoopStopping) {
      await runBackgroundJobs();

      if (jobLoopStopping) break;

      await waitForJobLoopDelay(60 * 1000);
    }
  })().finally(() => {
    jobLoopPromise = null;
    jobLoopTimer = null;
    resolveJobLoopDelay = null;
  });

  return jobLoopPromise;
}

async function stopJobLoop() {
  jobLoopStopping = true;

  if (jobLoopTimer) {
    clearTimeout(jobLoopTimer);
    jobLoopTimer = null;
  }

  resolveJobLoopDelay?.();
  await jobLoopPromise;
}

/* ===================== START SERVER ===================== */

export async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);

    console.log("✅ MongoDB connected");

    /* ===================== ROUTES ===================== */

    app.use("/api", routes);

    /* ===================== ERROR HANDLER (🔥 MUST BE LAST) ===================== */

    app.use(errorHandler);

    const httpServer = http.createServer(app);

    /* ===================== SOCKET.IO ===================== */

    io = new Server(httpServer, {
      cors: {
        origin: allowedOrigins,
        credentials: true,
      },
    });

    initSockets(io);

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server + Socket.IO running on port ${PORT}`);

      startJobLoop();
      console.log("⏱ Background jobs scheduled");
    });

    process.on("SIGINT", async () => {
      console.log("🛑 Shutting down server...");
      await stopJobLoop();
      await mongoose.connection.close();
      httpServer.close(() => {
        process.exit(0);
      });
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  void startServer();
}
