import http from "node:http";
import express from "express";
import adminFinancialRoutes from "../../../../routes/v1/admin.financial.routes";
import { notFound } from "../../../../middlewares/notFound";
import { errorHandler } from "../../../../middlewares/errorHandler";

export const startTestHttpServer = async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin/financial", adminFinancialRoutes);
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test HTTP server did not bind.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
};
