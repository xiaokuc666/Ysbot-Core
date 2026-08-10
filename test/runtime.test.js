import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FrameworkRuntime } from "../src/core/runtime.js";

test("runtime persists paused state", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-runtime-"));
  const file = path.join(dir, "runtime.json");
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const runtime = new FrameworkRuntime(file);
  await runtime.init();
  await runtime.setPaused(true);

  const reloaded = new FrameworkRuntime(file);
  await reloaded.init();
  assert.equal(reloaded.paused, true);
});
