#!/usr/bin/env node
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, rootDir } from "./src/config.js";
import { logger } from "./src/logger.js";
import { EventBus } from "./src/core/event-bus.js";
import { ApiRouter } from "./src/core/api-router.js";
import { TaskStore } from "./src/core/task-store.js";
import { Scheduler } from "./src/core/scheduler.js";
import { PluginRegistry } from "./src/core/plugin-registry.js";
import { PluginManager } from "./src/core/plugin-manager.js";
import { SecretsStore } from "./src/core/secrets.js";
import { PluginConfigStore } from "./src/core/plugin-config.js";
import { PermissionService } from "./src/core/permission-service.js";
import { FrameworkRuntime } from "./src/core/runtime.js";
import { ProtocolBridge } from "./src/core/protocol-bridge.js";

const config = loadConfig();
const eventBus = new EventBus();
const runtime = new FrameworkRuntime(
  path.join(config.dataDir, "state", "framework-runtime.json"),
);
await runtime.init();
const taskStore = new TaskStore(
  path.join(config.dataDir, "state", "tasks.json"),
);
await taskStore.init();
const apiRouter = new ApiRouter();
const scheduler = new Scheduler({
  taskStore,
  tickMs: config.curiosityIntervalMs,
  isPaused: () => runtime.paused,
});
const secrets = new SecretsStore(config.secretsDir);
const pluginConfig = new PluginConfigStore({
  dataDir: config.pluginDataDir,
  secrets,
});
const registry = new PluginRegistry();
const permissions = new PermissionService({
  registry,
  filePath: path.join(config.dataDir, "state", "permissions.json"),
  logger,
});
await permissions.init();
registry.setPermissionService(permissions);
const protocolBridge = new ProtocolBridge();
const pluginManager = new PluginManager({
  registry,
  pluginDir: config.pluginDir,
  cacheDir: config.pluginCacheDir,
  dataDir: config.pluginDataDir,
  permissions,
  contextFactory: (manifest) => ({
    config,
    eventBus,
    taskStore,
    registry,
    secrets,
    pluginConfig,
    permissions,
    logger,
    manifest,
    runtime,
    scheduler,
    api: apiRouter,
    pluginManager,
    protocol: protocolBridge,
  }),
});
await pluginManager.loadAll();

console.log("=== YSbot Launcher ===");
console.log(`Node ${process.version} | ${process.platform}-${process.arch}`);
console.log(`CPU ${os.cpus().length} cores | Memory ${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`);
console.log(`OneBot ${config.onebotWsUrl}`);
console.log(`Admin http://${config.managementHost}:${config.managementPort}`);

console.log("\n插件列表:");
for (const plugin of registry.list()) {
  const role = plugin.role ? ` | ${plugin.role}` : "";
  console.log(
    `- ${plugin.id} [${plugin.type}] ${plugin.name} v${plugin.version} source=${plugin.source}${role}`,
  );
}

console.log("\n插件环境探测:");
for (const plugin of registry.list()) {
  const wrapper = registry.get(plugin.id);
  if (typeof wrapper?.instance?.probe === "function") {
    try {
      const result = await wrapper.instance.probe();
      console.log(`- ${plugin.id}: ${result.ok ? "OK" : "FAIL"} ${result.message || ""}`);
    } catch (error) {
      console.log(`- ${plugin.id}: ERROR ${error.message}`);
    }
  }
}

const adminPlugins = registry.list().filter(
  (plugin) => plugin.role === "admin" || plugin.type === "system",
);
console.log(
  `\n后台管理插件: ${adminPlugins.map((plugin) => plugin.id).join(", ") || "无"}`,
);

if (process.argv.includes("--list")) {
  process.exit(0);
}

const plugins = registry.list();
const rl = readline.createInterface({ input, output });
console.log("\n选择启动方式:");
console.log("0) all 全部插件");
console.log("1) core 仅核心");
plugins.forEach((plugin, index) => {
  console.log(`${index + 2}) ${plugin.id}`);
});
const answer = (await rl.question("> ")).trim();
rl.close();

const env = { ...process.env };
if (answer === "1") {
  env.YSBOT_NO_PLUGINS = "1";
} else if (answer !== "0" && answer !== "all") {
  const selected = plugins[Number(answer) - 2] || plugins.find((p) => p.id === answer);
  if (selected) {
    env.YSBOT_PLUGINS = selected.id;
  }
}

console.log("\n启动 YSbot ...");
const child = spawn(process.execPath, ["src/index.js"], {
  cwd: rootDir,
  env,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
