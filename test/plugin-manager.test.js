import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PluginManager } from "../src/core/plugin-manager.js";
import { PluginRegistry } from "../src/core/plugin-registry.js";

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const localEntry = Buffer.concat([local, nameBuf, data]);
    localParts.push(localEntry);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, nameBuf]));
    offset += localEntry.length;
  }
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, eocd]);
}

test("plugin manager loads plg, clears data and reloads", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-pm-"));
  const pluginDir = path.join(root, "plugins");
  const cacheDir = path.join(pluginDir, ".cache");
  const dataDir = path.join(root, "data", "plugins");
  await fs.mkdir(pluginDir, { recursive: true });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const plg = createZip([
    [
      "plugin.json",
      JSON.stringify({
        id: "demo-plg",
        type: "capability",
        name: "Demo Plg",
        version: "1.0.0",
        enabled: true,
      }),
    ],
    [
      "index.js",
      `export default class DemoPlg {
  async init(ctx) {
    this.marker = ctx.marker;
  }
  async invoke() {
    return this.marker + "-plg";
  }
}`,
    ],
  ]);
  await fs.writeFile(path.join(pluginDir, "demo.plg"), plg);

  const registry = new PluginRegistry();
  const manager = new PluginManager({
    registry,
    pluginDir,
    cacheDir,
    dataDir,
    contextFactory: () => ({ marker: "ok" }),
  });
  await manager.loadAll();
  assert.equal(registry.list()[0].source, "plg");
  assert.equal(await registry.invoke("demo-plg", {}), "ok-plg");
  await manager.clearPluginData("demo-plg");
  await manager.reloadPlugin("demo-plg");
  assert.equal(await registry.invoke("demo-plg", {}), "ok-plg");
});

test("plugin manager can load only selected plugin ids", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-pm-filter-"));
  const pluginDir = path.join(root, "plugins");
  const cacheDir = path.join(pluginDir, ".cache");
  const dataDir = path.join(root, "data", "plugins");
  await fs.mkdir(pluginDir, { recursive: true });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  for (const id of ["alpha", "beta"]) {
    const dir = path.join(pluginDir, id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "plugin.json"),
      JSON.stringify({
        id,
        type: "capability",
        name: id,
        version: "1.0.0",
        enabled: true,
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(dir, "index.js"),
      `export default class ${id[0].toUpperCase() + id.slice(1)}Plugin {
  async invoke() {
    return "${id}";
  }
}`,
      "utf8",
    );
  }

  const registry = new PluginRegistry();
  const manager = new PluginManager({
    registry,
    pluginDir,
    cacheDir,
    dataDir,
    contextFactory: () => ({}),
  });
  await manager.loadAll({ ids: ["alpha"] });
  assert.deepEqual(
    registry.list().map((plugin) => plugin.id),
    ["alpha"],
  );
});

test("plugin manager validates plugin dependencies", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-pm-dep-"));
  const pluginDir = path.join(root, "plugins");
  const cacheDir = path.join(pluginDir, ".cache");
  const dataDir = path.join(root, "data", "plugins");
  await fs.mkdir(pluginDir, { recursive: true });
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  for (const item of [
    { id: "base", deps: [] },
    { id: "app", deps: ["base"] },
    { id: "orphan", deps: ["missing"] },
  ]) {
    const dir = path.join(pluginDir, item.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "plugin.json"),
      JSON.stringify({
        id: item.id,
        type: "capability",
        name: item.id,
        version: "1.0.0",
        enabled: true,
        dependencies: item.deps,
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(dir, "index.js"),
      `export default class ${item.id[0].toUpperCase() + item.id.slice(1)}Plugin {
  async invoke() {
    return "${item.id}";
  }
}`,
      "utf8",
    );
  }

  const registry = new PluginRegistry();
  const manager = new PluginManager({
    registry,
    pluginDir,
    cacheDir,
    dataDir,
    contextFactory: () => ({}),
  });
  await manager.loadAll();
  const ids = registry.list().map((plugin) => plugin.id).sort();
  assert.deepEqual(ids, ["app", "base"]);
});
