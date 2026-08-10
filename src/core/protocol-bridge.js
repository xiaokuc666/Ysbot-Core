export class ProtocolBridge {
  constructor() {
    this.adapter = null;
    this.handlers = [];
    this.connected = false;
  }

  setAdapter(adapter) {
    this.adapter = adapter;
  }

  setConnected(value) {
    this.connected = Boolean(value);
  }

  async emit(event) {
    for (const handler of [...this.handlers]) {
      await handler(event);
    }
  }

  onMessage(handler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((item) => item !== handler);
    };
  }

  async send(action, params = {}) {
    if (!this.adapter) throw new Error("协议插件未加载");
    return this.adapter.send(action, params);
  }

  status() {
    return {
      connected: this.connected,
      adapter: this.adapter ? this.adapter.id || "protocol" : null,
    };
  }

  async dispose() {
    if (this.adapter?.dispose) {
      await this.adapter.dispose();
    }
    this.adapter = null;
    this.handlers = [];
    this.connected = false;
  }
}
