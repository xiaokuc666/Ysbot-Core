import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SecretsStore } from "../src/core/secrets.js";

test("secrets store reads and writes secrets", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-secrets-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const store = new SecretsStore(dir);
  await store.save("llm", { apiKey: "abc" });
  assert.equal((await store.load("llm")).apiKey, "abc");
  assert.deepEqual(await store.load("missing"), {});
});
