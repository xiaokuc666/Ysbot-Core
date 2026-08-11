import test from "node:test";
import assert from "node:assert/strict";
import { ApiRouter } from "../src/core/api-router.js";
import { ManagementServer } from "../src/server.js";

test("plugin admin page requires a bearer token", async (t) => {
  const apiRouter = new ApiRouter();
  apiRouter.get("/api/plugins/demo/admin/index.html", async ({ sendHtml }) => {
    sendHtml(200, "<html>ok</html>");
  });
  const server = new ManagementServer({
    apiRouter,
    config: {
      managementHost: "127.0.0.1",
      managementPort: 0,
      managementUser: "admin",
      managementPassword: "12345678",
    },
  });
  await server.start();
  t.after(() => server.stop());

  const base = `http://127.0.0.1:${server.port}`;
  const denied = await fetch(`${base}/api/plugins/demo/admin/index.html`);
  assert.equal(denied.status, 401);

  const login = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "12345678" }),
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const allowed = await fetch(`${base}/api/plugins/demo/admin/index.html`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), "<html>ok</html>");
});
