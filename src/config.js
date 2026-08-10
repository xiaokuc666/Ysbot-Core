import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(currentDir, "..");

export function loadEnvFile(filePath = path.join(rootDir, ".env")) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function readNumber(
  env,
  key,
  fallback,
  { min = 0, max = Infinity, integer = false } = {},
) {
  const raw = env[key] ?? "";
  const value = raw === "" ? fallback : Number(raw);
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `${key} 必须是 ${min}~${max} 之间的${integer ? "整数" : "数字"}`,
    );
  }
  return value;
}

export function parseConfig(env = process.env) {
  const config = {
    onebotWsUrl: String(env.ONEBOT_WS_URL || "ws://127.0.0.1:3001").trim(),
    reconnectBaseMs: readNumber(env, "RECONNECT_BASE_MS", 1000, {
      min: 100,
      max: 60000,
      integer: true,
    }),
    reconnectMaxMs: readNumber(env, "RECONNECT_MAX_MS", 30000, {
      min: 1000,
      max: 300000,
      integer: true,
    }),
    sendTimeoutMs: readNumber(env, "SEND_TIMEOUT_MS", 10000, {
      min: 1000,
      max: 60000,
      integer: true,
    }),
    shutdownTimeoutMs: readNumber(env, "SHUTDOWN_TIMEOUT_MS", 5000, {
      min: 0,
      max: 30000,
      integer: true,
    }),
    managementHost: String(env.MANAGEMENT_HOST || "127.0.0.1").trim(),
    managementPort: readNumber(env, "MANAGEMENT_PORT", 5178, {
      min: 1,
      max: 65535,
      integer: true,
    }),
    managementUser: String(env.MANAGEMENT_USER || "admin").trim(),
    managementPassword: String(
      env.MANAGEMENT_PASSWORD || "12345678",
    ).trim(),
    curiosityIntervalMs: readNumber(env, "CURIOSITY_INTERVAL_MS", 45000, {
      min: 5000,
      max: 3600000,
      integer: true,
    }),
    pluginDir: path.resolve(rootDir, env.YSBOT_PLUGIN_DIR || "plugins"),
    pluginCacheDir: path.resolve(
      rootDir,
      env.YSBOT_PLUGIN_CACHE_DIR || "plugins/.cache",
    ),
    dataDir: path.resolve(rootDir, env.YSBOT_DATA_DIR || "data"),
    secretsDir: path.resolve(
      rootDir,
      env.YSBOT_SECRETS_DIR || "data/secrets",
    ),
    pluginDataDir: path.resolve(
      rootDir,
      env.YSBOT_PLUGIN_DATA_DIR || "data/plugins",
    ),
  };

  const errors = [];
  if (!/^wss?:\/\//i.test(config.onebotWsUrl)) {
    errors.push("ONEBOT_WS_URL 必须以 ws:// 或 wss:// 开头");
  }
  if (!config.managementUser || !config.managementPassword) {
    errors.push("MANAGEMENT_USER 和 MANAGEMENT_PASSWORD 不能为空");
  }
  if (errors.length > 0) {
    throw new Error(`配置错误:\n- ${errors.join("\n- ")}`);
  }
  return config;
}

export function loadConfig() {
  loadEnvFile();
  return parseConfig(process.env);
}
