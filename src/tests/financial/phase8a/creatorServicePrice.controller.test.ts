import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import { Types } from "mongoose";

import { createCreatorService, updateCreatorService } from "../../../controllers/creatorService.controller";
import { errorHandler } from "../../../middlewares/errorHandler";
import { notFound } from "../../../middlewares/notFound";
import { CreatorProfile } from "../../../models/creatorProfile.model";
import { CreatorService } from "../../../models/creatorService.model";

let creatorSequence = 0;

const startCreatorServiceServer = async (creatorId: Types.ObjectId) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: creatorId.toString(), role: "creator" } as never;
    next();
  });
  app.post("/services", createCreatorService);
  app.patch("/services/:serviceId", updateCreatorService);
  app.use(notFound);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
};

const serviceRequest = (price: unknown) => ({
  title: "Creator price semantics service",
  description: "Persists an exact creator-facing major-unit price.",
  durationMinutes: 30,
  price,
});

export const registerCreatorServicePriceControllerTests = () => {
  test("creator service create and update preserve valid USD major-unit prices", async () => {
    creatorSequence += 1;
    const creatorId = new Types.ObjectId();
    await CreatorProfile.create({
      userId: creatorId,
      slug: `creator-price-${creatorSequence}`,
      displayName: "Creator Price Test",
      primaryCategory: "testing",
      country: "US",
      city: "Test City",
      currency: "USD",
      status: "active",
    });
    const server = await startCreatorServiceServer(creatorId);
    try {
      const created1000 = await fetch(`${server.baseUrl}/services`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(serviceRequest(1000)),
      });
      const firstBody = await created1000.json() as { service: { _id: string; price: number } };
      assert.equal(created1000.status, 201);
      assert.equal(firstBody.service.price, 1000);
      assert.equal((await CreatorService.findById(firstBody.service._id).orFail()).price, 1000);

      const updated = await fetch(`${server.baseUrl}/services/${firstBody.service._id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ price: 1100.99 }),
      });
      const updatedBody = await updated.json() as { service: { price: number } };
      assert.equal(updated.status, 200);
      assert.equal(updatedBody.service.price, 1100.99);
      assert.equal((await CreatorService.findById(firstBody.service._id).orFail()).price, 1100.99);

      const invalidUpdate = await fetch(`${server.baseUrl}/services/${firstBody.service._id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ price: 12.345 }),
      });
      assert.equal(invalidUpdate.status, 400);
      assert.equal((await CreatorService.findById(firstBody.service._id).orFail()).price, 1100.99);

      const created1234 = await fetch(`${server.baseUrl}/services`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(serviceRequest(12.34)),
      });
      const lastBody = await created1234.json() as { service: { price: number } };
      assert.equal(created1234.status, 201);
      assert.equal(lastBody.service.price, 12.34);
    } finally { await server.close(); }
  });

  test("creator service create rejects invalid USD money without rounding intent", async () => {
    creatorSequence += 1;
    const creatorId = new Types.ObjectId();
    await CreatorProfile.create({
      userId: creatorId, slug: `creator-price-invalid-${creatorSequence}`,
      displayName: "Creator Price Invalid Test", primaryCategory: "testing",
      country: "US", city: "Test City", currency: "USD", status: "active",
    });
    const server = await startCreatorServiceServer(creatorId);
    try {
      for (const price of [0, -1, 12.345, 1100.999, "12.34", null]) {
        const response = await fetch(`${server.baseUrl}/services`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(serviceRequest(price)),
        });
        assert.equal(response.status, 400);
      }
    } finally { await server.close(); }
  });
};
