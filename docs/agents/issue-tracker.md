# Issue Tracker：本地 Markdown

本项目的规格与任务以 Markdown 文件形式保存在 `.scratch/` 中。

## 约定

- 每个功能使用独立目录：`.scratch/<feature-slug>/`
- 规格文件：`.scratch/<feature-slug>/spec.md`
- 实现票据：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- 票据从 `01` 开始编号，每个任务单独一个文件
- Triage 状态记录在文件顶部附近的 `Status:` 字段
- 评论和讨论追加到文件底部的 `## Comments` 部分

## 发布任务

当技能要求“发布到 Issue Tracker”时，在 `.scratch/<feature-slug>/` 下创建相应文件。

## 获取任务

读取用户指定路径或编号对应的票据文件。

## Wayfinder 操作

- 决策地图：`.scratch/<effort>/map.md`
- 子票据：`.scratch/<effort>/issues/NN-<slug>.md`
- 类型字段：`Type: research|prototype|grilling|task`
- 状态字段：`Status: claimed|resolved`
- 依赖字段：`Blocked by: NN, NN`
- 所有依赖均为 `resolved` 时，票据解除阻塞
- 领取任务时先写入 `Status: claimed`
- 完成时追加 `## Answer`，将状态设为 `resolved`，并在地图中记录结论与链接
