import fs from "node:fs/promises";
import path from "node:path";

export class SecretsStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  async load(ref) {
    const file = path.join(this.baseDir, `${String(ref || "default")}.json`);
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return {};
    }
  }

  async save(ref, data) {
    const file = path.join(this.baseDir, `${String(ref || "default")}.json`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  }
}
