import fs from "node:fs/promises";
import path from "node:path";

export class FrameworkRuntime {
  constructor(filePath = null) {
    this.filePath = filePath;
    this.paused = false;
    this.connected = false;
    this.startedAt = new Date().toISOString();
    this.stats = {
      messages: 0,
      tasksCreated: 0,
      tasksDone: 0,
      decisions: 0,
    };
  }

  async init() {
    if (!this.filePath) return;
    try {
      const data = JSON.parse(await fs.readFile(this.filePath, "utf8"));
      this.paused = Boolean(data.paused);
      this.startedAt = data.startedAt || this.startedAt;
      this.stats = { ...this.stats, ...(data.stats || {}) };
    } catch {
      await this.save();
    }
  }

  async save() {
    if (!this.filePath) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.snapshot(), null, 2), "utf8");
  }

  setConnected(value) {
    this.connected = Boolean(value);
  }

  async setPaused(value) {
    this.paused = Boolean(value);
    await this.save();
  }

  bump(name) {
    if (name in this.stats) this.stats[name] += 1;
  }

  snapshot() {
    return {
      paused: this.paused,
      connected: this.connected,
      startedAt: this.startedAt,
      stats: { ...this.stats },
    };
  }
}
