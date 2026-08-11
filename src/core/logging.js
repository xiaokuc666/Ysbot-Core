const SENSITIVE_PATTERN =
  /(["']?(?:api[_-]?key|apikey|password|secret|token|access[_-]?token)["']?\s*[:=]\s*["']?)([^"'\n,;]*)/gi;
const AUTHORIZATION_PATTERN =
  /(authorization\s*[:=]\s*)(?!\s*Bearer\b)([^"'\n,;]*)/gi;
const BEARER_PATTERN = /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi;
const SENSITIVE_KEY =
  /(api[_-]?key|apikey|password|secret|token|authorization|access[_-]?token)/i;

const LEVELS = new Set(["debug", "info", "warn", "error"]);

function errorMessage(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function redactText(value) {
  return String(value ?? "")
    .replace(BEARER_PATTERN, "$1[REDACTED]")
    .replace(AUTHORIZATION_PATTERN, "$1[REDACTED]")
    .replace(SENSITIVE_PATTERN, "$1[REDACTED]");
}

export function redactSensitive(value) {
  if (typeof value === "string") return redactText(value);
  if (value instanceof Error) return redactText(errorMessage(value));
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY.test(key)
        ? "[REDACTED]"
        : redactSensitive(item);
    }
    return result;
  }
  return value;
}

export function normalizeLogEntry(input = {}) {
  const level = LEVELS.has(input.level) ? input.level : "info";
  const source = input.source || (input.pluginId ? "plugin" : "core");
  return {
    id: input.id || `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    ts: input.ts || new Date().toISOString(),
    level,
    source,
    pluginId: input.pluginId || null,
    module: input.module || null,
    traceId: input.traceId || null,
    message: redactText(input.message ?? ""),
    context: redactSensitive(input.context ?? null),
    error: input.error ? redactSensitive(input.error) : null,
  };
}

export class LoggingRegistry {
  constructor() {
    this.sources = new Map();
  }

  register(source) {
    if (!source || typeof source.id !== "string" || !source.id) {
      throw new TypeError("log source id must be a non-empty string");
    }
    if (typeof source.read !== "function") {
      throw new TypeError(`log source ${source.id} must implement read()`);
    }
    if (this.sources.has(source.id)) {
      throw new Error(`Log source already registered: ${source.id}`);
    }
    this.sources.set(source.id, {
      id: source.id,
      name: source.name || source.id,
      read: source.read,
      clear: source.clear || null,
    });
    return () => this.unregister(source.id);
  }

  unregister(id) {
    return this.sources.delete(id);
  }

  list() {
    return [...this.sources.values()].map(({ id, name }) => ({ id, name }));
  }

  get(id) {
    return this.sources.get(id) || null;
  }

  async read(id, options = {}) {
    const source = this.sources.get(id);
    if (!source) throw new Error(`Log source not found: ${id}`);
    return source.read(options);
  }

  async clear(id) {
    const source = this.sources.get(id);
    if (!source) throw new Error(`Log source not found: ${id}`);
    if (!source.clear) throw new Error(`Log source does not support clear: ${id}`);
    return source.clear();
  }
}
