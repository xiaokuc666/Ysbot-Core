import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../src/core/task-store.js";

test("task store persists and returns due tasks", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-task-"));
  const file = path.join(dir, "tasks.json");
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const store = new TaskStore(file);
  await store.init();
  await store.add({
    type: "test",
    dueAt: new Date(Date.now() - 1000).toISOString(),
  });
  assert.equal(store.due().length, 1);
  await store.setStatus(store.due()[0].id, "done");
  assert.equal(store.due().length, 0);
});

test("task store rejects invalid dueAt", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-task-bad-"));
  const file = path.join(dir, "tasks.json");
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const store = new TaskStore(file);
  await store.init();
  await assert.rejects(
    store.add({ type: "bad", dueAt: "not-a-date" }),
    /dueAt/,
  );
});
