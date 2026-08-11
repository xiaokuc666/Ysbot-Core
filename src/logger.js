import fs from "node:fs/promises";
import path from "node:path";
import { rootDir } from "./config.js";
import { normalizeLogEntry, redactSensitive, redactText } from "./core/logging.js";

const LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MAX_BUFFER = 1000;
const MAX_LOG_BYTES = 10 * 1024 * 1024;
const MAX_BACKUP_FILES = 3;
const logFilePath = path.join(rootDir, "data", "logs", "aibot.jsonl");
let buffer = [];
let filePromise = null;
let writeChain = Promise.resolve();

function currentLevel() {
  const raw = String(process.env.LOG_LEVEL || "info").toLowerCase();
  return LEVEL_ORDER[raw] ?? LEVEL_ORDER.info;
}

function formatValue(value) {
  if (value instanceof Error) return redactText(formatError(value));
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(redactSensitive(value));
    } catch {
      return redactText(String(value));
    }
  }
  return redactText(String(value));
}

function ensureFile() {
  if (!filePromise) {
    filePromise = fs.mkdir(path.dirname(logFilePath), { recursive: true });
  }
  return filePromise;
}

async function appendEntry(entry) {
  try {
    await ensureFile();
    try {
      const stat = await fs.stat(logFilePath);
      if (stat.size >= MAX_LOG_BYTES) await rotateLogFile();
    } catch {
      // File may not exist yet; append will create it.
    }
    await fs.appendFile(logFilePath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Log persistence must never break runtime behavior.
  }
}

async function rotateLogFile() {
  for (let index = MAX_BACKUP_FILES; index > 1; index -= 1) {
    try {
      await fs.rename(`${logFilePath}.${index - 1}`, `${logFilePath}.${index}`);
    } catch {
      // Missing backup files are normal.
    }
  }
  try {
    await fs.rename(logFilePath, `${logFilePath}.1`);
  } catch {
    // Keep current file if rotation fails.
  }
}

function extractMeta(args) {
  if (args.length === 0) return { meta: {}, values: [] };
  const last = args[args.length - 1];
  if (
    last &&
    typeof last === "object" &&
    !Array.isArray(last) &&
    !(last instanceof Error)
  ) {
    const keys = Object.keys(last);
    if (
      keys.some((key) =>
        ["source", "pluginId", "module", "traceId", "context", "error"].includes(
          key,
        ),
      )
    ) {
      return { meta: last, values: args.slice(0, -1) };
    }
  }
  return { meta: {}, values: args };
}

function write(level, args) {
  if (LEVEL_ORDER[level] < currentLevel()) return;
  const { meta, values } = extractMeta(args);
  const message = values.map(formatValue).join(" ");
  const entry = normalizeLogEntry({
    level,
    message,
    ...meta,
  });
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) {
    buffer = buffer.slice(-MAX_BUFFER);
  }

  const prefix = `[${entry.ts}] [${level.toUpperCase()}]`;
  if (level === "error") {
    console.error(prefix, message);
  } else if (level === "warn") {
    console.warn(prefix, message);
  } else {
    console.log(prefix, message);
  }

  writeChain = writeChain.then(() => appendEntry(entry));
  writeChain.catch(() => {});
}

export const logger = {
  debug: (...args) => write("debug", args),
  info: (...args) => write("info", args),
  warn: (...args) => write("warn", args),
  error: (...args) => write("error", args),
};

export async function initLogStore(limit = MAX_BUFFER) {
  try {
    await ensureFile();
    const raw = await fs.readFile(logFilePath, "utf8");
    const entries = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Ignore corrupt log lines.
      }
    }
    buffer = entries.slice(-limit);
  } catch {
    buffer = [];
  }
}

export function getLogs({ limit = 200, level = "debug" } = {}) {
  const min = LEVEL_ORDER[level] ?? LEVEL_ORDER.debug;
  return buffer
    .filter((entry) => LEVEL_ORDER[entry.level] >= min)
    .slice(-limit)
    .reverse();
}

export async function clearLogs() {
  buffer = [];
  try {
    await ensureFile();
    await fs.writeFile(logFilePath, "", "utf8");
  } catch {
    // Ignore clear failures.
  }
}

export async function flushLogStore() {
  await writeChain.catch(() => {});
}

export function getLogFilePath() {
  return logFilePath;
}

export function formatError(error) {
  if (!error) return "unknown error";
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
