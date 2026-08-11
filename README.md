# YSbot Core

YSbot Core 是一个插件化机器人运行时框架，用于调度事件、任务、好奇心、插件和协议桥。

## 安装

```powershell
npm install @xiaokuc/ysbot
```

## 快速开始

Windows 可以直接双击：

```text
run.bat
```

或者使用命令行启动器：

```powershell
npm run cli
```

也可以直接启动核心：

```powershell
npm start
```

查看环境、插件和协议探测结果：

```powershell
node cli.js --list
```

## 配置

复制配置模板：

```powershell
Copy-Item docs\.env.example .env
```

主要配置：

- `ONEBOT_WS_URL`：外部协议端 WebSocket 地址
- `MANAGEMENT_HOST` / `MANAGEMENT_PORT`：管理服务器地址
- `MANAGEMENT_USER` / `MANAGEMENT_PASSWORD`：管理登录凭据
- `CURIOSITY_INTERVAL_MS`：好奇心调度周期
- `YSBOT_PLUGIN_DIR`：插件目录
- `YSBOT_PLUGIN_CACHE_DIR`：插件缓存目录
- `YSBOT_DATA_DIR`：数据目录
- `YSBOT_SECRETS_DIR`：插件密钥目录
- `YSBOT_PLUGIN_DATA_DIR`：插件数据目录

## 插件

YSbot Core 支持插件目录和 `.plg` 插件包。

插件类型：

- `motivation`：注入动机
- `capability`：调用外部 API
- `protocol`：接入协议端
- `action`：执行 QQ 动作
- `feedback`：消费反馈
- `policy`：影响决策
- `system`：管理核心

插件开发规范见：

```text
docs/plugin-dev-guide.md
```

## 权限

Core 内置基础 PermissionService，插件可以通过 `ctx.permissions` 声明和执行权限规则。

`plugin.json` 的 `permissions` 支持：

- `adminOnly`：仅管理员可用
- `enabledGroups` / `disabledGroups`：群白名单 / 黑名单
- `allowedUsers` / `blockedUsers`：用户白名单 / 黑名单
- `requiredRoles`：必需角色

管理端身份和 QQ 用户身份分离，权限覆盖只能由管理端身份修改。

## 协议

YSbot Core 不内置 OneBot / SnowLuma 实现，通过协议插件接入。

协议插件需要提供：

- `init(ctx)`
- `connect()`
- `send(action, params)`
- `dispose()`

## License

YSbot Core 使用 [MIT License](LICENSE)。

Copyright (c) 2026 xiaokuc666
