import { logger, formatError } from "../logger.js";

export class PluginRegistry {
  constructor({ permissions = null } = {}) {
    this.plugins = new Map();
    this.permissions = permissions;
  }

  setPermissionService(permissions) {
    this.permissions = permissions;
  }

  register(plugin) {
    if (!plugin?.id) {
      throw new Error("插件必须包含 id");
    }
    if (this.plugins.has(plugin.id)) {
      throw new Error(`插件已存在: ${plugin.id}`);
    }
    this.plugins.set(plugin.id, plugin);
    logger.info(
      `[Plugins] registered ${plugin.id} type=${plugin.type || "unknown"} status=${plugin.status || "ready"}`,
    );
    return plugin;
  }

  get(id) {
    return this.plugins.get(id);
  }

  unregister(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) return null;
    this.plugins.delete(id);
    return plugin;
  }

  list() {
    return [...this.plugins.values()].map((plugin) => ({
      id: plugin.id,
      type: plugin.type || "capability",
      name: plugin.name || plugin.id,
      version: plugin.version,
      enabled: plugin.enabled !== false,
      status:
        plugin.enabled === false
          ? "disabled"
          : plugin.status || "ready",
      source: plugin.sourceType || "directory",
      dataDir: plugin.dataDir || null,
      packageHash: plugin.packageHash || null,
      role: plugin.manifest?.role || null,
    }));
  }

  async invoke(id, params, context = {}) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`插件不存在: ${id}`);
    if (plugin.enabled === false) {
      throw new Error(`插件已禁用: ${id}`);
    }
    if (plugin.status && plugin.status !== "ready") {
      throw new Error(`插件状态不可用: ${id} (${plugin.status})`);
    }
    if (typeof plugin.invoke !== "function") {
      throw new Error(`插件不支持 invoke: ${id}`);
    }
    if (this.permissions) {
      await this.permissions.assert(
        id,
        this.permissions.buildRequest(id, context),
      );
    }
    try {
      return await plugin.invoke(params, context);
    } catch (error) {
      logger.error(`[Plugins] ${id} invoke failed: ${formatError(error)}`);
      throw error;
    }
  }

  setStatus(id, status) {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;
    plugin.status = status;
    return true;
  }

  setEnabled(id, enabled) {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;
    plugin.enabled = Boolean(enabled);
    plugin.status = plugin.enabled ? "ready" : "disabled";
    return true;
  }
}
