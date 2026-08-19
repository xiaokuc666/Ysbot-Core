#!/usr/bin/env node
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, rootDir } from "./src/config.js";
import { PluginRegistry } from "./src/core/plugin-registry.js";
import { PluginManager } from "./src/core/plugin-manager.js";

const config = loadConfig();
const registry = new PluginRegistry();
const pluginManager = new PluginManager({
  registry,
  pluginDir: config.pluginDir,
  cacheDir: config.pluginCacheDir,
  dataDir: config.pluginDataDir,
  contextFactory: () => ({}),
});
const plugins = await pluginManager.listMetadata();

console.log("=== YSbot Launcher ===");
console.log(`Node ${process.version} | ${process.platform}-${process.arch}`);
console.log(`CPU ${os.cpus().length} cores | Memory ${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`);
console.log(`OneBot ${config.onebotWsUrl}`);
console.log(`Admin http://${config.managementHost}:${config.managementPort}`);

console.log("\n插件列表:");
for (const plugin of plugins) {
  const role = plugin.role ? ` | ${plugin.role}` : "";
  console.log(
    `- ${plugin.id} [${plugin.type}] ${plugin.name} v${plugin.version} source=${plugin.source}${role}`,
  );
}

const adminPlugins = plugins.filter(
  (plugin) => plugin.role === "admin" || plugin.type === "system",
);
console.log(
  `\n后台管理插件: ${adminPlugins.map((plugin) => plugin.id).join(", ") || "无"}`,
);

if (process.argv.includes("--list")) {
  process.exit(0);
}

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
