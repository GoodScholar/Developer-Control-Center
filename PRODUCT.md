# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Electron、React、TypeScript、Vite；Electron 主进程托管独立 TypeScript Control Center，Node Host Runtime 提供本地系统能力。

## Users

主要用户是需要同时启动、观察和停止多个本地开发服务的个人全栈开发者。

## Product Purpose

Developer Control Center 将一个仓库相关的长驻开发服务作为项目统一管理，让开发者从一个桌面界面完成项目注册、服务编排、状态观察和日志查看。成功意味着在 macOS 与 Windows 上提供一致、可预测、可恢复的本地开发控制体验。

## Positioning

项目将可共享的仓库配置与仅属于当前开发者的本地运行元数据分离，并通过一个不依赖 Electron 的 Control Center 接口同时服务桌面 UI 与自动化测试。

## Operating Context

应用运行在开发者自己的 macOS 13+ 或 Windows 11 设备上，管理本地仓库、进程、端口、HTTP/TCP 健康检查和有界日志。用户从项目列表进入项目详情，并通过明确操作控制服务；应用不代替终端完成一次性任务。

## Capabilities and Constraints

- 仓库配置文件为 `.devcontrol.toml`，首版 schema version 为 1。
- 本地元数据使用 SQLite，连续日志使用独立有界文件。
- Renderer 保持沙盒化，只能通过窄 Preload 接口发出已定义意图。
- 默认无账户、无云后端、无遥测、无管理员或 root 权限。
- MVP 不包含 Agent/worktree、一次性任务、PTY 输入、容器管理、环境安装器、自动重启或自动更新安装。

## Brand Commitments

Developer Control Center 是工作名称。产品为 Apache-2.0 开源项目；首版界面使用英文并跟随系统明暗主题。正式命名和视觉重设计尚未开始。

## Evidence on Hand

当前证据是仓库内规格、ADR 和本地 Markdown 票据；没有可引用的客户、性能基准、品牌资产或商业主张，不得编造。

## Product Principles

- Local first：项目数据和运行能力保留在开发者设备上。
- Explicit control：不自动重启服务，不自动终止外部进程。
- Repository truth：可共享配置属于仓库，本机偏好和运行摘要属于本地数据库。
- Observable behavior：UI 与测试通过相同 Control Center 接口观察状态与错误。
- Cross-platform parity：macOS 与 Windows 的核心行为保持一致。

## Accessibility & Inclusion

核心导航和操作必须支持键盘，并提供清晰焦点状态；界面跟随系统明暗主题。
