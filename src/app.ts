//backend/src/app.ts


import express from "express";
import dotenv from "dotenv";
import routes from "./routes";
import { notFound } from "./middlewares/notFound";
import { errorHandler } from "./middlewares/errorHandler";

dotenv.config();

const app = express();
// Default to not trusting forwarding headers. Set TRUSTED_PROXY_HOPS=1 only when
// the backend is consistently reached through one trusted proxy (such as Caddy).
const trustedProxyHops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS || "0", 10);
app.set("trust proxy", Number.isInteger(trustedProxyHops) && trustedProxyHops >= 0 ? trustedProxyHops : 0);

app.use(express.json({ limit: "16kb" }));

// Routes
app.use("/api", routes);

// Global handlers
app.use(notFound);
app.use(errorHandler);

export default app;
