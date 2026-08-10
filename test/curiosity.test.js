import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventBus } from "../src/core/event-bus.js";
import { CuriosityBus } from "../src/core/curiosity.js";

test("curiosity bus respects cooldown", async () => {
  const eventBus = new EventBus();
  const bus = new CuriosityBus({ eventBus });
  const decisions = [];
  bus.onDecision(async (decision) => decisions.push(decision));
  await bus.submit({
    type: "search",
    groupId: "1",
    cooldownMs: 60000,
  });
  const second = await bus.submit({
    type: "search",
    groupId: "1",
    cooldownMs: 60000,
  });
  assert.equal(second, null);
  assert.equal(decisions.length, 1);
});

test("curiosity cooldown persists across restarts", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-curiosity-"));
  const file = path.join(dir, "curiosity.json");
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const bus = new CuriosityBus({ eventBus: new EventBus(), stateFile: file });
  await bus.init();
  await bus.submit({
    type: "search",
    groupId: "1",
    cooldownMs: 60000,
  });
  const reloaded = new CuriosityBus({
    eventBus: new EventBus(),
    stateFile: file,
  });
  await reloaded.init();
  const result = await reloaded.submit({
    type: "search",
    groupId: "1",
    cooldownMs: 60000,
  });
  assert.equal(result, null);
});
