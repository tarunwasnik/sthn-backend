import assert from "node:assert/strict";
import { test, mock } from "node:test";
import type { Request, Response } from "express";
import { visitorMonitorConfig } from "../../config/visitorMonitor";
import { collectVisitorTelemetry, listVisitorSessions, monitorOverview, visitorSessionDetail } from "../../controllers/visitorMonitor.controller";
import { VisitorMonitorEvent, VisitorMonitorSession } from "../../models/visitorMonitor.model";
import { recordVisitorTelemetry } from "../../services/visitorMonitor.service";

test("absent and invalid server flags prevent all collection writes", async () => {
  const prior = process.env.STHN_VISITOR_MONITOR_ENABLED;
  const update = mock.method(VisitorMonitorSession, "updateOne", () => { throw new Error("unexpected session write"); });
  const create = mock.method(VisitorMonitorEvent, "create", () => { throw new Error("unexpected event write"); });
  try {
    for (const flag of [undefined, "", "false", "1", "invalid"]) {
      if (flag === undefined) delete process.env.STHN_VISITOR_MONITOR_ENABLED;
      else process.env.STHN_VISITOR_MONITOR_ENABLED = flag;
      assert.equal(visitorMonitorConfig().enabled, false);
      const req = { body: { visitorId: "valid_fixture_visitor_id", type: "VISIT" }, headers: {} } as Request;
      await recordVisitorTelemetry(req, req.body);
      let status = 0; let response: unknown;
      const res = { status(code: number) { status = code; return this; }, json(body: unknown) { response = body; return this; } } as unknown as Response;
      await collectVisitorTelemetry(req, res);
      assert.equal(status, 202);
      assert.deepEqual(response, { accepted: false });
    }
    assert.equal(update.mock.callCount(), 0);
    assert.equal(create.mock.callCount(), 0);
  } finally {
    if (prior === undefined) delete process.env.STHN_VISITOR_MONITOR_ENABLED;
    else process.env.STHN_VISITOR_MONITOR_ENABLED = prior;
    update.mock.restore(); create.mock.restore();
  }
});

test("monitor read endpoints require both backend gates before querying", async () => {
  const enabled = process.env.STHN_VISITOR_MONITOR_ENABLED;
  const adminRead = process.env.STHN_VISITOR_MONITOR_ADMIN_READ_ENABLED;
  const find = mock.method(VisitorMonitorSession, "find", () => { throw new Error("unexpected session query"); });
  const findOne = mock.method(VisitorMonitorSession, "findOne", () => { throw new Error("unexpected detail query"); });
  const count = mock.method(VisitorMonitorSession, "countDocuments", () => { throw new Error("unexpected count query"); });
  try {
    for (const [collection, reads] of [[undefined, undefined], ["true", undefined], [undefined, "true"], ["invalid", "true"]]) {
      if (collection === undefined) delete process.env.STHN_VISITOR_MONITOR_ENABLED;
      else process.env.STHN_VISITOR_MONITOR_ENABLED = collection;
      if (reads === undefined) delete process.env.STHN_VISITOR_MONITOR_ADMIN_READ_ENABLED;
      else process.env.STHN_VISITOR_MONITOR_ADMIN_READ_ENABLED = reads;
      for (const handler of [monitorOverview, listVisitorSessions, visitorSessionDetail]) {
        let status = 0; let response: unknown;
        const res = { status(code: number) { status = code; return this; }, json(body: unknown) { response = body; return this; } } as unknown as Response;
        await handler({ query: {}, params: { visitorId: "fixture" } } as unknown as Request, res);
        assert.equal(status, 404);
        assert.deepEqual(response, { message: "Visitor Monitor is disabled" });
      }
    }
    assert.equal(find.mock.callCount(), 0);
    assert.equal(findOne.mock.callCount(), 0);
    assert.equal(count.mock.callCount(), 0);
  } finally {
    if (enabled === undefined) delete process.env.STHN_VISITOR_MONITOR_ENABLED; else process.env.STHN_VISITOR_MONITOR_ENABLED = enabled;
    if (adminRead === undefined) delete process.env.STHN_VISITOR_MONITOR_ADMIN_READ_ENABLED; else process.env.STHN_VISITOR_MONITOR_ADMIN_READ_ENABLED = adminRead;
    find.mock.restore(); findOne.mock.restore(); count.mock.restore();
  }
});
