import { logger, formatError } from "../logger.js";

export class Scheduler {
  constructor({ taskStore, tickMs = 10000, isPaused = () => false }) {
    this.taskStore = taskStore;
    this.tickMs = tickMs;
    this.isPaused = isPaused;
    this.timer = null;
    this.running = false;
    this.ticking = false;
  }

  start(handler) {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      this.tick(handler).catch((error) => {
        logger.error(`[Scheduler] tick failed: ${formatError(error)}`);
      });
    }, this.tickMs);
    logger.info(`[Scheduler] started, tick=${this.tickMs}ms`);
  }

  async tick(handler) {
    if (this.isPaused() || this.ticking) return;
    this.ticking = true;
    try {
      const due = this.taskStore.due();
      for (const task of due) {
        await this.taskStore.setStatus(task.id, "running");
        try {
          await handler(task);
          await this.taskStore.setStatus(task.id, "done", {
            finishedAt: new Date().toISOString(),
          });
        } catch (error) {
          logger.error(`[Scheduler] task ${task.id} failed: ${formatError(error)}`);
          await this.taskStore.setStatus(task.id, "failed", {
            error: formatError(error),
          });
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
