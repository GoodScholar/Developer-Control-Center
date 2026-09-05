# 07: 用健康检查形成可信项目状态

**What to build:** HTTP/TCP 健康检查控制服务可用状态、启动超时、健康抖动与恢复，并把服务状态正确聚合为项目运行状态。

**Blocked by:** 06/按依赖关系运行多服务项目

**Status:** ready-for-agent

- [ ] 用户可以为开发服务配置 HTTP 或 TCP 健康检查，并覆盖默认时间参数。
- [ ] 启动阶段默认每秒检查一次，60 秒未达到健康时标记服务失败并阻塞下游。
- [ ] 运行阶段默认每 5 秒检查一次，连续失败三次后进入 Unhealthy。
- [ ] Unhealthy 服务连续成功两次后恢复 Healthy。
- [ ] 配置健康检查的服务只有 Healthy 才满足下游依赖。
- [ ] 项目聚合状态支持 Stopped、Starting、Running、Degraded、Stopping 和 Needs Attention。
- [ ] 任一目标服务 Failed、Unhealthy 或 Blocked 时，仍有服务可用的项目显示 Degraded。
- [ ] 检查阈值、恢复、超时、依赖释放和项目聚合通过可控时钟与响应序列测试。

