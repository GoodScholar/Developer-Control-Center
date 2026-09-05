# 采用 Electron 与 TypeScript 本地核心

## Decision

Developer Control Center 使用 Electron 承载 React、TypeScript 和 Vite 界面，并由 Electron 主进程直接托管不依赖 Electron 的 TypeScript Control Center 模块。Node Host Runtime 负责进程、文件、端口和网络能力；Renderer 保持沙盒化，只能通过受限 Preload 接口操作项目，以单一 TypeScript 技术栈替代原 Tauri 与 Rust 方案。

## Consequences

Main、Preload 和 Renderer 之间只传递可序列化请求、快照、事件和结构化错误。Control Center 不导入 Electron，因此 UI 与自动化测试可以使用同一接口，未来也可以在不改变领域接口的前提下迁移进程边界。

## Alternatives considered

- Electron Utility Process：首版不采用，因为它会立即引入额外进程生命周期、序列化和故障恢复复杂度，而项目注册闭环不需要这种隔离；Control Center 的深接口保留未来迁移空间。
- 独立本地守护进程：首版不采用，因为安装、升级、单实例和通信成本超出个人开发者 MVP 的必要范围。
