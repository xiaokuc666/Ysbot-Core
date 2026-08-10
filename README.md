# YSbot Core

YSbot Core 是一个可发布的插件化机器人核心。它负责事件、任务、好奇心、插件和协议桥的调度，不内置 QQ 协议实现、AI 能力或后台 UI。

## 架构

```text
YSbot Core
  ├── EventBus
  ├── CuriosityBus
  ├── TaskStore
  ├── Scheduler
  ├── PluginRegistry
  ├── PluginManager
  ├── ProtocolBridge
  ├── ApiRouter
  ├── ManagementServer
  └── CLI Launcher
```

## 目录

```text
ysbot/
  cli.js
  README.md
  src/
    index.js
    config.js
    logger.js
    server.js
    core/
      event-bus.js
      api-router.js
      task-store.js
      scheduler.js
      plugin-registry.js
      plugin-loader.js
      plugin-manager.js
      plg.js
      protocol-bridge.js
      secrets.js
      curiosity.js
      runtime.js
  docs/
    .env.example
    plugin-dev-guide.md
```

## 启动

Windows 用户可以直接双击：

```text
run.bat
```

也可以使用命令行：

```powershell
npm run cli
```

也可以直接：

```powershell
npm start
```

启动器支持：

```powershell
node cli.js --list
```

`--list` 只扫描环境、插件和探测结果，不启动核心。

## 配置

复制配置模板：

```powershell
Copy-Item docs\.env.example .env
```

关键配置：

- `ONEBOT_WS_URL`：外部协议端 WebSocket 地址
- `MANAGEMENT_HOST` / `MANAGEMENT_PORT`：管理服务器地址
- `MANAGEMENT_USER` / `MANAGEMENT_PASSWORD`：管理登录凭据
- `CURIOSITY_INTERVAL_MS`：好奇心调度周期
- `YSBOT_PLUGIN_DIR`：插件目录
- `YSBOT_PLUGIN_CACHE_DIR`：插件缓存目录
- `YSBOT_DATA_DIR`：数据目录
- `YSBOT_SECRETS_DIR`：插件密钥目录

## 插件

YSbot Core 支持插件目录和 `.plg` 插件包。

插件开发规范见：[docs/plugin-dev-guide.md](docs/plugin-dev-guide.md)

插件类型：

- `motivation`：注入动机
- `capability`：调用外部 API
- `protocol`：接入协议端
- `action`：执行 QQ 动作
- `feedback`：消费反馈
- `policy`：影响决策
- `system`：管理核心

插件清单：

```json
{
  "id": "my-plugin",
  "type": "capability",
  "name": "My Plugin",
  "version": "1.0.0",
  "enabled": true,
  "permissions": {
    "adminOnly": false,
    "enabledGroups": []
  }
}
```

插件上下文：

```js
ctx = {
  config,
  eventBus,
  taskStore,
  registry,
  secrets,
  logger,
  manifest,
  runtime,
  scheduler,
  api,
  pluginManager,
  protocol
}
```

## `.plg` 插件包

`.plg` 是 ZIP 格式：

```text
plugin.plg
  ├── plugin.json
  ├── index.js
  └── assets/
```

核心会：

1. 扫描插件目录
2. 解压到缓存目录
3. 创建插件数据目录
4. 加载插件

## 协议插件

YSbot Core 不内置 OneBot / SnowLuma 实现，而是通过 `ProtocolBridge` 接入协议插件。

协议插件需要提供：

- `init(ctx)`
- `connect()`
- `send(action, params)`
- `dispose()`

## 管理服务器

Core 提供通用的：

- 登录
- 鉴权
- 健康检查
- HTTP 路由注册

后台 UI 和业务 API 不随 Core 发布，由 `system` 插件实现。

## 发布

```powershell
npm pack
```

发布包只包含 Core 代码、CLI、文档和配置模板。

## License

YSbot Core 使用 [MIT License](LICENSE)。

你可以自由使用、修改、分发和商用，但需要保留版权声明，并且不提供任何担保。

Copyright (c) 2026 xiaokuc666
