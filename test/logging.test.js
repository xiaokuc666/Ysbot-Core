import test from "node:test";
import assert from "node:assert/strict";
import {
  LoggingRegistry,
  normalizeLogEntry,
  redactSensitive,
  redactText,
} from "../src/core/logging.js";

test("log redaction removes bearer and secret values", () => {
  assert.equal(
    redactText("Authorization: Bearer abc123"),
    "Authorization: Bearer [REDACTED]",
  );
  assert.equal(
    redactText('accessToken = "secret-value"'),
    'accessToken = "[REDACTED]"',
  );
});

test("log redaction handles nested objects", () => {
  const result = redactSensitive({
    groupId: "g1",
    credentials: {
      apiKey: "secret",
      password: "pw",
    },
    plain: "ok",
  });

  assert.deepEqual(result, {
    groupId: "g1",
    credentials: {
      apiKey: "[REDACTED]",
      password: "[REDACTED]",
    },
    plain: "ok",
  });
});

test("normalizeLogEntry creates structured entries", () => {
  const entry = normalizeLogEntry({
    level: "warn",
    source: "plugin",
    pluginId: "protocol-onebot",
    module: "ws-client",
    traceId: "trace-1",
    message: "Authorization: Bearer abc",
    context: { groupId: "957302634" },
    error: new Error("boom"),
  });

  assert.equal(entry.level, "warn");
  assert.equal(entry.source, "plugin");
  assert.equal(entry.pluginId, "protocol-onebot");
  assert.equal(entry.module, "ws-client");
  assert.equal(entry.traceId, "trace-1");
  assert.equal(entry.message, "Authorization: Bearer [REDACTED]");
  assert.deepEqual(entry.context, { groupId: "957302634" });
  assert.match(entry.error, /boom/);
});

test("logging registry routes reads and clears to plugin-owned sources", async () => {
  const registry = new LoggingRegistry();
  const entries = [{ id: "1", message: "hello" }];
  const unregister = registry.register({
    id: "protocol-onebot",
    name: "OneBot Logs",
    read: async () => entries,
    clear: async () => {
      entries.length = 0;
    },
  });

  assert.deepEqual(registry.list(), [
    { id: "protocol-onebot", name: "OneBot Logs" },
  ]);
  assert.deepEqual(await registry.read("protocol-onebot"), entries);
  await registry.clear("protocol-onebot");
  assert.equal(entries.length, 0);

  unregister();
  assert.equal(registry.list().length, 0);
  await assert.rejects(registry.read("protocol-onebot"), /Log source not found/);
});
