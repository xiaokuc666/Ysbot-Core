import fs from "node:fs/promises";
import path from "node:path";
import { rootDir } from "./config.js";

const LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MAX_BUFFER = 1000;
const logFilePath = path.join(rootDir, "data", "logs", "aibot.jsonl");
let buffer = [];
let filePromise = null;

function currentLevel() {
  const raw = String(process.env.LOG_LEVEL || "info").toLowerCase();
  return LEVEL_ORDER[raw] ?? LEVEL_ORDER.info;
}

function formatValue(value) {
  if (value instanceof Error) return formatError(value);
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
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
    await fs.appendFile(logFilePath, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Log persistence must never break runtime behavior.
  }
}

function write(level, args) {
  if (LEVEL_ORDER[level] < currentLevel()) return;
  const time = new Date().toISOString();
  const message = args.map(formatValue).join(" ");
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    ts: time,
    level,
    message,
  };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) {
    buffer = buffer.slice(-MAX_BUFFER);
  }

  const prefix = `[${time}] [${level.toUpperCase()}]`;
  if (level === "error") {
    console.error(prefix, ...args);
  } else if (level === "warn") {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }

  void appendEntry(entry);
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

export function formatError(error) {
  if (!error) return "unknown error";
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
