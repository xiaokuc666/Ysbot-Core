import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PermissionService } from "../src/core/permission-service.js";
import { PluginRegistry } from "../src/core/plugin-registry.js";

function registerPlugin(registry, id, permissions = {}) {
  registry.register({
    id,
    type: "capability",
    enabled: true,
    manifest: { id, permissions },
  });
}

test("permission service allows plugins without restrictions", async () => {
  const registry = new PluginRegistry();
  registerPlugin(registry, "open");
  const service = new PermissionService({ registry });

  assert.equal(
    await service.can("open", {
      actor: { id: "1" },
      scene: { type: "group", id: "g1" },
    }),
    true,
  );
});

test("permission service denies unknown plugins", async () => {
  const registry = new PluginRegistry();
  const service = new PermissionService({ registry });

  assert.equal(await service.can("missing", { actor: { id: "1" } }), false);
  await assert.rejects(
    service.assert("missing", { actor: { id: "1" } }),
    /plugin_not_found/,
  );
});

test("permission service enforces adminOnly and deny by default", async () => {
  const registry = new PluginRegistry();
  registerPlugin(registry, "admin-tool", { adminOnly: true });
  const service = new PermissionService({ registry });

  assert.equal(await service.can("admin-tool", {}), false);
  assert.equal(
    await service.can("admin-tool", {
      actor: { id: "1", roles: ["member"] },
    }),
    false,
  );
  assert.equal(
    await service.can("admin-tool", {
      actor: { id: "1", roles: "admin" },
    }),
    false,
  );
  assert.equal(
    await service.can("admin-tool", {
      actor: { id: "1", roles: ["admin"] },
    }),
    true,
  );
});

test("permission service enforces group rules", async () => {
  const registry = new PluginRegistry();
  registerPlugin(registry, "group-only", {
    enabledGroups: ["g1"],
    disabledGroups: ["g2"],
  });
  const service = new PermissionService({ registry });

  assert.equal(
    await service.can("group-only", {
      actor: { id: "1" },
      scene: { type: "group", id: "g1" },
    }),
    true,
  );
  assert.equal(
    await service.can("group-only", {
      actor: { id: "1" },
      scene: { type: "group", id: "g3" },
    }),
    false,
  );
  assert.equal(
    await service.can("group-only", {
      actor: { id: "1" },
      scene: { type: "group", id: "g2" },
    }),
    false,
  );
  assert.equal(
    await service.can("group-only", {
      actor: { id: "1" },
      scene: { type: "private", id: "u1" },
    }),
    false,
  );
});

test("permission service enforces user and role rules", async () => {
  const registry = new PluginRegistry();
  registerPlugin(registry, "guarded", {
    allowedUsers: ["u1"],
    blockedUsers: ["u2"],
    requiredRoles: ["member"],
  });
  const service = new PermissionService({ registry });

  assert.equal(
    await service.can("guarded", {
      actor: { id: "u1", roles: ["member"] },
    }),
    true,
  );
  assert.equal(
    await service.can("guarded", {
      actor: { id: "u3", roles: ["member"] },
    }),
    false,
  );
  assert.equal(
    await service.can("guarded", {
      actor: { id: "u1", roles: [] },
    }),
    false,
  );
  assert.equal(
    await service.can("guarded", {
      actor: { id: "u2", roles: ["member"] },
    }),
    false,
  );
});

test("permission service honors deny-all and allow-all modes", async () => {
  const registry = new PluginRegistry();
  registerPlugin(registry, "mode-plugin", { adminOnly: true });
  const service = new PermissionService({ registry });

  await service.setOverride(
    "mode-plugin",
    { mode: "deny-all" },
    service.managementActor(),
  );
  assert.equal(
    await service.can("mode-plugin", {
      actor: { id: "u1", admin: true },
    }),
    false,
  );

  await service.setOverride(
    "mode-plugin",
    { mode: "allow-all" },
    service.managementActor(),
  );
  assert.equal(
    await service.can("mode-plugin", {
      actor: { id: "u1", roles: ["member"] },
    }),
    true,
  );
});

test("permission overrides persist and require management actor", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-permissions-"));
  const filePath = path.join(root, "permissions.json");
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const registry = new PluginRegistry();
  registerPlugin(registry, "managed");
  const service = new PermissionService({ registry, filePath });
  await service.init();

  await assert.rejects(
    service.setOverride("managed", { adminOnly: true }, { id: "u1" }),
    /management_required/,
  );
  await assert.rejects(
    service.setOverride(
      "managed",
      { adminOnly: true },
      { origin: "management", id: "operator", admin: false, roles: [] },
    ),
    /management_required/,
  );
  await service.setOverride(
    "managed",
    { adminOnly: true, enabledGroups: ["g1"] },
    service.managementActor(),
  );
  assert.deepEqual(service.listOverrides().managed, {
    adminOnly: true,
    enabledGroups: ["g1"],
  });
  assert.equal(service.snapshotAll().length, 1);
  assert.equal(
    await service.can("managed", {
      actor: { id: "u1", roles: ["member"] },
    }),
    false,
  );
  assert.equal(
    await service.can("managed", {
      actor: { id: "u1", admin: true },
      scene: { type: "group", id: "g1" },
    }),
    true,
  );

  const reloaded = new PermissionService({ registry, filePath });
  await reloaded.init();
  assert.equal(
    await reloaded.can("managed", {
      actor: { id: "u1", admin: true },
      scene: { type: "group", id: "g1" },
    }),
    true,
  );
});

test("permission service rejects corrupted override file", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-badperms-"));
  const filePath = path.join(root, "permissions.json");
  await fs.writeFile(filePath, "{broken", "utf8");
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const registry = new PluginRegistry();
  const service = new PermissionService({ registry, filePath });
  await assert.rejects(
    service.init(),
    (error) =>
      error.code === "PERMISSIONS_FILE_CORRUPTED" &&
      /Permissions file corrupted/.test(error.message),
  );
});

test("permission service rejects malformed override values", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ysbot-badpermval-"));
  const filePath = path.join(root, "permissions.json");
  await fs.writeFile(
    filePath,
    JSON.stringify({ managed: { adminOnly: "yes" } }),
    "utf8",
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const registry = new PluginRegistry();
  const service = new PermissionService({ registry, filePath });
  await assert.rejects(
    service.init(),
    (error) =>
      error.code === "PERMISSIONS_FILE_CORRUPTED" &&
      /Permissions file corrupted/.test(error.message),
  );
});

test("registry invoke is guarded by permission service", async () => {
  const registry = new PluginRegistry();
  registry.register({
    id: "admin-tool",
    type: "capability",
    enabled: true,
    manifest: { id: "admin-tool", permissions: { adminOnly: true } },
    async invoke() {
      return "ok";
    },
  });
  const service = new PermissionService({ registry });
  registry.setPermissionService(service);

  await assert.rejects(
    registry.invoke("admin-tool", {}, { actor: { id: "u1" } }),
    /admin_only/,
  );
  assert.equal(
    await registry.invoke("admin-tool", {}, { actor: { id: "u1", admin: true } }),
    "ok",
  );
});
