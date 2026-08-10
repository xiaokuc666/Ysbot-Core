import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../src/core/task-store.js";
import { Scheduler } from "../src/core/scheduler.js";

test("scheduler executes due tasks", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-sched-"));
  const store = new TaskStore(path.join(dir, "tasks.json"));
  await store.init();
  await store.add({
    type: "test",
    dueAt: new Date(Date.now() - 1000).toISOString(),
  });
  const scheduler = new Scheduler({ taskStore: store, tickMs: 1000 });
  let executed = 0;
  await scheduler.tick(async () => {
    executed += 1;
  });
  scheduler.stop();
  assert.equal(executed, 1);
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
});

test("scheduler skips due tasks while paused", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-pause-"));
  const store = new TaskStore(path.join(dir, "tasks.json"));
  await store.init();
  await store.add({
    type: "test",
    dueAt: new Date(Date.now() - 1000).toISOString(),
  });
  const scheduler = new Scheduler({
    taskStore: store,
    tickMs: 1000,
    isPaused: () => true,
  });
  let executed = 0;
  await scheduler.tick(async () => {
    executed += 1;
  });
  assert.equal(executed, 0);
  scheduler.stop();
  await fs.rm(dir, { recursive: true, force: true });
});

test("scheduler does not overlap ticks", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-overlap-"));
  const store = new TaskStore(path.join(dir, "tasks.json"));
  await store.init();
  await store.add({
    type: "test",
    dueAt: new Date(Date.now() - 1000).toISOString(),
  });
  const scheduler = new Scheduler({ taskStore: store, tickMs: 1000 });
  let active = 0;
  let maxActive = 0;
  const handler = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 30));
    active -= 1;
  };
  await Promise.all([scheduler.tick(handler), scheduler.tick(handler)]);
  assert.equal(maxActive, 1);
  scheduler.stop();
  await fs.rm(dir, { recursive: true, force: true });
});
