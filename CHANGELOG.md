# Changelog

## [0.2.4] - 2026-08-11

### Added

- 新增 Core PermissionService，插件可以通过 `ctx.permissions` 声明和执行基础权限。
- 插件清单权限字段扩展：`disabledGroups`、`allowedUsers`、`blockedUsers`、`requiredRoles`。
- Core 在 capability/action `invoke` 和 feedback `consume` 入口自动执行权限检查。

### Changed

- `PluginConfigStore.get()` 不再静默吞掉损坏的 JSON 配置，会抛出明确的 `CONFIG_CORRUPTED` 错误。
- 移除了插件后台页面的无 token GET 放行，特殊页面必须带管理端 Bearer token 访问。
- `ctx.pluginConfig` 和 `ctx.permissions` 已加入插件开发文档。

### Fixed

- 修复配置文件损坏时被当作空配置覆盖的问题。
- 修复插件后台页面无需登录即可直接拉取 HTML 的问题。

## [0.2.3] - 2026-08-10

### Added

- 新增 `PluginConfigStore`，插件可读写普通配置和独立密钥。
- 插件上下文新增 `ctx.pluginConfig`。
- 管理后台本机放行 admin-console 静态资源和插件特殊页面，数据 API 仍要求登录。

### Changed

- 更新插件开发文档，补充插件配置接口说明。

## [0.2.2] - 2026-08-10

### Changed

- 更改了包体结构，现在更加合理了。
- README 调整为适合公开发布的用户文档。
