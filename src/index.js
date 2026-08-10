import path from "node:path";
import { loadConfig } from "./config.js";
import { initLogStore, logger, formatError } from "./logger.js";
import { EventBus } from "./core/event-bus.js";
import { TaskStore } from "./core/task-store.js";
import { Scheduler } from "./core/scheduler.js";
import { PluginRegistry } from "./core/plugin-registry.js";
import { PluginManager } from "./core/plugin-manager.js";
import { ApiRouter } from "./core/api-router.js";
import { SecretsStore } from "./core/secrets.js";
import { PluginConfigStore } from "./core/plugin-config.js";
import { CuriosityBus } from "./core/curiosity.js";
import { FrameworkRuntime } from "./core/runtime.js";
import { ProtocolBridge } from "./core/protocol-bridge.js";
import { ManagementServer } from "./server.js";

const config = loadConfig();
await initLogStore();

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
const protocolBridge = new ProtocolBridge();
const scheduler = new Scheduler({
  taskStore,
  tickMs: config.curiosityIntervalMs,
  isPaused: () => runtime.paused,
});

const plugins = new PluginRegistry();
const secrets = new SecretsStore(config.secretsDir);
const pluginConfig = new PluginConfigStore({
  dataDir: config.pluginDataDir,
  secrets,
});
const pluginManager = new PluginManager({
  registry: plugins,
  pluginDir: config.pluginDir,
  cacheDir: config.pluginCacheDir,
  dataDir: config.pluginDataDir,
  contextFactory: (manifest) => ({
    config,
    eventBus,
    taskStore,
    registry: plugins,
    secrets,
    pluginConfig,
    logger,
    manifest,
    runtime,
    scheduler,
    api: apiRouter,
    pluginManager,
    protocol: protocolBridge,
  }),
});
const skipPlugins = process.env.YSBOT_NO_PLUGINS === "1";
const launchPluginIds = skipPlugins
  ? []
  : process.env.YSBOT_PLUGINS
    ? process.env.YSBOT_PLUGINS.split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : null;
await pluginManager.loadAll({ ids: launchPluginIds });

const curiosity = new CuriosityBus({
  eventBus,
  stateFile: path.join(config.dataDir, "state", "curiosity.json"),
});
await curiosity.init();
const server = new ManagementServer({
  config,
  apiRouter,
});

eventBus.on("message", async (event) => {
  runtime.bump("messages");
  if (event.message_type !== "group") return;
  await curiosity.submit({
    type: "group_message",
    groupId: String(event.group_id),
    cooldownMs: config.curiosityIntervalMs,
    shouldAct: false,
  });
});

curiosity.onDecision(async (decision) => {
  runtime.bump("decisions");
  logger.info(
    `[Curiosity] decided group=${decision.motivation.groupId || "global"} type=${decision.motivation.type}`,
  );
});

scheduler.start(async (task) => {
  runtime.bump("tasksDone");
  logger.info(`[Task] executing ${task.type} capability=${task.capability || "none"}`);
  if (!task.capability) return;
  await plugins.invoke(task.capability, task.params || {}, { task });
});

await server.start();
if (protocolBridge.adapter) {
  protocolBridge.onMessage((event) =>
    eventBus.emitAsync("message", event).catch((error) => {
      logger.error(`[Core] message handler failed: ${formatError(error)}`);
    }),
  );
  await protocolBridge.adapter.connect();
} else {
  logger.warn("[YSbot] 未加载协议插件，消息链路未连接");
}

logger.info(
  `[YSbot] started, onebot=${config.onebotWsUrl}`,
);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  scheduler.stop();
  await server.stop().catch((error) => {
    logger.warn(`[Core] server stop failed: ${formatError(error)}`);
  });
  await protocolBridge.dispose().catch(() => {});
  logger.warn("[YSbot] stopped");
  process.exit(signal === "uncaughtException" ? 1 : 0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("uncaughtException", (error) => {
  logger.error(`[YSbot] uncaught exception: ${formatError(error)}`);
  shutdown("uncaughtException");
});
process.once("unhandledRejection", (reason) => {
  logger.error(`[YSbot] unhandled rejection: ${formatError(reason)}`);
});
