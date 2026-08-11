# YSbot 插件开发指南

## 插件目录

插件可以放在 Core 配置的插件目录中，默认是：

```text
plugins/
```

支持两种形式：

```text
plugins/
  my-plugin/
    plugin.json
    index.js

plugins/
  my-plugin.plg
```

## 插件工作目录

Core 会为每个插件创建独立数据目录：

```text
data/plugins/<pluginId>/
```

插件运行时可以通过上下文拿到：

```js
ctx.pluginDir   // 插件源码/缓存目录
ctx.cacheDir    // 插件缓存目录
ctx.dataDir     // 插件数据目录
ctx.sourceType  // directory 或 plg
```

插件自己的配置、缓存、临时文件都应该写入 `ctx.dataDir`，不要污染 Core 目录。

## 插件清单

每个插件必须有 `plugin.json`：

```json
{
  "id": "my-plugin",
  "type": "capability",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "插件说明",
  "enabled": true,
  "role": "admin",
  "dependencies": [
    "base-plugin"
  ],
  "permissions": {
    "mode": "manifest",
    "adminOnly": false,
    "enabledGroups": [],
    "disabledGroups": [],
    "allowedUsers": [],
    "blockedUsers": [],
    "requiredRoles": []
  },
  "inputSchema": {},
  "outputSchema": {}
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 全局唯一插件 ID |
| `type` | 是 | 插件类型 |
| `name` | 否 | 显示名称 |
| `version` | 是 | 插件版本 |
| `description` | 否 | 插件说明 |
| `enabled` | 否 | 默认 `true` |
| `role` | 否 | 例如 `admin` |
| `dependencies` | 否 | 前置插件 ID 数组 |
| `permissions.mode` | 否 | `manifest`、`allow-all` 或 `deny-all` |
| `permissions.adminOnly` | 否 | 是否仅管理员可用 |
| `permissions.enabledGroups` | 否 | 可用群列表 |
| `permissions.disabledGroups` | 否 | 禁用的群列表 |
| `permissions.allowedUsers` | 否 | 允许的用户 ID 列表 |
| `permissions.blockedUsers` | 否 | 禁止的用户 ID 列表 |
| `permissions.requiredRoles` | 否 | 必须至少拥有其中一个角色 |
| `inputSchema` | 否 | 输入 JSON Schema |
| `outputSchema` | 否 | 输出 JSON Schema |

## 插件类型

| 类型 | 作用 |
| --- | --- |
| `motivation` | 注入动机 |
| `capability` | 调用外部 API |
| `protocol` | 接入协议端 |
| `action` | 执行 QQ 动作 |
| `feedback` | 消费反馈 |
| `policy` | 影响决策 |
| `system` | 管理核心 |

## 前置插件

如果插件依赖其他插件，在 `plugin.json` 中声明：

```json
{
  "id": "app-plugin",
  "type": "capability",
  "dependencies": [
    "base-plugin"
  ]
}
```

Core 加载完所有插件后会检查依赖：

- 前置插件存在且状态为 `ready`：通过。
- 前置插件不存在、禁用或加载失败：当前插件会被标记为失败并卸载。

## 权限模型

Core 通过 `ctx.permissions` 提供基础权限服务：

```js
await ctx.permissions.can("my-plugin", request);
await ctx.permissions.assert("my-plugin", request);
ctx.permissions.snapshot("my-plugin");
```

权限请求示例：

```js
{
  actor: {
    id: "3512730060",
    origin: "qq",
    admin: false,
    roles: ["member"]
  },
  scene: {
    type: "group",
    id: "957302634"
  },
  resource: {
    pluginId: "my-plugin",
    action: "invoke"
  }
}
```

规则判断顺序：

1. `mode` 为 `deny-all` 时直接拒绝。
2. `blockedUsers` 命中时拒绝。
3. `adminOnly` 且非管理员时拒绝。
4. 群黑名单命中时拒绝。
5. `enabledGroups` 非空且当前群不在列表时拒绝。
6. `allowedUsers` 非空且当前用户不在列表时拒绝。
7. `requiredRoles` 非空且角色不匹配时拒绝。

插件没有声明限制时默认允许；声明了限制但请求缺少 `actor` 或 `scene` 时默认拒绝。管理端身份使用 `ctx.permissions.managementActor()`，不和 QQ 用户身份混用。

Core 会在 capability/action 的 `invoke` 和 feedback 的 `consume` 入口自动检查权限，插件内部主动调用其他能力时也可以使用 `ctx.permissions.assert()`。

管理端还可以读取和修改运行时权限覆盖：

```js
ctx.permissions.listOverrides();
ctx.permissions.snapshotAll();
ctx.permissions.setOverride(
  "my-plugin",
  { enabledGroups: ["957302634"] },
  ctx.permissions.managementActor(),
);
ctx.permissions.clearOverride("my-plugin", ctx.permissions.managementActor());
```

## 插件实现

每个插件目录需要 `index.js`：

```js
export default class MyPlugin {
  async init(ctx) {}

