import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createServer, Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

import routes from "../../routes/v1";
import User from "../../models/User";
import { ROLES, type Role } from "../../constants/roles";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "admin-dashboard-read-authorization-test";

let server: Server;
let baseUrl: string;

before(async () => {
  await connectPhase7HDatabase();
  const app = express();
  app.use(express.json());
  app.use("/api/v1", routes);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
}, { timeout: 120_000 });

beforeEach(clearPhase7HDatabase);
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await disconnectPhase7HDatabase();
});

type DashboardReadRole = typeof ROLES.USER | typeof ROLES.ADMIN;

async function createUser(role: DashboardReadRole) {
  return User.create({
    email: `${new Types.ObjectId()}@test.local`, role, status: "active", governanceState: "ACTIVE",
  });
}

function bearer(user: { _id: Types.ObjectId; role: Role }) {
  return { authorization: `Bearer ${jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET!)}` };
}

test("Admin dashboard reads require authentication and the Admin role", async () => {
  const user = await createUser("user");
  const unauthenticated = await fetch(`${baseUrl}/admin/dashboard/overview`);
  assert.equal(unauthenticated.status, 401);

  const forbidden = await fetch(`${baseUrl}/admin/dashboard/overview`, { headers: bearer(user) });
  assert.equal(forbidden.status, 403);
});

test("Admin dashboard overview, list, and risk reads use registered protected routes", async () => {
  const admin = await createUser("admin");
  for (const path of [
    "/admin/dashboard/overview",
    "/admin/dashboard/users?page=1&limit=20",
    "/admin/dashboard/creators?page=1&limit=20",
    "/admin/dashboard/bookings?page=1&limit=20",
    "/admin/dashboard/creators/risk-summary",
    "/admin/dashboard/creators/high-risk",
  ]) {
    const response = await fetch(`${baseUrl}${path}`, { headers: bearer(admin) });
    assert.equal(response.status, 200, path);
  }
});
