import fs from "node:fs/promises";
import path from "node:path";

export class PermissionDeniedError extends Error {
  constructor({ pluginId, action, reason }) {
    super(`Permission denied for ${pluginId}:${action} (${reason})`);
    this.name = "PermissionDeniedError";
    this.code = "PERMISSION_DENIED";
    this.statusCode = 403;
    this.pluginId = pluginId;
    this.action = action;
    this.reason = reason;
  }
}

const OVERRIDE_KEYS = [
  "mode",
  "adminOnly",
  "enabledGroups",
  "disabledGroups",
  "allowedUsers",
  "blockedUsers",
  "requiredRoles",
];

function stringArray(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError("permission array values must be arrays");
  }
  return value.map(String);
}

function hasRestrictions(rules) {
  return Boolean(
    rules.adminOnly ||
      rules.enabledGroups.length ||
      rules.disabledGroups.length ||
      rules.allowedUsers.length ||
      rules.blockedUsers.length ||
      rules.requiredRoles.length,
  );
}

function isAdminActor(actor) {
  if (!actor) return false;
  if (actor.admin === true || actor.isAdmin === true) return true;
  let roles = [];
  try {
    roles = stringArray(actor.roles);
  } catch {
    return false;
  }
  const hasAdminRole = roles.some((role) =>
    ["admin", "owner"].includes(String(role).toLowerCase()),
  );
  if (actor.origin === "management") {
    return hasAdminRole || actor.id === "management";
  }
  return hasAdminRole;
}

function normalizeActor(actor, context = {}) {
  const source =
    actor ||
    context.actor ||
    (context.sender
      ? {
          id: context.sender.user_id ?? context.sender.userId,
          roles: context.sender.role ? [context.sender.role] : [],
        }
      : null) ||
    (context.user_id || context.userId
      ? { id: context.user_id ?? context.userId }
      : null);

  if (!source) return null;
  let sourceRoles = [];
  try {
    sourceRoles = stringArray(source.roles);
  } catch {
    sourceRoles = [];
  }
  const roles = [
    ...new Set([
      ...sourceRoles,
      ...(context.sender?.role ? [context.sender.role] : []),
    ]),
  ];
  return {
    origin: source.origin || "qq",
    id: String(source.id ?? source.user_id ?? source.userId ?? ""),
    admin: isAdminActor({
      ...source,
      origin: source.origin || "qq",
      roles,
    }),
    roles,
  };
}

function normalizeScene(scene, context = {}) {
  const source = scene || context.scene;
  if (source) {
    return {
      type: source.type || (source.groupId ? "group" : "private"),
      id: String(
        source.id ?? source.groupId ?? source.privateId ?? source.group_id ?? "",
      ),
    };
  }
  if (context.group_id || context.groupId || context.message_type === "group") {
    return {
      type: "group",
      id: String(context.group_id ?? context.groupId ?? ""),
    };
  }
  if (context.user_id || context.userId || context.sender?.user_id) {
    return {
      type: "private",
      id: String(context.user_id ?? context.userId ?? context.sender.user_id),
    };
  }
  return null;
}

function normalizeOverride(patch = {}) {
  const allowed = new Set(OVERRIDE_KEYS);
  const next = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    next[key] = value;
  }

  if (next.mode !== undefined && !["manifest", "allow-all", "deny-all"].includes(next.mode)) {
    throw new TypeError("permissions.mode must be manifest, allow-all or deny-all");
  }
  if (next.adminOnly !== undefined && typeof next.adminOnly !== "boolean") {
    throw new TypeError("permissions.adminOnly must be a boolean");
  }
  for (const key of [
    "enabledGroups",
    "disabledGroups",
    "allowedUsers",
    "blockedUsers",
    "requiredRoles",
  ]) {
    if (next[key] !== undefined) next[key] = stringArray(next[key]);
  }
  return next;
}

export class PermissionService {
  constructor({ registry, filePath = null, logger = null }) {
    this.registry = registry;
    this.filePath = filePath;
    this.logger = logger;
    this.overrides = {};
  }

