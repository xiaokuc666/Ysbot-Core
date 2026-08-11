import http from "node:http";
import { randomBytes } from "node:crypto";
import { logger, formatError } from "./logger.js";

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const PUBLIC_ADMIN_PATHS = new Set([
  "/api/admin-console/ui",
  "/api/admin-console/app.js",
  "/api/admin-console/style.css",
  "/api/admin-console/design-tokens.css",
]);

export class ManagementServer {
  constructor({ config, apiRouter }) {
    this.config = config;
    this.apiRouter = apiRouter;
    this.tokens = new Map();
    this.server = null;
  }

  async start() {
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((error) => {
        const status = error.statusCode || 500;
        this.sendJson(res, status, { error: formatError(error) });
      });
    });
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(
        this.config.managementPort,
        this.config.managementHost,
        () => {
          this.port = this.server.address().port;
          resolve();
        },
      );
    });
    logger.info(
      `[Server] listening http://${this.config.managementHost}:${this.port}`,
    );
  }

  async stop() {
    if (!this.server) return;
    await new Promise((resolve) => this.server.close(resolve));
    this.server = null;
  }

  async handle(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/") {
      this.sendHtml(res, 200, this.fallbackHtml());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      this.sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/login") {
      await this.handleLogin(req, res);
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      this.sendJson(res, 404, { error: "not found" });
      return;
    }
    if (req.method === "GET" && PUBLIC_ADMIN_PATHS.has(url.pathname)) {
      const handled = await this.apiRouter.dispatch(req, res, url, {
        sendJson: (status, data) => this.sendJson(res, status, data),
        sendHtml: (status, html) => this.sendHtml(res, status, html),
      });
      if (!handled) {
        this.sendJson(res, 404, { error: "not found" });
      }
      return;
    }
    if (!this.checkToken(req)) {
      this.sendJson(res, 401, { error: "unauthorized" });
      return;
    }
    const handled = await this.apiRouter.dispatch(req, res, url, {
      sendJson: (status, data) => this.sendJson(res, status, data),
      sendHtml: (status, html) => this.sendHtml(res, status, html),
    });
    if (!handled) {
      this.sendJson(res, 404, { error: "not found" });
    }
  }

  async handleLogin(req, res) {
    this.pruneTokens();
    const body = await this.apiRouter.readJson(req);
    if (
      body?.username !== this.config.managementUser ||
      body?.password !== this.config.managementPassword
    ) {
      this.sendJson(res, 401, { error: "用户名或密码错误" });
      return;
    }
    const token = randomBytes(24).toString("hex");
    this.tokens.set(token, Date.now() + TOKEN_TTL_MS);
    this.sendJson(res, 200, { token });
  }

  checkToken(req) {
    this.pruneTokens();
    const header = String(req.headers.authorization || "");
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return false;
    const expires = this.tokens.get(match[1]);
    if (!expires || expires < Date.now()) {
      this.tokens.delete(match[1]);
      return false;
    }
    return true;
  }

  pruneTokens() {
    const now = Date.now();
    for (const [token, expires] of this.tokens) {
      if (expires < now) this.tokens.delete(token);
    }
    if (this.tokens.size > 500) {
      const sorted = [...this.tokens.entries()].sort((a, b) => a[1] - b[1]);
      const removeCount = this.tokens.size - 500;
      for (const [token] of sorted.slice(0, removeCount)) {
        this.tokens.delete(token);
      }
    }
  }

  fallbackHtml() {
    return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>YSbot</title>
<h1>YSbot</h1>
<p>管理后台页面缺失，请检查 src/ui.html。</p>`;
  }

  sendJson(res, status, data) {
    const body = JSON.stringify(data, null, 2);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    });
    res.end(body);
  }

  sendHtml(res, status, html) {
    res.writeHead(status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(html);
  }
}
