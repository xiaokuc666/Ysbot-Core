import test from "node:test";
import assert from "node:assert/strict";
import { ProtocolBridge } from "../src/core/protocol-bridge.js";

test("protocol bridge delegates send and emits messages", async () => {
  const bridge = new ProtocolBridge();
  const seen = [];
  bridge.onMessage((event) => seen.push(event));
  bridge.setAdapter({
    id: "fake",
    async send(action, params) {
      return { action, params };
    },
  });
  bridge.setConnected(true);
  await bridge.emit({ id: 1 });
  const result = await bridge.send("send_group_msg", { group_id: 1 });
  assert.equal(seen.length, 1);
  assert.equal(result.action, "send_group_msg");
  assert.equal(bridge.status().connected, true);
  await bridge.dispose();
  assert.equal(bridge.status().adapter, null);
});
