import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { logger, formatError } from "../logger.js";

const MAX_TASKS = 1000;

export class TaskStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.tasks = [];
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const data = JSON.parse(raw);
      this.tasks = Array.isArray(data) ? data : [];
    } catch {
      this.tasks = [];
      await this.save();
    }
  }

  async add(task) {
    if (task.dueAt !== undefined && Number.isNaN(new Date(task.dueAt).getTime())) {
      throw new Error("dueAt 必须是合法时间");
    }
    const now = new Date().toISOString();
    const record = {
      id: randomUUID(),
      status: "pending",
      createdAt: now,
      updatedAt: now,
      ...task,
    };
    this.tasks.push(record);
    if (this.tasks.length > MAX_TASKS) {
      this.tasks = this.tasks.slice(-MAX_TASKS);
    }
    await this.save();
    return record;
  }

  list() {
    return [...this.tasks].sort((a, b) => {
      return String(a.dueAt || "").localeCompare(String(b.dueAt || ""));
    });
  }

  due(now = Date.now()) {
    return this.tasks
      .filter((task) => task.status === "pending")
      .filter((task) => {
        if (!task.dueAt) return true;
        return new Date(task.dueAt).getTime() <= now;
      })
      .sort((a, b) => {
        return String(a.dueAt || "").localeCompare(String(b.dueAt || ""));
      });
  }

  async setStatus(id, status, extra = {}) {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) return null;
    Object.assign(task, {
      status,
      updatedAt: new Date().toISOString(),
      ...extra,
    });
    await this.save();
    return task;
  }

  async save() {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(
        this.filePath,
        JSON.stringify(this.tasks, null, 2),
        "utf8",
      );
    } catch (error) {
      logger.error(`[TaskStore] save failed: ${formatError(error)}`);
    }
  }
}
