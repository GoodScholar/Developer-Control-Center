# 采用 Tauri Web UI 与 Rust 本地核心

桌面应用采用 Tauri 2 承载 React、TypeScript 和 Vite 构建的 Web UI，并由 Rust 核心负责进程、端口、健康检查和日志采集。SQLite 保存本地元数据与运行摘要，持续运行日志保存为独立的限额文件；这一分层兼顾双平台界面开发效率、本地系统能力、安全边界和日志吞吐。
