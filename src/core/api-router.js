export class ApiRouter {
  constructor() {
    this.routes = [];
  }

  get(path, handler) {
    this.routes.push({ method: "GET", path, handler });
  }

  post(path, handler) {
    this.routes.push({ method: "POST", path, handler });
  }

  async dispatch(req, res, url, helpers) {
    const route = this.routes.find(
      (item) => item.method === req.method && item.path === url.pathname,
    );
    if (!route) return false;
    let body = null;
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      body = await this.readJson(req);
    }
    await route.handler({ req, res, url, body, ...helpers });
    return true;
  }

  async readJson(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      const error = new Error("invalid JSON");
      error.statusCode = 400;
      throw error;
    }
  }
}
