import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PluginConfigStore } from "../src/core/plugin-config.js";
import { SecretsStore } from "../src/core/secrets.js";

test("plugin config store merges defaults, validates and stores secrets", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-config-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const secrets = new SecretsStore(path.join(root, "secrets"));
  const store = new PluginConfigStore({
    dataDir: path.join(root, "plugins"),
    secrets,
  });
  const schema = {
    type: "object",
    properties: {
      enabled: { type: "boolean", default: true },
      maxEntries: { type: "integer", default: 10 },
    },
  };
  const config = await store.set("demo", { enabled: false }, schema);
  assert.deepEqual(config, { enabled: false, maxEntries: 10 });
  assert.deepEqual(await store.get("demo", schema), {
    enabled: false,
    maxEntries: 10,
  });
  await store.setSecret("demo", "apiKey", "secret");
  assert.equal(await store.getSecret("demo", "apiKey"), "secret");
  assert.equal(await store.hasSecret("demo", "apiKey"), true);
  await store.clearSecret("demo", "apiKey");
  assert.equal(await store.hasSecret("demo", "apiKey"), false);
  await assert.rejects(
    store.set("demo", { maxEntries: "bad" }, schema),
    /must be an integer/,
  );
});
test("plugin config store rejects corrupted json", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-badconfig-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const secrets = new SecretsStore(path.join(root, "secrets"));
  const store = new PluginConfigStore({
    dataDir: path.join(root, "plugins"),
    secrets,
  });
  const pluginDir = path.join(root, "plugins", "demo");
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(path.join(pluginDir, "config.json"), "{broken", "utf8");

  await assert.rejects(
    store.get("demo", {}),
    (error) => error.code === "CONFIG_CORRUPTED" && /Config file corrupted/.test(error.message),
  );
});