  async invoke(params, context) {}

  async dispose() {}
}
```

按类型扩展：

- `motivation`：实现 `async poll(ctx)`
- `capability`：实现 `async invoke(params, ctx)`
- `protocol`：实现 `connect()` / `send()` / `dispose()`
- `action`：实现 `async execute(action, ctx)`
- `feedback`：实现 `async consume(event, ctx)`
- `policy`：实现 `async decide(context)`

## 插件上下文

插件初始化时接收 `ctx`：

```js
ctx = {
  config,
  eventBus,
  taskStore,
  registry,
  secrets,
  pluginConfig,
  permissions,
  logger,
  manifest,
  runtime,
  scheduler,
  api,
  pluginManager,
  protocol,
  pluginDir,
  cacheDir,
  dataDir,
  sourceType
}
```

## 数据目录规范

插件应只在自己的数据目录中写文件：

```js
import fs from "node:fs/promises";

await fs.mkdir(ctx.dataDir, { recursive: true });
await fs.writeFile(`${ctx.dataDir}/cache.json`, "{}");
```

不要写：

- `src/`
- `cli.js`
- Core 配置文件
- 其他插件的 `dataDir`

## 插件配置

插件可以通过 `ctx.pluginConfig` 读写普通配置和密钥。

普通配置保存在插件的数据目录：

```text
data/plugins/<pluginId>/config.json
```

密钥保存在独立的密钥目录：

```text
data/secrets/<pluginId>.json
```

接口：

```js
await ctx.pluginConfig.get(pluginId, schema);
await ctx.pluginConfig.set(pluginId, values, schema);
await ctx.pluginConfig.reset(pluginId, schema);
await ctx.pluginConfig.validate(pluginId, values, schema);

await ctx.pluginConfig.getSecret(pluginId, key);
await ctx.pluginConfig.hasSecret(pluginId, key);
await ctx.pluginConfig.setSecret(pluginId, key, value);
await ctx.pluginConfig.clearSecret(pluginId, key);
```

schema 支持：

- `string`
- `number`
- `integer`
- `boolean`
- `enum`
- `minimum`
- `maximum`
- `default`
- `required`

## `.plg` 插件包

`.plg` 是 ZIP 格式：

```text
my-plugin.plg
  ├── plugin.json
  ├── index.js
  └── assets/
```

Core 会：

1. 校验 `plugin.json`
2. 解压到缓存目录
3. 创建数据目录
4. 加载插件

## 热重载与数据清理

管理插件可以通过 `ctx.pluginManager` 调用：

```js
await ctx.pluginManager.reloadPlugin("my-plugin");
await ctx.pluginManager.clearPluginData("my-plugin");
```

## 安全

- 插件本质是代码，只允许本地可信插件。
- 不要远程自动安装未知插件。
- API Key 写入 `data/secrets/<authRef>.json`，不要写进 `plugin.json`。
