import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PluginLoader } from "../src/core/plugin-loader.js";
import { PluginRegistry } from "../src/core/plugin-registry.js";

test("plugin loader loads and invokes a plugin", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-plugins-"));
  const pluginDir = path.join(dir, "echo");
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify({
      id: "echo",
      type: "capability",
      name: "Echo",
      version: "1.0.0",
      enabled: true,
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(pluginDir, "index.js"),
    `export default class EchoPlugin {
  async init(ctx) {
    this.marker = ctx.marker;
  }
  async invoke(params) {
    return this.marker + (params?.value || "");
  }
}`,
    "utf8",
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const registry = new PluginRegistry();
  const loader = new PluginLoader({
    registry,
    contextFactory: () => ({ marker: "ok" }),
  });
  await loader.loadPlugin(pluginDir);
  assert.equal(await registry.invoke("echo", { value: "!" }), "ok!");
});

test("plugin loader rejects invalid manifest", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-badplugin-"));
  const pluginDir = path.join(dir, "bad");
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify({ id: "bad", type: "capability" }),
    "utf8",
  );
  await fs.writeFile(
    path.join(pluginDir, "index.js"),
    "export default class BadPlugin {}",
    "utf8",
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const registry = new PluginRegistry();
  const loader = new PluginLoader({
    registry,
    contextFactory: () => ({}),
  });
  await assert.rejects(loader.loadPlugin(pluginDir), /插件清单无效/);
});
