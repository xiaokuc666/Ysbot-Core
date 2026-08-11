import fs from "node:fs/promises";
import path from "node:path";

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function validateValue(value, propSchema, key, errors) {
  if (!propSchema || typeof propSchema !== "object") return;
  if (propSchema.required && !hasValue(value)) {
    errors.push(`${key} is required`);
    return;
  }
  if (!hasValue(value)) return;
  if (propSchema.type === "string" && typeof value !== "string") {
    errors.push(`${key} must be a string`);
  }
  if (propSchema.type === "number" && typeof value !== "number") {
    errors.push(`${key} must be a number`);
  }
  if (propSchema.type === "integer" && !Number.isInteger(value)) {
    errors.push(`${key} must be an integer`);
  }
  if (propSchema.type === "boolean" && typeof value !== "boolean") {
    errors.push(`${key} must be a boolean`);
  }
  if (Array.isArray(propSchema.enum) && !propSchema.enum.includes(value)) {
    errors.push(`${key} must be one of ${propSchema.enum.join(", ")}`);
  }
  if (
    typeof value === "number" &&
    propSchema.minimum !== undefined &&
    value < propSchema.minimum
  ) {
    errors.push(`${key} must be >= ${propSchema.minimum}`);
  }
  if (
    typeof value === "number" &&
    propSchema.maximum !== undefined &&
    value > propSchema.maximum
  ) {
    errors.push(`${key} must be <= ${propSchema.maximum}`);
  }
}

export class PluginConfigStore {
  constructor({ dataDir, secrets }) {
    this.dataDir = dataDir;
    this.secrets = secrets;
  }

  file(pluginId) {
    return path.join(this.dataDir, pluginId, "config.json");
  }

  defaults(schema = {}) {
    const properties = schema.properties || {};
    const defaults = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      if (propSchema?.default !== undefined) defaults[key] = propSchema.default;
    }
    return defaults;
  }

  validate(pluginId, values = {}, schema = {}) {
    const errors = [];
    const properties = schema.properties || {};
    for (const [key, propSchema] of Object.entries(properties)) {
      validateValue(values[key], propSchema, key, errors);
    }
    if (errors.length) {
      throw new Error(
        `Config validation failed for ${pluginId}: ${errors.join("; ")}`,
      );
    }
    return true;
  }

  applyDefaults(values = {}, schema = {}) {
    return { ...this.defaults(schema), ...values };
  }

  async get(pluginId, schema = {}) {
    let raw;
    try {
      raw = JSON.parse(await fs.readFile(this.file(pluginId), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        const wrapped = new Error(
          `Config file corrupted for ${pluginId}: ${error.message}`,
        );
        wrapped.code = "CONFIG_CORRUPTED";
        wrapped.cause = error;
        throw wrapped;
      }
      raw = {};
    }
    this.validate(pluginId, raw, schema);
    return this.applyDefaults(raw, schema);
  }

  async set(pluginId, values = {}, schema = {}) {
    this.validate(pluginId, values, schema);
    const merged = this.applyDefaults(values, schema);
    const file = this.file(pluginId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    await fs.rename(tmp, file);
    return merged;
  }

  async reset(pluginId, schema = {}) {
    const defaults = this.defaults(schema);
    await this.set(pluginId, defaults, schema);
    return defaults;
  }

  async getSecret(pluginId, key) {
    const all = await this.secrets.load(pluginId);
    return all[key];
  }

  async hasSecret(pluginId, key) {
    const all = await this.secrets.load(pluginId);
    return hasValue(all[key]);
  }

  async setSecret(pluginId, key, value) {
    const all = await this.secrets.load(pluginId);
    all[key] = value;
    await this.secrets.save(pluginId, all);
  }

  async clearSecret(pluginId, key) {
    const all = await this.secrets.load(pluginId);
    delete all[key];
    await this.secrets.save(pluginId, all);
  }
}
