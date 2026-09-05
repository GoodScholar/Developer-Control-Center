# 票据 02：可移植项目配置设计

**日期：** 2026-09-05
**状态：** 已确认，待实施
**关联票据：** `.scratch/developer-control-center-mvp/issues/02-portable-project-configuration.md`

## 1. 目标

本设计为已注册的开发项目增加一个安全、可移植的项目配置创建闭环。用户在桌面界面中通过结构化表单定义一个长期运行的开发服务，先预览完整 `.devcontrol.toml`，再通过明确确认在开发项目根目录中创建文件。

该闭环必须满足以下结果：

- 生成带 `schema_version = 1` 的仓库内项目配置；
- 同一份配置以共享默认值配合 `macos`、`windows` 局部覆盖表达平台差异；
- 所有文件系统路径保持项目根目录相对路径，不允许逃逸项目；
- Shell 模式默认关闭，只有用户显式勾选才写为 `true`；
- 已存在 `.devcontrol.toml` 时绝不覆盖；
- 配置语法、业务模式和错误脱敏集中在不依赖 Electron 的 Control Center 配置模块中；
- Renderer 不提交项目根路径，不读取 `.env`，也不获得任意文件或 IPC 能力。

## 2. 范围

### 2.1 本票据范围

- 为一个已注册且目录可用的开发项目手动定义一个开发服务。
- 提供服务 ID、程序、参数、工作目录、非敏感环境值、`.env` 文件引用、Shell 开关和 macOS/Windows 覆盖表单。
- 生成、校验、规范化并序列化 schema v1 配置。
- 在确认前显示完整、只读 TOML 预览。
- 以仅创建语义写入项目根目录的 `.devcontrol.toml`。
- 为配置模块、项目注册查找、Host Runtime、Control Center、IPC、Renderer 和真实 Electron 流程建立行为测试。
- 在现有 macOS 14 与 Windows 2025 CI 矩阵中运行完整检查。

### 2.2 非范围及后续票据边界

- **票据 03、04：** `package.json` 与 Docker Compose 检测，以及由检测建议填充草稿。本票据只接受用户手动输入，不扫描项目文件。
- **票据 05：** 解析配置后启动单个开发服务、加载 `.env` 内容、采集日志。本票据只保存 `.env` 相对引用，绝不读取其内容，也不执行命令。
- **票据 06：** 多服务编辑、服务依赖、依赖图和循环检测。本票据的文件格式允许 `services` 键控表，但界面与创建意图只提交一个服务；不实现依赖字段。
- **票据 07、08：** 健康检查、项目状态、预期端口和浏览器入口；schema v1 本次不定义这些字段。
- **票据 09：** 已有配置读取、外部编辑器打开、配置修改、文件监视、热重载和运行中服务重启提示。本票据发现已有 `.devcontrol.toml` 时直接拒绝，不读取或编辑它。
- **票据 10—12：** 合并日志、桌面驻留、诊断包和历史数据控制。
- 不提供内置 TOML 编辑器、迁移器、自动修复、秘密检测器或自定义 Schema 引擎。
- 不创建或修改 Git remote，不推送分支，不修改任何票据状态。

## 3. 设计原则与模块划分

采用“深配置模块 + 窄桌面适配”。复杂度集中在 Control Center 内部，桌面层只表达两个固定用户意图。

```text
Renderer form
  │ projectId + structured draft
  ▼
Preload: projectConfigurations.preview/create
  │ fixed IPC channels
  ▼
Main: trusted-sender check + error serialization
  ▼
ControlCenter
  ├─ ProjectRegistry.get(projectId)
  ├─ HostRuntime.inspectProjectDirectory(storedRootPath)
  ├─ Project Configuration module
  │    parse(source)
  │    build preview(draft)
  └─ HostRuntime.createProjectConfiguration(canonicalRootPath, source)
```

职责如下：

- **项目配置模块：** 将 `smol-toml` 的通用语法能力包在自有业务模式之后；负责解析、未知字段检查、业务校验、规范化和确定性序列化。它不导入 Electron，不访问文件系统，不记录输入。
- **Control Center：** 接收 `projectId + draft` 意图；解析项目身份、确认目录当前可用、调用配置模块，并在创建时协调 Host Runtime。它是 UI 和行为测试共享的主要接口。
- **ProjectRegistry：** 只保存和查找本地项目注册，不判断目录状态，也不读项目文件。
- **Host Runtime：** 承担真实文件系统能力。Node 适配器只可在 Control Center 提供的已注册、已复核根目录下独占创建固定文件名。
- **Main/Preload：** 只注册固定通道、校验 sender、校验 IPC 载荷外形并序列化结果；不复制配置业务规则。
- **Renderer：** 管理表单、预览失效和页面状态；不推导路径、不生成 TOML、不判断配置是否合法。

