import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PluginLoader } from "../src/core/plugin-loader.js";
import { PluginRegistry } from "../src/core/plugin-registry.js";
import { PermissionService } from "../src/core/permission-service.js";

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

test("plugin loader rejects invalid permission fields", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-badpermsplugin-"));
  const pluginDir = path.join(dir, "bad-perms");
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify({
      id: "bad-perms",
      type: "capability",
      version: "1.0.0",
      permissions: { enabledGroups: "g1" },
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(pluginDir, "index.js"),
    "export default class BadPermsPlugin {}",
    "utf8",
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const registry = new PluginRegistry();
  const loader = new PluginLoader({
    registry,
    contextFactory: () => ({}),
  });
  await assert.rejects(
    loader.loadPlugin(pluginDir),
    /permissions.enabledGroups 必须是数组/,
  );
});

test("plugin loader gates consume events with permissions", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-feedback-"));
  const pluginDir = path.join(dir, "feedback");
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify({
      id: "feedback",
      type: "feedback",
      name: "Feedback",
      version: "1.0.0",
      enabled: true,
      permissions: { adminOnly: true },
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(pluginDir, "index.js"),
    `export default class FeedbackPlugin {
  async consume(event) {
    return event.user_id || "ok";
  }
}`,
    "utf8",
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const registry = new PluginRegistry();
  const permissions = new PermissionService({ registry });
  const loader = new PluginLoader({
    registry,
    permissions,
    contextFactory: () => ({}),
  });
  await loader.loadPlugin(pluginDir);
  const wrapper = registry.get("feedback");

  await assert.rejects(
    wrapper.consume({ user_id: "u1" }),
    /admin_only/,
  );
  assert.equal(
    await wrapper.consume({ user_id: "u1", actor: { id: "u1", admin: true } }),
    "u1",
  );
});
