//backend/src/app.ts


import express from "express";
import dotenv from "dotenv";
import routes from "./routes";
import { notFound } from "./middlewares/notFound";
import { errorHandler } from "./middlewares/errorHandler";

dotenv.config();

const app = express();

app.use(express.json());

// Routes
app.use("/api", routes);

// Global handlers
app.use(notFound);
app.use(errorHandler);

export default app;