  async init() {
    if (!this.filePath) return this;
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new TypeError("permissions file must contain an object");
      }
      const normalized = {};
      for (const [pluginId, override] of Object.entries(parsed)) {
        normalized[pluginId] = normalizeOverride(override || {});
      }
      this.overrides = normalized;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        const wrapped = new Error(
          `Permissions file corrupted: ${error.message}`,
        );
        wrapped.code = "PERMISSIONS_FILE_CORRUPTED";
        wrapped.cause = error;
        throw wrapped;
      }
    }
    return this;
  }

  async save() {
    if (!this.filePath) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(this.overrides, null, 2)}\n`, "utf8");
    await fs.rename(tmp, this.filePath);
  }

  managementActor() {
    return {
      origin: "management",
      id: "management",
      admin: true,
      roles: ["admin"],
    };
  }

  buildRequest(pluginId, context = {}) {
    return {
      actor: normalizeActor(context.actor, context),
      scene: normalizeScene(context.scene, context),
      resource: {
        pluginId,
        action: context.action || context.resource?.action || "invoke",
      },
    };
  }

  normalizeRequest(request = {}) {
    return {
      actor: normalizeActor(request.actor, request),
      scene: normalizeScene(request.scene, request),
      action: request.resource?.action || request.action || "invoke",
      resource: request.resource || {},
    };
  }

  getOverrides(pluginId) {
    return { ...(this.overrides[pluginId] || {}) };
  }

  listOverrides() {
    return Object.fromEntries(
      Object.entries(this.overrides).map(([pluginId, override]) => [
        pluginId,
        { ...override },
      ]),
    );
  }

  resolveRules(pluginId) {
    const manifest = this.registry.get(pluginId)?.manifest;
    const staticRules = manifest?.permissions || {};
    const override = this.overrides[pluginId] || {};
    return {
      mode: override.mode || staticRules.mode || "manifest",
      adminOnly: override.adminOnly ?? staticRules.adminOnly ?? false,
      enabledGroups: override.enabledGroups ?? staticRules.enabledGroups ?? [],
      disabledGroups: override.disabledGroups ?? staticRules.disabledGroups ?? [],
      allowedUsers: override.allowedUsers ?? staticRules.allowedUsers ?? [],
      blockedUsers: override.blockedUsers ?? staticRules.blockedUsers ?? [],
      requiredRoles: override.requiredRoles ?? staticRules.requiredRoles ?? [],
    };
  }

  snapshot(pluginId) {
    const rules = this.resolveRules(pluginId);
    return {
      pluginId,
      rules,
      overrides: this.getOverrides(pluginId),
    };
  }

  snapshotAll() {
    return this.registry.list().map((plugin) => this.snapshot(plugin.id));
  }

  async can(pluginId, request = {}) {
    try {
      await this.assert(pluginId, request);
      return true;
    } catch (error) {
      if (error instanceof PermissionDeniedError) return false;
      throw error;
    }
  }

  async assert(pluginId, request = {}) {
    const normalized = this.normalizeRequest(request);
    const actor = normalized.actor;
    const scene = normalized.scene;
    const action = normalized.action;
    if (!this.registry.get(pluginId)) {
      throw new PermissionDeniedError({
        pluginId,
        action,
        reason: "plugin_not_found",
      });
    }
    const rules = this.resolveRules(pluginId);

    if (rules.mode === "deny-all") {
      throw new PermissionDeniedError({ pluginId, action, reason: "deny_all" });
    }
    if (rules.mode === "allow-all" || !hasRestrictions(rules)) return true;
    if (!actor) {
      throw new PermissionDeniedError({ pluginId, action, reason: "missing_actor" });
    }

    const denied = (reason) => {
      throw new PermissionDeniedError({ pluginId, action, reason });
    };

    if (rules.adminOnly && !actor.admin) denied("admin_only");
    if (rules.blockedUsers.includes(actor.id)) denied("blocked_user");

    if (rules.enabledGroups.length || rules.disabledGroups.length) {
      if (!scene) denied("missing_scene");
      if (scene.type !== "group") denied("group_only");
      if (rules.disabledGroups.includes(scene.id)) denied("disabled_group");
      if (
        rules.enabledGroups.length &&
        !rules.enabledGroups.includes(scene.id)
      ) {
        denied("group_not_allowed");
      }
    }

    if (
      rules.allowedUsers.length &&
      !rules.allowedUsers.includes(actor.id)
    ) {
      denied("user_not_allowed");
    }
    if (
      rules.requiredRoles.length &&
      !rules.requiredRoles.some((role) => actor.roles.includes(String(role)))
    ) {
      denied("missing_role");
    }

    return true;
  }

  async setOverride(pluginId, patch = {}, actor = null) {
    if (!actor || actor.origin !== "management" || !isAdminActor(actor)) {
      throw new PermissionDeniedError({
        pluginId,
        action: "set_override",
        reason: "management_required",
      });
    }
    const normalized = normalizeOverride(patch);
    if (Object.keys(normalized).length === 0) {
      delete this.overrides[pluginId];
    } else {
      this.overrides[pluginId] = {
        ...(this.overrides[pluginId] || {}),
        ...normalized,
      };
    }
    await this.save();
    return this.snapshot(pluginId);
  }

  async clearOverride(pluginId, actor = null) {
    if (!actor || actor.origin !== "management" || !isAdminActor(actor)) {
      throw new PermissionDeniedError({
        pluginId,
        action: "clear_override",
        reason: "management_required",
      });
    }
    delete this.overrides[pluginId];
    await this.save();
    return this.snapshot(pluginId);
  }
}
