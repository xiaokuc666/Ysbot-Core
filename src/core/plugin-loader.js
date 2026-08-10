import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logger, formatError } from "../logger.js";

const PLUGIN_TYPES = new Set([
  "motivation",
  "capability",
  "protocol",
  "action",
  "feedback",
  "policy",
  "system",
]);

export function validatePluginManifest(manifest) {
  const errors = [];
  if (!manifest?.id || typeof manifest.id !== "string") {
    errors.push("id 必须是字符串");
  }
  if (!PLUGIN_TYPES.has(manifest?.type)) {
    errors.push(`type 必须是 ${[...PLUGIN_TYPES].join("/")}`);
  }
  if (typeof manifest?.version !== "string" || !manifest.version) {
    errors.push("version 必须是字符串");
  }
  if (manifest.permissions !== undefined) {
    if (typeof manifest.permissions !== "object" || manifest.permissions === null) {
      errors.push("permissions 必须是对象");
    } else {
      if (
        manifest.permissions.adminOnly !== undefined &&
        typeof manifest.permissions.adminOnly !== "boolean"
      ) {
        errors.push("permissions.adminOnly 必须是布尔值");
      }
      if (
        manifest.permissions.enabledGroups !== undefined &&
        !Array.isArray(manifest.permissions.enabledGroups)
      ) {
        errors.push("permissions.enabledGroups 必须是数组");
      }
    }
  }
  if (manifest.inputSchema !== undefined && typeof manifest.inputSchema !== "object") {
    errors.push("inputSchema 必须是对象");
  }
  if (manifest.outputSchema !== undefined && typeof manifest.outputSchema !== "object") {
    errors.push("outputSchema 必须是对象");
  }
  if (manifest.api !== undefined) {
    if (typeof manifest.api !== "object" || manifest.api === null) {
      errors.push("api 必须是对象");
    } else {
      if (manifest.api.timeoutMs !== undefined && typeof manifest.api.timeoutMs !== "number") {
        errors.push("api.timeoutMs 必须是数字");
      }
      if (manifest.api.retries !== undefined && typeof manifest.api.retries !== "number") {
        errors.push("api.retries 必须是数字");
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`插件清单无效: ${errors.join("; ")}`);
  }
}

export class PluginLoader {
  constructor({ registry, contextFactory }) {
    this.registry = registry;
    this.contextFactory = contextFactory;
  }

  async loadDir(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      logger.warn(`[PluginLoader] plugin dir not found: ${dir}`);
      return [];
    }
    const loaded = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const plugin = await this.loadPlugin(path.join(dir, entry.name));
        loaded.push(plugin);
      } catch (error) {
        logger.error(
          `[PluginLoader] load ${entry.name} failed: ${formatError(error)}`,
        );
      }
    }
    logger.info(`[PluginLoader] loaded ${loaded.length} plugin(s) from ${dir}`);
    return loaded;
  }

  async loadPlugin(pluginDir, contextOverride = {}) {
    const manifestPath = path.join(pluginDir, "plugin.json");
    const indexPath = path.join(pluginDir, "index.js");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    validatePluginManifest(manifest);
    const context = {
      ...this.contextFactory(manifest),
      ...contextOverride,
    };
    const module = await import(pathToFileURL(indexPath).href);
    const PluginClass = module.default;
    if (typeof PluginClass !== "function") {
      throw new Error("插件 index.js 必须默认导出一个类");
    }
    let instance;
    try {
      instance = new PluginClass(context);
      if (typeof instance.init === "function") {
        await instance.init(context);
      }
    } catch (error) {
      if (instance && typeof instance.dispose === "function") {
        await instance.dispose().catch(() => {});
      }
      throw error;
    }
    const wrapper = {
      id: manifest.id,
      type: manifest.type,
      name: manifest.name || manifest.id,
      version: manifest.version || "0.0.0",
      manifest,
      instance,
      enabled: manifest.enabled !== false,
      status: "ready",
      async invoke(params, callContext = {}) {
        if (typeof instance.invoke !== "function") {
          throw new Error("该插件不支持 invoke");
        }
        return instance.invoke(params, callContext);
      },
      async poll(callContext = {}) {
        if (typeof instance.poll !== "function") {
          return [];
        }
        return instance.poll(callContext);
      },
      async consume(event, callContext = {}) {
        if (typeof instance.consume !== "function") return;
        return instance.consume(event, callContext);
      },
      async decide(context) {
        if (typeof instance.decide !== "function") {
          return null;
        }
        return instance.decide(context);
      },
      async dispose() {
        if (typeof instance.dispose === "function") {
          await instance.dispose();
        }
      },
    };
    this.registry.register(wrapper);
    return wrapper;
  }
}
