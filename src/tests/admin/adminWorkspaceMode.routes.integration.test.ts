import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createServer, Server } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";

import routes from "../../routes";
import User from "../../models/User";
import { ROLES, type Role } from "../../constants/roles";
import { clearPhase7HDatabase, connectPhase7HDatabase, disconnectPhase7HDatabase } from "../financial/phase7h/helpers/database";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "admin-workspace-mode-test";

let server: Server;
let baseUrl: string;

before(async () => {
  await connectPhase7HDatabase();
  const app = express();
  app.use(express.json());
  app.use("/api", routes);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
}, { timeout: 120_000 });

beforeEach(clearPhase7HDatabase);
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await disconnectPhase7HDatabase();
});

async function actor(role: Role, adminMode?: "OPERATIONS" | "SYSTEM") {
  return User.create({
    email: `${new Types.ObjectId()}@test.local`,
    role,
    status: "active",
    governanceState: "ACTIVE",
    adminMode: adminMode ?? null,
  });
}

function bearer(user: { _id: Types.ObjectId; role: Role }) {
  return { authorization: `Bearer ${jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET!)}` };
}

test("workspace bootstraps require authentication, an Admin role, and the matching persisted mode", async () => {
  const user = await actor(ROLES.USER);
  const noMode = await actor(ROLES.ADMIN);
  const operations = await actor(ROLES.ADMIN, "OPERATIONS");
  const system = await actor(ROLES.ADMIN, "SYSTEM");

  assert.equal((await fetch(`${baseUrl}/admin/operations/bootstrap`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/admin/operations/bootstrap`, { headers: bearer(user) })).status, 403);

  for (const candidate of [noMode, system]) {
    const response = await fetch(`${baseUrl}/admin/operations/bootstrap`, { headers: bearer(candidate) });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).redirectTo, "/admin/entry");
  }
  assert.equal((await fetch(`${baseUrl}/admin/operations/bootstrap`, { headers: bearer(operations) })).status, 200);

  for (const candidate of [noMode, operations]) {
    const response = await fetch(`${baseUrl}/admin/system/bootstrap`, { headers: bearer(candidate) });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).redirectTo, "/admin/entry");
  }
  assert.equal((await fetch(`${baseUrl}/admin/system/bootstrap`, { headers: bearer(system) })).status, 200);
});

test("role-protected V1 Admin reads remain shared and do not use workspace mode as a new permission", async () => {
  const operations = await actor(ROLES.ADMIN, "OPERATIONS");
  const system = await actor(ROLES.ADMIN, "SYSTEM");

  for (const candidate of [operations, system]) {
    const response = await fetch(`${baseUrl}/v1/admin/dashboard/overview`, { headers: bearer(candidate) });
    assert.equal(response.status, 200);
  }
});
