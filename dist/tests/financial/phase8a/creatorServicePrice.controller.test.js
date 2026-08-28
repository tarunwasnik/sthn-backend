"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCreatorServicePriceControllerTests = void 0;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_http_1 = __importDefault(require("node:http"));
const node_test_1 = require("node:test");
const express_1 = __importDefault(require("express"));
const mongoose_1 = require("mongoose");
const creatorService_controller_1 = require("../../../controllers/creatorService.controller");
const errorHandler_1 = require("../../../middlewares/errorHandler");
const notFound_1 = require("../../../middlewares/notFound");
const creatorProfile_model_1 = require("../../../models/creatorProfile.model");
const creatorService_model_1 = require("../../../models/creatorService.model");
let creatorSequence = 0;
const startCreatorServiceServer = async (creatorId) => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use((req, _res, next) => {
        req.user = { id: creatorId.toString(), role: "creator" };
        next();
    });
    app.post("/services", creatorService_controller_1.createCreatorService);
    app.patch("/services/:serviceId", creatorService_controller_1.updateCreatorService);
    app.use(notFound_1.notFound);
    app.use(errorHandler_1.errorHandler);
    const server = node_http_1.default.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("Test server did not bind.");
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    };
};
const serviceRequest = (price) => ({
    title: "Creator price semantics service",
    description: "Persists an exact creator-facing major-unit price.",
    durationMinutes: 30,
    price,
});
const registerCreatorServicePriceControllerTests = () => {
    (0, node_test_1.test)("creator service create and update preserve valid USD major-unit prices", async () => {
        creatorSequence += 1;
        const creatorId = new mongoose_1.Types.ObjectId();
        await creatorProfile_model_1.CreatorProfile.create({
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
            const firstBody = await created1000.json();
            strict_1.default.equal(created1000.status, 201);
            strict_1.default.equal(firstBody.service.price, 1000);
            strict_1.default.equal((await creatorService_model_1.CreatorService.findById(firstBody.service._id).orFail()).price, 1000);
            const updated = await fetch(`${server.baseUrl}/services/${firstBody.service._id}`, {
                method: "PATCH", headers: { "content-type": "application/json" },
                body: JSON.stringify({ price: 1100.99 }),
            });
            const updatedBody = await updated.json();
            strict_1.default.equal(updated.status, 200);
            strict_1.default.equal(updatedBody.service.price, 1100.99);
            strict_1.default.equal((await creatorService_model_1.CreatorService.findById(firstBody.service._id).orFail()).price, 1100.99);
            const invalidUpdate = await fetch(`${server.baseUrl}/services/${firstBody.service._id}`, {
                method: "PATCH", headers: { "content-type": "application/json" },
                body: JSON.stringify({ price: 12.345 }),
            });
            strict_1.default.equal(invalidUpdate.status, 400);
            strict_1.default.equal((await creatorService_model_1.CreatorService.findById(firstBody.service._id).orFail()).price, 1100.99);
            const created1234 = await fetch(`${server.baseUrl}/services`, {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify(serviceRequest(12.34)),
            });
            const lastBody = await created1234.json();
            strict_1.default.equal(created1234.status, 201);
            strict_1.default.equal(lastBody.service.price, 12.34);
        }
        finally {
            await server.close();
        }
    });
    (0, node_test_1.test)("creator service create rejects invalid USD money without rounding intent", async () => {
        creatorSequence += 1;
        const creatorId = new mongoose_1.Types.ObjectId();
        await creatorProfile_model_1.CreatorProfile.create({
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
                strict_1.default.equal(response.status, 400);
            }
        }
        finally {
            await server.close();
        }
    });
};
exports.registerCreatorServicePriceControllerTests = registerCreatorServicePriceControllerTests;
