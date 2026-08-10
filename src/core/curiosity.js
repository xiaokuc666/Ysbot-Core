import { logger } from "../logger.js";
import fs from "node:fs/promises";
import path from "node:path";

export class CuriosityBus {
  constructor({ eventBus, stateFile = null }) {
    this.eventBus = eventBus;
    this.stateFile = stateFile;
    this.lastMotivationAt = new Map();
    this.decisionHandler = null;
  }

  async init() {
    if (!this.stateFile) return;
    try {
      const raw = await fs.readFile(this.stateFile, "utf8");
      const data = JSON.parse(raw);
      for (const [key, value] of Object.entries(data || {})) {
        this.lastMotivationAt.set(key, Number(value) || 0);
      }
    } catch {
      await this.save();
    }
    this.prune();
  }

  prune() {
    const maxAge = 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const [key, value] of this.lastMotivationAt) {
      if (now - value > maxAge) this.lastMotivationAt.delete(key);
    }
  }

  async save() {
    if (!this.stateFile) return;
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    await fs.writeFile(
      this.stateFile,
      JSON.stringify(Object.fromEntries(this.lastMotivationAt), null, 2),
      "utf8",
    );
  }

  submit(motivation) {
    return this.process(motivation);
  }

  onDecision(handler) {
    this.decisionHandler = handler;
  }

  async process(motivation) {
    if (!motivation?.type) return null;
    const key = `${motivation.groupId || "global"}:${motivation.type}`;
    const last = this.lastMotivationAt.get(key) || 0;
    const cooldown = Number(motivation.cooldownMs || 0);
    if (Date.now() - last < cooldown) {
      logger.debug(`[Curiosity] ${key} cooled down`);
      return null;
    }
    this.eventBus.emit("curiosity.motivation", motivation);
    this.lastMotivationAt.set(key, Date.now());
    this.prune();
    await this.save();
    const decision = {
      shouldAct: motivation.shouldAct !== false,
      motivation,
      decidedAt: new Date().toISOString(),
    };
    if (this.decisionHandler) {
      await this.decisionHandler(decision);
    }
    this.eventBus.emit("curiosity.decision", decision);
    return decision;
  }
}
