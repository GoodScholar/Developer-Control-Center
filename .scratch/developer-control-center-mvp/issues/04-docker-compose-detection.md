# 04: 从 Docker Compose 生成检测建议

**What to build:** 同一检测审核流程可以识别 Docker Compose 配置，把 Compose 栈作为外部命令管理的候选开发服务合并进项目配置，而不直接管理容器、镜像、卷或网络。

**Blocked by:** 03/从 package.json 生成检测建议

**Status:** ready-for-agent

- [ ] 注册包含受支持 Docker Compose 文件的开发项目时，应用生成 Compose 检测建议。
- [ ] 建议以外部 Docker Compose 命令表示开发服务，不把单个容器暴露为受管进程模型。
- [ ] Node 与 Docker Compose 建议可以在同一审核界面中编辑并合并。
- [ ] 用户确认前不调用 Docker，也不创建、启动或修改任何容器资源。
- [ ] Docker 工具缺失时，应用展示修复说明但不自动安装。
- [ ] 用户确认后生成的项目配置通过统一模式校验。
- [ ] 示例混合项目覆盖检测、确认和无 Docker 环境下的行为测试。

