import fs from "node:fs/promises";
import path from "node:path";
import { PluginLoader, validatePluginManifest } from "./plugin-loader.js";
import { extractPlg, hashFile, readPlgFile } from "./plg.js";
import { logger, formatError } from "../logger.js";

export class PluginManager {
  constructor({
    registry,
    pluginDir,
    cacheDir,
    dataDir,
    contextFactory,
    permissions = null,
  }) {
    this.registry = registry;
    this.pluginDir = pluginDir;
    this.cacheDir = cacheDir;
    this.dataDir = dataDir;
    this.pluginLoader = new PluginLoader({
      registry,
      contextFactory,
      permissions,
    });
    this.sources = new Map();
  }

  async loadAll({ ids = null } = {}) {
    this.enabledIds = ids
      ? new Set(ids.map((id) => String(id)))
      : null;
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.loadDirectories();
    await this.loadPlgFiles();
    await this.validateDependencies();
  }

  async listMetadata({ ids = null } = {}) {
    const selected = ids ? new Set(ids.map((id) => String(id))) : null;
    const results = [];
    let entries;
    try {
      entries = await fs.readdir(this.pluginDir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      try {
        let manifest;
        let sourceType;
        if (entry.isDirectory()) {
          manifest = JSON.parse(
            await fs.readFile(
              path.join(this.pluginDir, entry.name, "plugin.json"),
              "utf8",
            ),
          );
          sourceType = "directory";
        } else if (entry.isFile() && entry.name.endsWith(".plg")) {
          const buffer = await fs.readFile(path.join(this.pluginDir, entry.name));
          const manifestBuffer = readPlgFile(buffer, "plugin.json");
          if (!manifestBuffer) continue;
          manifest = JSON.parse(manifestBuffer.toString("utf8"));
          sourceType = "plg";
        } else {
          continue;
        }

        validatePluginManifest(manifest);
        if (selected && !selected.has(String(manifest.id))) continue;
        results.push({
          id: manifest.id,
          type: manifest.type,
          name: manifest.name || manifest.id,
          version: manifest.version || "0.0.0",
          enabled: manifest.enabled !== false,
          status: manifest.enabled === false ? "disabled" : "ready",
          source: sourceType,
          sourceType,
          role: manifest.role || null,
          dependencies: manifest.dependencies || [],
        });
      } catch {
        // Skip invalid plugin entries without initializing anything.
      }
    }

    return results.sort((a, b) => a.id.localeCompare(b.id));
  }

  async loadDirectories() {
    const entries = await fs.readdir(this.pluginDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      const dir = path.join(this.pluginDir, entry.name);
      try {
        const manifest = JSON.parse(
          await fs.readFile(path.join(dir, "plugin.json"), "utf8"),
        );
        if (this.enabledIds && !this.enabledIds.has(String(manifest.id))) {
          continue;
        }
        const dataDir = path.join(this.dataDir, String(manifest.id));
        const wrapper = await this.pluginLoader.loadPlugin(dir, {
          sourceType: "directory",
          pluginDir: dir,
          dataDir,
          cacheDir: null,
        });
        await this.registerSource(wrapper, {
          type: "directory",
          dir,
          dataDir,
        });
      } catch (error) {
        logger.error(
          `[PluginManager] load directory ${entry.name} failed: ${formatError(error)}`,
        );
      }
    }
  }

  async loadPlgFiles() {
    const files = await fs.readdir(this.pluginDir);
    for (const file of files) {
      if (!file.endsWith(".plg")) continue;
      try {
        if (this.enabledIds) {
          const buffer = await fs.readFile(path.join(this.pluginDir, file));
          const manifestBuffer = readPlgFile(buffer, "plugin.json");
          if (manifestBuffer) {
            const manifest = JSON.parse(manifestBuffer.toString("utf8"));
            if (!this.enabledIds.has(String(manifest.id))) continue;
          }
        }
        await this.loadPlgFile(file);
      } catch (error) {
        logger.error(
          `[PluginManager] load plg ${file} failed: ${formatError(error)}`,
        );
      }
    }
  }

  async loadPlgFile(fileName) {
    const plgPath = path.join(this.pluginDir, fileName);
    const hash = await hashFile(plgPath);
    const manifestBuffer = readPlgFile(
      await fs.readFile(plgPath),
      "plugin.json",
    );
    if (!manifestBuffer) throw new Error("缺少 plugin.json");
    const manifest = JSON.parse(manifestBuffer.toString("utf8"));
    validatePluginManifest(manifest);
    const id = manifest.id;
    const cacheTarget = path.join(this.cacheDir, id);
    const dataTarget = path.join(this.dataDir, id);

    let needExtract = true;
    try {
      const cached = JSON.parse(
        await fs.readFile(path.join(cacheTarget, "plugin.json"), "utf8"),
      );
      if (cached.packageHash === hash) needExtract = false;
    } catch {
      needExtract = true;
    }
    if (needExtract) {
      await fs.rm(cacheTarget, { recursive: true, force: true });
      await extractPlg(plgPath, cacheTarget);
      const cachedManifestPath = path.join(cacheTarget, "plugin.json");
      const cachedManifest = JSON.parse(
        await fs.readFile(cachedManifestPath, "utf8"),
      );
      cachedManifest.packageHash = hash;
      await fs.writeFile(
        cachedManifestPath,
        JSON.stringify(cachedManifest, null, 2),
        "utf8",
      );
    }

    await fs.mkdir(dataTarget, { recursive: true });
    const wrapper = await this.pluginLoader.loadPlugin(cacheTarget, {
      sourceType: "plg",
      pluginDir: cacheTarget,
      dataDir: dataTarget,
      cacheDir: cacheTarget,
      packageHash: hash,
    });
    wrapper.sourceType = "plg";
    wrapper.dataDir = dataTarget;
    wrapper.cacheDir = cacheTarget;
    wrapper.packageHash = hash;
    this.sources.set(id, {
      type: "plg",
      dir: cacheTarget,
      plgPath,
      dataDir: dataTarget,
      cacheDir: cacheTarget,
      packageHash: hash,
    });
    return wrapper;
  }

  async validateDependencies() {
    for (const plugin of this.registry.list()) {
      const wrapper = this.registry.get(plugin.id);
      const dependencies = wrapper?.manifest?.dependencies || [];
      const missing = dependencies.filter((dependencyId) => {
        const dependency = this.registry.get(dependencyId);
        return (
          !dependency ||
          dependency.enabled === false ||
          dependency.status !== "ready"
        );
      });
      if (missing.length > 0) {
        logger.error(
          `[PluginManager] ${plugin.id} 缺少前置插件: ${missing.join(", ")}`,
        );
        const removed = this.registry.unregister(plugin.id);
        if (removed?.dispose) {
          await removed.dispose().catch(() => {});
        }
      }
    }
  }

  async reloadPlugin(id) {
    const source = this.sources.get(id);
    if (!source) throw new Error(`插件未加载: ${id}`);
    const old = this.registry.unregister(id);
    if (old?.dispose) {
      await old.dispose().catch(() => {});
    }
    let wrapper;
    if (source.type === "plg") {
      wrapper = await this.loadPlgFile(path.basename(source.plgPath));
    } else {
      wrapper = await this.pluginLoader.loadPlugin(source.dir);
      await this.registerSource(wrapper, source);
    }
    return wrapper;
  }

  async clearPluginData(id) {
    const source = this.sources.get(id);
    const dataDir = source?.dataDir || path.join(this.dataDir, id);
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.mkdir(dataDir, { recursive: true });
  }

  async registerSource(wrapper, source) {
    wrapper.sourceType = source.type;
    wrapper.dataDir = source.dataDir;
    wrapper.packageHash = source.packageHash || null;
    this.sources.set(wrapper.id, source);
  }
}
