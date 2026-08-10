import test from "node:test";
import assert from "node:assert/strict";
import { ApiRouter } from "../src/core/api-router.js";

test("api router dispatches registered routes", async () => {
  const router = new ApiRouter();
  router.get("/api/status", async ({ sendJson }) => {
    sendJson(200, { ok: true });
  });
  let result;
  const handled = await router.dispatch(
    { method: "GET" },
    {},
    { pathname: "/api/status" },
    {
      sendJson: (status, data) => {
        result = { status, data };
      },
    },
  );
  assert.equal(handled, true);
  assert.deepEqual(result, { status: 200, data: { ok: true } });
});