[`smol-toml`](https://github.com/squirrelchat/smol-toml) 仅作为纯 TOML 解析与序列化依赖，不固定文档中的依赖版本。其异常文本和解析结果均视为不可信的基础库输出：异常文本不得直接跨越 Control Center 接口，解析结果必须经过自有 schema 校验。

## 4. `.devcontrol.toml` schema v1

### 4.1 完整示例

```toml
schema_version = 1

[services.web]
program = "pnpm"
args = ["dev", "--host", "127.0.0.1"]
working_directory = "apps/web"
shell = false
env_files = [".env", "apps/web/.env.local"]

[services.web.env]
NODE_ENV = "development"
PORT = "3000"

[services.web.macos]
args = ["dev", "--host", "127.0.0.1", "--watch"]

[services.web.macos.env]
WATCH_MODE = "native"

[services.web.windows]
program = "pnpm.cmd"
args = ["dev", "--host", "127.0.0.1", "--watch"]

[services.web.windows.env]
WATCH_MODE = "poll"
```

`web` 是稳定的服务 ID，而不是展示名称或数组位置。未来增加服务时添加新的 `[services.<service-id>]`，已有服务 ID 不因排序或显示文本变化而改变。

### 4.2 顶层规则

| 字段 | 类型 | 必需 | 规则 |
| --- | --- | --- | --- |
| `schema_version` | TOML integer | 是 | 只接受数值 `1`；字符串 `"1"`、浮点数及其他版本均拒绝。 |
| `services` | table | 是 | 至少包含一个服务；本票据生成且 UI 管理恰好一个服务。 |

顶层只允许 `schema_version` 与 `services`。schema v1 不接受未知字段，以免拼写错误被静默忽略并在执行阶段产生意外行为。

本设计发生在首个公开 Alpha 之前。票据 02 先实现 schema v1 的单服务创建切片；票据 06—08 会在首次公开发布前补齐同一 schema v1 的依赖、健康检查和预期端口字段。中间开发提交不构成已发布协议兼容承诺；从票据 14 发布首个 Alpha 起，任何会被既有严格解析器拒绝的字段扩展都必须提升 `schema_version`，不得在已发布的 v1 中静默追加。

### 4.3 服务 ID

- 长度为 1—64 个 ASCII 字符。
- 必须匹配 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`。
- 只允许小写字母、数字和单个连字符分段；必须以字母开头，不能以连字符结尾或出现连续连字符。
- 在 `services` 中唯一；TOML 重复 key 本身属于语法错误。
- 规范化不会擅自改写 ID。表单可以去除输入框首尾空白后提交，但配置模块对收到的值按原值验证。

### 4.4 共享服务字段

| 字段 | 类型 | 必需/默认 | 规则 |
| --- | --- | --- | --- |
| `program` | string | 必需 | 去除首尾空白后必须非空，规范化结果使用去除后的值；不得含 NUL、CR 或 LF。它是结构化可执行程序名或项目内相对程序路径，不是完整 Shell 命令。 |
| `args` | array of string | 可选，默认 `[]` | 每项是一个独立参数；允许空字符串和空白，因为它们可能具有命令语义，但不得含 NUL。 |
| `working_directory` | string | 可选，默认 `"."` | 必须满足下述可移植相对路径规则；`"."` 表示项目根目录。 |
| `shell` | boolean | 可选，默认 `false` | 只有 TOML boolean `true` 才启用 Shell；字符串或数字不作真值转换。本票据生成器总是显式写出该字段。 |
| `env_files` | array of string | 可选，默认 `[]` | 每项是一个符合可移植相对路径规则的文件路径；不得为 `"."`；重复项拒绝。文件可以尚不存在，本票据不读取它。 |
| `env` | table of string | 可选，默认 `{}` | key 必须匹配 `^[A-Za-z_][A-Za-z0-9_]*$`；value 必须是字符串，允许空字符串。只用于用户明确判定为非敏感的值。 |
| `macos` | platform override table | 可选 | 只允许 `program`、`args`、`env`。空覆盖表拒绝。 |
| `windows` | platform override table | 可选 | 只允许 `program`、`args`、`env`。空覆盖表拒绝。 |

服务表不接受其他字段。尤其是 `working_directory`、`shell`、`env_files` 不能出现在平台覆盖中；这些值在两端共享，以保持一个明确的项目边界与秘密来源集合。

### 4.5 可移植相对路径

`working_directory` 与 `env_files` 使用同一词法规则：

- 使用 `/` 作为配置分隔符；`\` 一律拒绝，避免 Windows 转义和平台差异。
- 不允许 POSIX 绝对路径、Windows 盘符路径、UNC 路径、`~` 前缀或 URL。
- 除 `working_directory` 可精确等于 `"."` 外，每个路径段必须非空，且不能是 `.` 或 `..`。
- 不允许前导 `/`、尾随 `/` 或连续 `//`。
- NUL、CR 和 LF 一律拒绝。
- 校验是纯词法校验，不解析符号链接、不检查文件是否存在，也不读取文件内容。

这组规则使配置文本本身无法表达项目根目录外的路径。票据 05 真正访问文件时仍必须从已复核的项目根目录安全解析路径，并再次执行根目录包含检查；本票据的词法校验不替代使用时检查。

`program` 另按“程序名或相对程序路径”校验：不含 `/` 或 `\\` 时视为 PATH 中的程序名，例如 `pnpm`、`pnpm.cmd`；一旦包含路径分隔符或匹配绝对路径、盘符、UNC、`~`、URL 形式，就必须按上述可移植相对路径规则处理，因此 `scripts/dev-server` 合法，而 `/usr/bin/node`、`C:\\node.exe`、`../bin/server` 与 `./scripts/server` 均拒绝。平台覆盖中的 `program` 使用相同规则。

`args` 是传给程序的无解释字符串数组。参数可能包含 URL、绝对路径文本或特定工具语法，配置模块无法可靠判断其语义，因此“绝对路径拒绝”只适用于 `working_directory`、`env_files` 和作为路径表达的 `program`，不扫描或改写参数内容。

### 4.6 平台覆盖合并语义

对目标平台计算有效服务配置时：

- `program`：平台值存在时替换共享值，否则继承共享值；
- `args`：平台数组存在时整体替换共享数组，不做拼接；
- `env`：以共享 map 为基础浅合并，平台同名 key 覆盖共享值；
- `working_directory`、`shell`、`env_files`：始终使用共享值。

空字符串、空数组和空环境值均是显式值，不按“缺失”处理。平台覆盖不允许 `null`。

### 4.7 规范化与序列化

- 解析和草稿构建都产生同一种 `ProjectConfigurationV1` 规范化对象，补齐 `args`、`workingDirectory`、`shell`、`envFiles` 和 `env` 默认值。
- 序列化始终输出 UTF-8、LF 换行和一个结尾换行。
- 输出顺序固定为 `schema_version`、按服务 ID 字典序排列的服务；每个服务内按 `program`、`args`、`working_directory`、`shell`、`env_files`、`env`、`macos`、`windows` 排列；环境 key 按字典序排列。
- 本票据只有一个服务，但确定性顺序可以让未来多服务配置获得稳定 diff。
- 不保留源文件注释或原始格式；本票据不读取已有配置，因此不存在格式回写。
- 依赖库只负责合法 TOML 文本与普通 JavaScript 值之间的转换。未知字段、类型、默认值、路径、平台覆盖及敏感信息规则均由自有模块决定。

## 5. TypeScript 领域类型与公开接口

以下定义是实现必须保持一致的公开形状；可以拆分到聚焦文件，但不得改变命名、参数顺序或返回语义。

```ts
export type PlatformName = 'macos' | 'windows'

export interface EnvironmentVariableDraft {
  key: string
  value: string
}

export interface PlatformOverrideDraft {
  program?: string
  args?: string[]
  env?: EnvironmentVariableDraft[]
}

export interface DevelopmentServiceDraft {
  id: string
  program: string
  args: string[]
  workingDirectory: string
  shell: boolean
  envFiles: string[]
  env: EnvironmentVariableDraft[]
  macos?: PlatformOverrideDraft
  windows?: PlatformOverrideDraft
}

export interface ProjectConfigurationDraft {
  service: DevelopmentServiceDraft
}

export interface PlatformOverride {
  program?: string
  args?: readonly string[]
  env?: Readonly<Record<string, string>>
}

export interface DevelopmentServiceConfiguration {
  program: string
  args: readonly string[]
  workingDirectory: string
  shell: boolean
  envFiles: readonly string[]
  env: Readonly<Record<string, string>>
  macos?: PlatformOverride
  windows?: PlatformOverride
}

export interface ProjectConfigurationV1 {
  schemaVersion: 1
  services: Readonly<Record<string, DevelopmentServiceConfiguration>>
}

export interface ProjectConfigurationPreview {
  source: string
}

export interface ProjectConfigurationCreated {
  relativePath: '.devcontrol.toml'
}
```

草稿使用环境变量行数组，以便检测重复 key 并准确关联表单行；规范化配置使用只读 map。`ProjectConfigurationPreview` 只返回完整 TOML 文本，不返回根路径、内部解析树或写入令牌。

项目配置模块是普通 TypeScript 模块，不为单一实现引入假想 adapter seam：

```ts
export function parseProjectConfiguration(source: string): ProjectConfigurationV1

export function buildProjectConfigurationPreview(
  draft: ProjectConfigurationDraft
): ProjectConfigurationPreview
```

- `parseProjectConfiguration` 解析外部 TOML 并执行完整 schema v1 校验；它为票据 09 的读取/热重载保留稳定入口，但本票据生产流程不读取已有文件。
- `buildProjectConfigurationPreview` 校验结构化草稿、规范化为 schema v1，并返回确定性 TOML。
- 两者失败时抛出 `ControlCenterError`，其公开 detail 符合第 6 节；不公开 `smol-toml` 的 AST、异常或类型。

### 5.1 `ProjectRegistry` 扩展

```ts
export interface ProjectRegistry {
  list(): StoredProject[]
  get(projectId: string): StoredProject | null
  insert(project: StoredProject): void
  remove(projectId: string): void
  close(): void
}
```

`get` 按稳定项目 ID 查询本地注册：

- 找到时返回 `StoredProject`；不存在时返回 `null`，不抛业务错误；
- 不接受根路径作为查询条件；
- 不检查目录是否存在，不读取 `.devcontrol.toml`；
- SQLite adapter 使用参数化查询，Test adapter 与其共享相同契约测试。

### 5.2 `HostRuntime` 扩展

```ts
export interface HostRuntime {
  inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory>
  createProjectConfiguration(rootPath: string, source: string): Promise<void>
}
```

`createProjectConfiguration` 的调用前置条件由 Control Center 保证：`rootPath` 来自 `ProjectRegistry` 并已在本次操作中通过 `inspectProjectDirectory` 复核；`source` 已通过配置模块生成。Host Runtime 仍必须只拼接固定文件名 `.devcontrol.toml`，不得接受 Renderer 提供的文件名或目标路径。

### 5.3 `ControlCenter` 扩展

```ts
export class ControlCenter {
  previewProjectConfiguration(
    projectId: string,
    draft: ProjectConfigurationDraft
  ): Promise<ProjectConfigurationPreview>

  createProjectConfiguration(
    projectId: string,
    draft: ProjectConfigurationDraft
  ): Promise<ProjectConfigurationCreated>
}
```

两个方法都按相同顺序执行：

1. 验证 `projectId` 为非空字符串；
2. 调用 `ProjectRegistry.get(projectId)`；
3. 不存在时抛出 `PROJECT_NOT_FOUND`；
4. 用保存的 `rootPath` 调用 `HostRuntime.inspectProjectDirectory`，得到当前规范路径；
5. 调用 `buildProjectConfigurationPreview(draft)` 完整校验并生成文本。

`previewProjectConfiguration` 在第 5 步返回预览，不访问项目配置文件。`createProjectConfiguration` **每次都重新执行以上全部步骤**，不得信任此前预览、Renderer 缓存或隐藏 token；之后把本次得到的规范根路径和文本传给 `HostRuntime.createProjectConfiguration`，成功时返回 `{ relativePath: '.devcontrol.toml' }`。

因此目录在预览后消失、项目被取消注册、草稿发生变化或文件被其他进程创建，都在创建调用中重新判定。

## 6. 校验错误、字段路径与脱敏

### 6.1 公开错误形状

现有 `ActionableError` 增加可选字段路径，并允许项目配置资源：

```ts
export type ConfigFieldPath = string

export interface ActionableError {
  code: string
  resource:
    | { kind: 'project'; id?: string }
    | { kind: 'project_configuration'; projectId?: string }
    | { kind: 'application' }
  fieldPath?: ConfigFieldPath
  message: string
  nextAction: string
}
```

字段路径采用以 `$` 开头的确定性路径：

- 合法服务 ID 使用点记法，例如 `$.services.web.program`；
- 无法作为合法 ID 的原始 key 使用 JSON 字符串括号表示，例如 `$.services["web.api"]`；
- 草稿中尚未形成合法服务 key 的 ID 错误使用 `$.service.id`；
- 环境行的重复 key 指向提交顺序中的后一个位置，例如 `$.service.env[2].key`；
- 纯语法错误指向 `$`，不复用依赖库可能包含源文本的行列异常。

Renderer 只根据已知 `fieldPath` 聚焦或标记字段；未知路径仍显示页级错误，不尝试执行路径表达式。

### 6.2 固定配置错误代码

| Code | 典型 fieldPath | 含义与 next action |
| --- | --- | --- |
| `CONFIG_TOML_INVALID` | `$` | TOML 语法无法解析；提示检查配置语法，不回显源片段。 |
| `CONFIG_SCHEMA_VERSION_REQUIRED` | `$.schema_version` | 缺少模式版本；提示设置为 `1`。 |
| `CONFIG_SCHEMA_VERSION_UNSUPPORTED` | `$.schema_version` | 版本不是 integer `1`；提示使用当前支持版本。 |
| `CONFIG_UNKNOWN_FIELD` | 实际字段路径 | 出现 schema v1 未定义字段；提示移除或更正拼写。 |
| `CONFIG_SERVICES_REQUIRED` | `$.services` | 服务表缺失、类型错误或为空；提示至少定义一个服务。 |
| `CONFIG_SERVICE_ID_INVALID` | `$.service.id` 或实际 key | 服务 ID 不符合稳定 ID 规则；提示允许的格式。 |
| `CONFIG_FIELD_TYPE_INVALID` | 实际字段路径 | 字段 TOML/草稿类型错误；提示使用该字段要求的类型。 |
| `CONFIG_PROGRAM_REQUIRED` | `$.services.<id>.program` | 程序缺失或空白；提示填写一个结构化程序名。 |
| `CONFIG_STRING_CONTAINS_CONTROL_CHARACTER` | 实际字段路径 | 字符串含 NUL、CR 或不允许的 LF；提示移除控制字符。 |
| `CONFIG_PATH_INVALID` | 实际字段路径 | 路径为空、格式非规范或 env file 为 `.`；提示使用 `/` 分隔的项目相对路径。 |
| `CONFIG_PATH_ABSOLUTE` | 实际字段路径 | 路径为 POSIX、盘符、UNC、home 或 URL 形式；提示改为项目相对路径。 |
| `CONFIG_PATH_OUTSIDE_PROJECT` | 实际字段路径 | 路径含 `..`；提示选择项目根目录内路径。 |
| `CONFIG_ENVIRONMENT_KEY_INVALID` | 实际 key 路径 | 环境变量名不符合跨平台格式；提示允许的 key 格式。 |
| `CONFIG_ENVIRONMENT_KEY_DUPLICATE` | 后一个重复行的 `.key` | 草稿包含重复环境 key；提示合并为一项。 |
| `CONFIG_ENV_FILE_DUPLICATE` | 后一个重复项 | `.env` 引用重复；提示移除重复项。 |
| `CONFIG_PLATFORM_OVERRIDE_EMPTY` | 平台表路径 | 平台覆盖没有任何允许字段；提示移除空覆盖或填写差异。 |
| `CONFIG_PLATFORM_OVERRIDE_FIELD_INVALID` | 实际字段路径 | 覆盖包含 `program`、`args`、`env` 之外字段；提示移动到共享服务表。 |
| `PROJECT_CONFIGURATION_ALREADY_EXISTS` | 无 | 目标文件已存在；提示在外部编辑器处理，应用不会覆盖。 |

项目身份相关错误沿用或扩展现有代码：

- `INVALID_PROJECT_ID`：IPC 类型错误或空 ID；
- `PROJECT_NOT_FOUND`：ID 合法但不在 `ProjectRegistry`；
- `PROJECT_DIRECTORY_UNAVAILABLE`：项目已注册，但当前目录不存在、不是目录或不可访问；
- `UNTRUSTED_IPC_SENDER`：请求不是主窗口 main frame；
- `UNEXPECTED_ERROR`：未分类失败，使用通用文案。

配置校验按 schema 结构顺序稳定返回第一个问题，避免同一输入随机落到不同字段。后续如果需要批量问题列表，应作为独立接口演进，不在本票据扩张错误契约。

### 6.3 脱敏规则

- `message`、`nextAction`、普通日志、IPC 审计信息和异常包装不得包含任何 `env` value、完整 draft 或 TOML source。
- 环境 key 和字段路径可显示；环境 value 不可显示在错误中，即使它导致类型或控制字符错误。
- `smol-toml` 原始异常不得直接返回或记录，因为它可能包含源行。
- Main 捕获未知异常后只返回固定 `UNEXPECTED_ERROR`，不返回 `message`、`stack`、文件系统路径或依赖库错误。
- TOML 预览是用户明确请求查看的输入结果，可以包含其主动填写的非敏感环境值；它不作为事件或日志发出，也不写入应用元数据。
- UI 在环境值字段旁持续提示“仅填写非敏感值；秘密请放入 `.env`”。本票据不尝试判断某个值是否为秘密。

## 7. 文件创建语义

Node Host Runtime 对 `<canonicalRootPath>/.devcontrol.toml` 实现 create-exclusive、atomic-ish 写入：

1. 只使用固定 basename `.devcontrol.toml`，目标目录来自本次 `inspectProjectDirectory` 的结果；
2. 以 Node 独占创建标志 `wx` 打开目标，权限使用平台默认值；
3. 若打开返回 `EEXIST`，映射为 `PROJECT_CONFIGURATION_ALREADY_EXISTS`，不读取、不截断、不删除现有文件；
4. 对本调用新建的句柄写入完整 UTF-8 source，执行 `sync`，再关闭句柄；
5. 写入或同步失败时关闭句柄，并仅对本调用已经独占创建的目标做 best-effort 删除，然后重新抛出原始失败；
6. 只有完整写入、同步与关闭完成后才向 Control Center 报告成功。

该方案保证并发创建中最多一个调用成功，且普通写入失败不会留下由本调用产生的残缺配置。它是“atomic-ish”而非断电级事务：在进程或系统于创建与清理之间崩溃的极窄窗口中，仍可能留下部分文件。Node 没有提供统一跨平台、同时具备 rename 原子性与 no-replace 语义的高层操作；本票据优先保证“绝不覆盖已有文件”。后续读取会把残缺文件作为 `CONFIG_TOML_INVALID` 处理，而不会执行。

除 `EEXIST` 外，`ENOENT`、`ENOTDIR`、`EACCES`、`EPERM` 映射为带项目 ID 的 `PROJECT_DIRECTORY_UNAVAILABLE`。为保留项目 ID，Node adapter 可抛无 ID 的领域错误，Control Center 在跨越公开接口前重建资源信息。其他错误保持未知错误，由 Main 脱敏为 `UNEXPECTED_ERROR`。

## 8. Main、Preload 与 IPC

### 8.1 固定通道

只新增以下两个 invoke 通道：

```text
project-configurations:preview
project-configurations:create
```

Main 注册函数命名为 `registerProjectConfigurationIpc`。每个 handler 在访问 Control Center 前执行与项目注册通道相同的检查：

```ts
event.senderFrame === mainWindow.webContents.mainFrame
```

不可信 sender 返回 `UNTRUSTED_IPC_SENDER`，且不得调用 Registry、Host Runtime 或配置模块。handler 还要把 `projectId` 和 `draft` 当作 `unknown` 接收，先检查顶层载荷是普通对象、`projectId` 是非空字符串、`draft` 是普通对象；深层业务校验由配置模块完成。Main 不接受 root path、文件名、TOML source 或任意 channel 名。

### 8.2 Preload 精确接口

共享契约中的 `DesktopApi` 增加：

```ts
export interface DesktopApi {
  projects: {
    list(): Promise<ActionResult<ProjectSnapshot[]>>
    add(): Promise<ActionResult<ProjectSnapshot | null>>
    remove(projectId: string): Promise<ActionResult<null>>
  }
  projectConfigurations: {
    preview(
      projectId: string,
      draft: ProjectConfigurationDraft
    ): Promise<ActionResult<ProjectConfigurationPreview>>
    create(
      projectId: string,
      draft: ProjectConfigurationDraft
    ): Promise<ActionResult<ProjectConfigurationCreated>>
  }
}
```

Preload 方法一一映射到固定通道，不暴露 `ipcRenderer`、`send`、`invoke(channel, ...)`、Node 文件接口、根路径或目录选择器。所有请求与响应必须是可结构化克隆的数据。

### 8.3 错误序列化

Main 复用统一的 `resultOf`/授权包装语义：

- `ControlCenterError` 只返回 `detail`；
- 其他异常转换为固定 `UNEXPECTED_ERROR`；
- 任何结果都不含 `Error` 实例、cause、stack 或原始依赖错误；
- 配置错误的 `resource.projectId` 由 Control Center 填充，不能由 Renderer 冒充。

## 9. UI 设计

### 9.1 页面与模块

不引入路由库、弹窗框架或全局状态库。`App` 在同一窗口维护两种顶层视图：

- `project-list`：保留现有注册项目列表；可用项目行新增 `Configure` 按钮，missing 项目不提供创建入口。
- `configuration`：显示所选项目名称、返回项目列表按钮、编辑/预览/成功内容。

为避免继续扩大 `App.tsx`，Renderer 拆分聚焦模块：

- `ProjectListView`：现有项目列表与 `Configure` 入口；
- `ProjectConfigurationView`：配置工作流容器；
- `ServiceConfigurationForm`：表单控件和字段错误关联；
- `ProjectConfigurationPreviewPanel`：只读 `<pre>`、返回编辑和创建确认；
- `ConfigurationSuccess`：显示 `.devcontrol.toml created` 与项目内相对位置。

这些 UI 模块只消费 `DesktopApi` 和共享类型，不导入 Control Center、Electron 或 Node。

### 9.2 表单字段

- `Service ID`：文本框，默认 `web`。
- `Program`：文本框，无隐式 Shell 拆分。
- `Arguments`：可增删的逐行文本框；每行对应数组中的一个参数，顺序稳定。
- `Working directory`：文本框，默认 `.`，帮助文本说明 `/` 分隔与项目相对语义。
- `Environment values`：可增删的 key/value 行；value 使用普通文本框，因为本区域只允许非敏感值；旁边固定显示 `.env` 建议。
- `Environment files`：可增删的逐行路径输入，示例 `.env` 与 `apps/web/.env.local`。
- `Run through shell`：未勾选的 checkbox，附带风险说明；只有用户操作后才可能变为 `true`。
- `macOS overrides`、`Windows overrides`：原生 disclosure（button + `aria-expanded`/关联 region），分别只包含 Program、Arguments、Environment values；默认折叠且不向 draft 添加空覆盖。

### 9.3 状态模型与预览失效

```ts
type ConfigurationWorkflowState =
  | { kind: 'editing'; draft: ProjectConfigurationDraft; error?: ActionableError }
  | { kind: 'previewing'; draft: ProjectConfigurationDraft; preview: ProjectConfigurationPreview }
  | { kind: 'creating'; draft: ProjectConfigurationDraft; preview: ProjectConfigurationPreview }
  | { kind: 'created'; result: ProjectConfigurationCreated }
```

数据流：

1. 用户从一个 available 项目进入配置页；Renderer 只保存其 `projectId` 和用于展示的项目快照。
2. 编辑控件产生不可变的结构化 draft。
3. 点击 `Preview configuration` 调用 `desktop.projectConfigurations.preview(projectId, draft)`。
4. 成功后保存同一份 draft 快照和返回的 source，显示只读预览。
5. 点击 `Back to editing` 回到该 draft。任何字段修改、行增删、排序变化或平台区启停都立即清除旧 preview；创建按钮只存在于 `previewing` 状态，因此过期预览不可提交。
6. 点击 `Create configuration` 时进入 `creating`，按钮禁用，并将 `previewing` 状态保存的 draft 重新传给 `create`。Control Center 再次完整校验，不信任预览。
7. 成功后显示 `.devcontrol.toml created`；失败则回到预览上下文显示可操作错误。若失败是 `PROJECT_CONFIGURATION_ALREADY_EXISTS`，不再自动重试或切换为编辑已有文件。

返回项目列表不会自动保存草稿；本票据不实现草稿持久化。页面卸载、重启应用或取消注册均可丢弃未创建草稿。

### 9.4 错误呈现

- 字段级错误在对应 label/control 后显示，同时在页面顶部提供 `role="alert"` 摘要和 next action。
- 提交失败后聚焦第一个可定位的无效控件；无法定位或项目级错误聚焦页级 alert。
- 错误消息不显示环境 value。TOML 预览保留用户明确输入的非敏感值。
- `PROJECT_NOT_FOUND` 提示返回并刷新项目列表；`PROJECT_DIRECTORY_UNAVAILABLE` 提示恢复目录后重试；`PROJECT_CONFIGURATION_ALREADY_EXISTS` 明确说明文件未被改变并提示用外部编辑器处理。

### 9.5 可访问性、主题与响应式

- 所有输入都有可见 `<label>`；环境行、参数行和平台区使用 `fieldset`/`legend` 或等价可访问分组。
- 错误通过 `aria-describedby` 与字段关联；异步结果使用 `role="alert"` 或适当的 `aria-live`，不重复播报。
- 所有增加、删除、展开、返回、预览和创建操作均可用键盘完成，并沿用全局 `:focus-visible` 焦点环。
- 创建中保留可见进度文本并禁用重复提交，但不禁用页面阅读。
- 跟随现有 `color-scheme: light dark` 和系统字体，不引入自定义主题系统。
- 在 1100×720 使用双列布局：主要表单与辅助说明/平台覆盖可并排；在 760×520 及更窄内容宽度切为单列，操作栏允许换行或纵向排列。
- 页面不得产生横向滚动；长项目路径、field path 和 TOML 行在自己的容器中安全换行或局部横向滚动，不扩大窗口布局。
- TOML 预览使用可聚焦、可选择文本的只读区域；本票据不提供复制到剪贴板能力或编辑能力。

## 10. 测试设计

所有测试通过公开模块行为或真实桌面可观察结果验证，不断言私有函数、SQLite 表结构或 `smol-toml` 内部对象。

### 10.1 测试矩阵

| 层级 | 场景 | 关键断言 |
| --- | --- | --- |
| 配置模块：草稿 | 最小合法服务 | 补齐默认值，生成 schema v1，Shell 为 false。 |
| 配置模块：草稿 | 完整共享字段与双平台覆盖 | 输出顺序稳定；program/args 替换、env 浅合并语义可由 parse 后对象观察。 |
| 配置模块：解析 | 完整合法示例 | 返回规范化 `ProjectConfigurationV1`。 |
| 配置模块：解析 | TOML 语法错误、缺失/未知/错误类型版本 | 返回固定 code/fieldPath，不含源片段。 |
| 配置模块：schema | 未知顶层、服务或覆盖字段 | `CONFIG_UNKNOWN_FIELD` 或 `CONFIG_PLATFORM_OVERRIDE_FIELD_INVALID`。 |
| 配置模块：ID | 非法或不稳定 ID 格式 | 可操作字段错误；重复 TOML key 作为脱敏后的语法错误处理。 |
| 配置模块：路径 | POSIX 绝对、盘符、UNC、URL、反斜杠、`..`、空段 | 精确映射 absolute/outside/invalid；合法嵌套路径通过。 |
| 配置模块：环境 | 非法 key、重复 key、非字符串值、重复 env file | 精确字段路径；任何错误文本不含 value。 |
| 配置模块：Shell | 缺失、false、true、字符串 true | 缺失规范化为 false；只有 boolean true 启用；字符串拒绝。 |
| ProjectRegistry contract | `get` 命中/未命中 | 返回项目或 null；不访问文件系统。 |
| Host Runtime contract | 目标不存在 | 创建完整 UTF-8 文件，内容精确匹配。 |
| Host Runtime contract | 目标已存在/并发创建 | 现有字节保持不变；一个创建成功，其余得到 already exists。 |
| Host Runtime contract | 写入失败 | 关闭句柄并 best-effort 清理本次新文件；错误不吞掉。 |
| Host Runtime contract | `.env` 引用 | 只写配置文本，不读取 `.env` 内容。 |
| Control Center | 合法 preview | 只返回 source，不创建文件。 |
| Control Center | 合法 create | 再次查项目、检查目录、校验 draft，然后只调用一次创建。 |
| Control Center | preview 后草稿变坏 | create 拒绝且不调用写入，证明不信任预览。 |
| Control Center | 无效/未知/missing 项目 | 分别返回 INVALID_PROJECT_ID、PROJECT_NOT_FOUND、PROJECT_DIRECTORY_UNAVAILABLE。 |
| IPC | 通道清单与 sender | 只新增两个固定通道；不可信 sender 在任何领域调用前被拒绝。 |
| IPC | 载荷与脱敏 | 不接受 rootPath/source/任意对象；领域错误无 stack，未知错误无内部信息或 env value。 |
| Renderer | 编辑到预览 | 传 `projectId + draft`，显示完整只读 TOML。 |
| Renderer | 返回并修改 | 保留 draft；任意变化移除旧 preview/create 按钮，必须重新预览。 |
| Renderer | 创建成功/失败 | 防重复提交；成功状态明确；字段与页级错误可操作且可聚焦。 |
| Renderer | 键盘/响应式/主题 | 纯键盘完成核心流程；760×520 无遮挡或横向页面滚动；系统主题可读。 |
| Electron E2E | 真实创建 | 注册临时项目、填写服务、预览、创建；磁盘文件存在，公开 parser 读取后的对象正确。 |
| Electron E2E | 已有配置 | 预先写入 marker 内容；create 返回 already exists，marker 字节不变。 |
| Electron E2E | 重启持久结果 | 重启后文件仍存在；本票据不自动读取或进入编辑。 |
| CI | macOS/Windows | 两个平台执行 typecheck、Vitest、build、完整 Electron E2E。 |

E2E 使用测试专用 `userData` 与临时开发项目目录；通过真实公开 Preload 接口操作，不添加测试专用 IPC，不直接从 Renderer 调用 Node。磁盘断言在测试进程侧执行，并在退出后清理临时目录。

### 10.2 票据验收映射

| 票据验收项 | 设计实现点 | 主要证明 |
| --- | --- | --- |
| 已注册项目添加一个长期运行服务 | Configure 入口、单服务 draft、键控 `services` | Renderer + Electron E2E |
| 程序、参数、工作目录、非敏感 env、`.env` 引用 | schema 共享字段与表单 | 配置模块 + Renderer |
| Shell 默认关闭且显式开启 | schema 默认 false、未选 checkbox、输出显式 boolean | 配置模块 + UI |
| 共享值与 macOS/Windows 局部覆盖 | 限定覆盖表和确定性合并 | parse/preview 行为测试 |
| 保存前完整预览，确认后生成 v1 | preview/create 两阶段与 UI 状态机 | Renderer + Electron E2E |
| 绝对/越界路径、未知版本、无效覆盖被拒绝 | 固定校验规则、code、fieldPath | 配置模块公开测试 |
| 环境值不进入错误、日志或事件 | 配置模块脱敏、Main 固定包装、无配置事件 | mutation/负向断言 |
| 测试不依赖内部结构 | 两个公开配置函数、Control Center seam、真实桌面 seam | 测试代码审查 |

## 11. 成功标准

本设计实施完成时应同时满足：

1. 用户能从一个 available 的已注册项目进入同窗配置页，纯键盘完成单服务填写、预览和确认创建。
2. `.devcontrol.toml` 与 schema v1 规则一致，可由 `parseProjectConfiguration` 重新解析为相同规范化配置。
3. Renderer 到 Host Runtime 的整条链只传 `projectId + draft` 这一用户意图；根路径只来自 Registry。
4. 创建总是重新校验，且现有配置、missing 项目、未知项目和并发创建均安全失败。
5. 任何失败路径都不覆盖项目文件，也不向错误、日志或界面事件泄漏环境变量值或 stack。
6. 760×520、系统明暗主题和键盘/焦点验收通过。
7. 本地完整检查以及 macOS/Windows CI 均通过。

## 12. 实施约束

- 只修改票据 02 所需模块，不提前实现票据 03+。
- 不将配置规则复制到 Renderer、Main 或 Host Runtime。
- 不引入通用表单框架、Schema 框架、路由库或秘密管理系统。
- 不读取或编辑已有 `.devcontrol.toml`，不读取 `.env` 内容。
- 不创建 remote、不推送、不改变票据状态；这些属于实施流程的独立外部动作，不是本设计文档任务的一部分。
