# Electron 架构迁移设计

## 背景

Developer Control Center 的产品行为、领域模型、MVP 范围和测试缝已经确认，但原技术方案依赖 Tauri 2 与 Rust。本地实现环境尚未安装 Rust 工具链，项目也尚未产生任何实现代码，因此现在是替换基础架构且不承担代码迁移成本的最后窗口。

本设计将桌面架构改为 Electron + React + TypeScript，并由 Node.js 主进程完全替代 Rust 本地核心。项目配置协议、用户行为、安全边界、支持平台和验收标准保持不变。

## 目标

- 使用单一 TypeScript 技术栈实现桌面界面与本地系统能力。
- 保留已经确认的 Control Center 主要测试缝和 Host Runtime 内部适配缝。
- 维持 macOS 13+ 与 Windows 11 的核心行为一致性。
- 保持 Renderer 沙盒化，防止界面直接获得文件系统、进程或原始 IPC 能力。
- 不引入后台守护进程、Utility Process 或双架构兼容层。

## 考虑过的方案

### 方案一：主进程直接承载 Control Center

Electron 主进程负责桌面生命周期，并直接托管独立的 TypeScript Control Center 模块。React Renderer 通过受限 Preload 接口提交用户意图和订阅事件。

这是选定方案。它在首版中具有最少进程和最短数据路径，同时允许 Control Center 在未来需要时迁移到 Utility Process。

### 方案二：Utility Process 承载 Control Center

Electron 主进程只负责窗口、托盘和 IPC，Utility Process 管理项目运行、SQLite 和日志。它提供更强隔离，但需要额外处理进程间状态同步、Utility Process 崩溃、恢复和打包。

首版不采用该方案，因为当前性能和隔离需求不足以抵消复杂度。

### 方案三：独立 Node.js 后台守护进程

Electron 只作为客户端，守护进程在桌面应用退出后继续管理开发服务。该方案直接违背“显式退出时停止受管服务”的产品语义，并引入安装、升级、认证与后台生命周期问题，因此排除。

## 架构

### React Renderer

Renderer 展示项目列表、项目详情、服务状态、配置表单和运行日志。它不启用 Node 集成，运行在 Electron Renderer 沙盒中，不能直接访问文件系统、环境变量、进程或 Electron 原始接口。

### Preload 接口

Preload 使用 `contextBridge` 暴露少量、明确、类型化的项目操作与事件订阅。它不暴露原始 `ipcRenderer`、任意通道名称、任意路径读取或任意命令执行能力。回调只接收经过转换的业务数据，不接收 Electron 事件对象。

### Electron 主进程

主进程负责窗口、系统托盘、通知、单实例、系统目录选择器和应用退出流程。主进程接收 Renderer 的用户意图，重新验证输入，并调用 Control Center 模块；它不把业务编排散落在 IPC 处理函数中。

### Control Center 模块

Control Center 是界面与自动化测试共享的主要接口，且不导入 Electron。它协调项目注册、项目配置、检测建议、项目运行、开发服务状态、健康检查、端口和运行日志，并返回状态快照、事件与结构化错误。

该模块保留小接口和深实现：调用者只表达项目或服务操作，不需要理解进程树、SQLite、平台信号、日志背压或配置写入细节。

### Node Host Runtime

Host Runtime 是 Control Center 内部的真实适配缝。生产环境使用 Node.js 的进程、文件、网络和操作系统能力，并分别提供 macOS 与 Windows 适配器来处理进程树和停止语义差异。自动化测试使用可控适配器提供进程、端口、时钟、健康响应和受限文件场景。

### 本地持久化

SQLite 继续保存项目注册、本地界面偏好和运行摘要。持续运行日志继续保存为独立限额文件。技术迁移不改变七天或 500 MB 的日志保留规则，也不改变清除历史数据的产品语义。

## 数据流

### 注册开发项目

Renderer 请求添加开发项目，主进程打开系统目录选择器。Control Center 校验并规范化用户选择的目录，Local Metadata Store 保存项目注册，Renderer 接收新的项目快照。Renderer 不提交任意字符串路径来绕过目录选择和注册流程。

### 检测并保存项目配置

