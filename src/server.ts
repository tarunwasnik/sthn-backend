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
import { completeBookingsJob } from "./jobs/completeBookings.job"; // ✅ ADD THIS
import { interactionTriggerJob } from "./jobs/interactionTrigger.job";
import { sessionEndingSoonJob } from "./jobs/sessionEndingSoon.job";
import { disputeEscalationJob } from "./jobs/disputeEscalation.job";

mongoose.set("bufferCommands", false);

const app = express();

/* ===================== MIDDLEWARE ===================== */

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());

/* ===================== SOCKET SINGLETON ===================== */

export let io: Server;

/* ===================== SERVER ===================== */

const PORT = process.env.PORT || 5000;

let jobRunning = false;

/* ===================== BACKGROUND JOBS ===================== */

async function runBackgroundJobs() {
  if (jobRunning) return;

  try {
    jobRunning = true;

    console.log("🔄 Running background jobs...");

    await expireBookingsJob();
    await completeBookingsJob(); // ✅ ADD THIS (CRITICAL)
    await interactionTriggerJob();
    await sessionEndingSoonJob();
    await disputeEscalationJob();

    console.log("✅ Background jobs completed");
  } catch (err) {
    console.error("❌ Background job error:", err);
  } finally {
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
    await mongoose.connect(process.env.MONGODB_URI as string);

    console.log("✅ MongoDB connected");

    app.use("/api", routes);

    const httpServer = http.createServer(app);

    io = new Server(httpServer, {
      cors: {
        origin: "http://localhost:5173",
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

startServer();