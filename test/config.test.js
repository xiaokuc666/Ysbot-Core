import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "../src/config.js";

test("default config is valid", () => {
  const config = parseConfig({});
  assert.equal(config.onebotWsUrl, "ws://127.0.0.1:3001");
  assert.equal(config.managementPort, 5178);
  assert.equal(config.curiosityIntervalMs, 45000);
  assert.equal(typeof config.pluginDir, "string");
  assert.equal(typeof config.dataDir, "string");
});

test("config paths can be overridden", () => {
  const config = parseConfig({
    YSBOT_PLUGIN_DIR: "/tmp/plugins",
    YSBOT_DATA_DIR: "/tmp/data",
  });
  assert.match(config.pluginDir, /plugins$/);
  assert.match(config.dataDir, /data$/);
});
