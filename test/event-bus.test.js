import test from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../src/core/event-bus.js";

test("event bus emits and unsubscribes", () => {
  const bus = new EventBus();
  const seen = [];
  const off = bus.on("message", (payload) => seen.push(payload));
  bus.emit("message", { id: 1 });
  off();
  bus.emit("message", { id: 2 });
  assert.deepEqual(seen, [{ id: 1 }]);
});

test("event bus awaits async handlers", async () => {
  const bus = new EventBus();
  let done = false;
  bus.on("task", async () => {
    await Promise.resolve();
    done = true;
  });
  await bus.emitAsync("task", {});
  assert.equal(done, true);
});