Control Center 读取已注册项目内受支持的清单并生成无执行权限的检测建议。Renderer 展示并允许编辑；用户确认后，主进程重新校验模式版本、相对路径、平台覆盖和环境引用，再原子写入 `.devcontrol.toml`。

### 启动项目

Renderer 只提交项目标识、开发服务标识和操作意图。Control Center 加载已校验的项目配置，Run Coordinator 计算服务依赖与当前平台覆盖，Process Supervisor 通过 Host Runtime 启动受管进程。状态事件与有界日志批次随后推送给 Renderer。

## IPC 与安全

- Renderer 启用沙盒与上下文隔离，并关闭 Node 集成。
- Preload 只暴露允许列表中的调用与事件，不暴露原始 Electron IPC。
- 主进程重新验证全部 IPC 输入，不信任 Renderer 已执行的校验。
- Renderer 不能请求读取任意路径、执行临时 Shell 字符串或终止任意 PID。
- 文件操作必须落在已注册开发项目、用户明确选择的环境文件或应用数据目录内。
- 环境变量值、可识别密钥和底层堆栈不得进入普通 IPC 事件。
- 高频运行日志使用有界批次传输；Renderer 变慢时不能造成主进程内存无限增长。

## 错误处理

所有跨进程错误使用统一的结构化结果，至少包含稳定错误代码、受影响项目或开发服务、面向用户的说明和可执行下一步。可选诊断详情必须脱敏。

主进程不能吞掉 Control Center 错误，也不能只向 Renderer 返回底层异常字符串。状态事件必须有序；日志可以批量发送，但每条记录继续保留采集时间和来源服务。

## 测试设计

### 主要行为测试缝

Control Center 模块接口保持为主要测试缝。配置、依赖调度、状态机、超时、健康检查、端口冲突、日志保留和持久化行为都通过用户意图、状态快照、事件和结构化错误验证，不测试内部函数。

Host Runtime 测试适配器只替代系统边界。测试不模拟 Control Center 自己的内部模块，也不读取 SQLite 表来旁路验证行为。

### 桌面集成与验收

Main、Preload 和 Renderer 只保留少量集成测试，验证允许的调用、输入校验、事件转换以及禁用的能力不会泄露给 Renderer。TypeScript 模块和 React 行为使用 Vitest；真实 Electron 关键路径使用 Playwright 的 Electron 支持。

macOS 与 Windows 的 Node Host Runtime 适配器共享一组契约测试。双平台桌面验收继续覆盖添加示例项目、审核检测建议、生成配置、Start All、查看状态和日志、Stop All，并确认没有遗留受管子进程。

## 文档迁移

现有 ADR-0003 保留为历史记录并标记为由新的 Electron 架构 ADR 替代。新 ADR 记录 Electron、TypeScript、Node Host Runtime、Renderer 沙盒和不采用 Utility Process 的首版取舍。

MVP 规格中的 Tauri、Rust、Cargo 和 Rust Host Runtime 描述改为 Electron、Node.js、TypeScript 和 Node Host Runtime。受影响票据同步修改，但产品行为、配置协议、安全边界、阻塞关系和验收标准不变。

文档一致性检查必须确认不存在仍要求安装 Rust、编译 Cargo 或使用 Tauri IPC 的有效需求，才能派发票据 01 实现。

## 非目标

- 不保留 Rust 核心或双技术栈。
- 不实现 Utility Process、后台守护进程或应用退出后的服务托管。
- 不改变 `.devcontrol.toml` 协议、项目运行状态或进程安全边界。
- 不借架构迁移增加产品功能、检测器或平台范围。
- 不开始产品正式命名或视觉重设计。

## 成功标准

- 所有有效规划文档只描述 Electron + TypeScript + Node.js 架构。
- Control Center 与 Host Runtime 两个已批准测试缝保持不变，仅替换实现技术。
- Renderer 无 Node 集成、启用沙盒和上下文隔离，Preload 不暴露原始 IPC。
- 票据 01 可以在现有 Node.js 与 pnpm 环境中按 TDD 开始，无需安装 Rust。
- 原有产品行为、双平台承诺、隐私原则和 MVP 验收标准没有被弱化或扩张。
