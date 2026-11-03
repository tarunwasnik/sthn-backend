import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import { chatSocket, emitBookingRequestsChanged, personalRoom } from "../../sockets/chat.socket";

class FakeIo {
  readonly emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  shouldThrow = false;
  use() { return this; }
  on() { return this; }
  to(room: string) {
    return { emit: (event: string, payload: unknown) => {
      if (this.shouldThrow) throw new Error("socket unavailable");
      this.emitted.push({ room, event, payload });
    } };
  }
}

test("creator booking-request refresh is isolated to the creator personal room and has no booking payload", () => {
  const io = new FakeIo();
  chatSocket(io as never);
  const creatorId = new mongoose.Types.ObjectId().toString();
  emitBookingRequestsChanged(creatorId);
  assert.deepEqual(io.emitted, [{ room: personalRoom(creatorId), event: "booking:requests-changed", payload: {} }]);
});

test("creator booking-request refresh ignores invalid identities and socket failures", () => {
  const io = new FakeIo();
  chatSocket(io as never);
  emitBookingRequestsChanged("not-an-object-id");
  assert.equal(io.emitted.length, 0);
  io.shouldThrow = true;
  assert.doesNotThrow(() => emitBookingRequestsChanged(new mongoose.Types.ObjectId().toString()));
});
