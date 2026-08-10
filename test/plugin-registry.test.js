import test from "node:test";
import assert from "node:assert/strict";
import { PluginRegistry } from "../src/core/plugin-registry.js";

test("plugin registry registers and invokes plugins", async () => {
  const registry = new PluginRegistry();
  registry.register({
    id: "echo",
    type: "capability",
    async invoke() {
      return "echo";
    },
  });
  assert.equal(await registry.invoke("echo", {}), "echo");
  assert.equal(registry.list().length, 1);
});

test("disabled plugin cannot be invoked", async () => {
  const registry = new PluginRegistry();
  registry.register({
    id: "blocked",
    type: "capability",
    async invoke() {
      return "no";
    },
  });
  registry.setEnabled("blocked", false);
  await assert.rejects(registry.invoke("blocked", {}), /插件已禁用/);
});

test("failed plugin cannot be invoked", async () => {
  const registry = new PluginRegistry();
  registry.register({
    id: "broken",
    type: "capability",
    async invoke() {
      return "no";
    },
  });
  registry.setStatus("broken", "failed");
  await assert.rejects(registry.invoke("broken", {}), /插件状态不可用/);
});
