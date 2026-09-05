# Portable Project Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已注册且目录可用的开发项目交付单服务项目配置创建闭环：结构化填写、完整预览、严格校验，并以不覆盖已有文件的方式创建 schema v1 `.devcontrol.toml`。

**Architecture:** 不依赖 Electron 的项目配置模块负责 TOML 解析、schema 校验、规范化、确定性序列化和错误脱敏；Control Center 只接收 `projectId + draft`，从 Registry 解析可信根目录并协调 Node Host Runtime 独占创建固定文件。Main、Preload 和 Renderer 维持窄意图边界，Renderer 只管理表单与预览状态，不生成 TOML、不提交根路径、不读取 `.env`。

**Tech Stack:** Electron 44、React 19、TypeScript 7、Vite/electron-vite、pnpm 11、Node 24、`smol-toml`、Node `node:sqlite`/`node:fs/promises`、Vitest、React Testing Library、Playwright Electron、GitHub Actions

**Spec:** `docs/superpowers/specs/2026-09-05-portable-project-configuration-design.md`，并受 `.scratch/developer-control-center-mvp/issues/02-portable-project-configuration.md`、`CONTEXT.md`、ADR-0001/0002/0004/0005 约束。

## Global Constraints

- 首版支持 macOS 13 及以上版本和 Windows 11；项目配置、错误语义和创建结果在两端一致。
- 项目配置固定写入已注册开发项目根目录的 `.devcontrol.toml`，必须带 TOML integer `schema_version = 1`。
- 本票据只创建恰好一个开发服务；文件使用 `[services.<service-id>]` 键控表，但不实现多服务编辑、依赖、健康检查、端口或服务执行。
- 服务 ID 长度为 1—64，必须匹配 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`，配置模块不得擅自改写 ID。
- `working_directory`、`env_files` 和路径形式的 `program` 必须使用 `/` 分隔的项目相对路径；拒绝绝对路径、盘符、UNC、`~`、URL、反斜杠、空段、`.` 段、`..` 段、NUL、CR 和 LF。
- `args` 是不解释的字符串数组，不扫描或改写其中的 URL、绝对路径文本或工具语法；每项只拒绝 NUL。
- `shell` 默认且显式序列化为 `false`，只有用户明确勾选后才允许为 TOML boolean `true`。
- 平台覆盖仅允许 `program`、`args`、`env`；program 和 args 整体替换，env 浅合并，工作目录、shell 与 env files 始终共享；空覆盖拒绝。
- 配置输出固定为 UTF-8、LF、单个结尾换行；服务与环境 key 使用字典序，字段顺序固定为 `schema_version`、`services` 及每个服务的 `program`、`args`、`working_directory`、`shell`、`env_files`、`env`、`macos`、`windows`。
- 只保存 `.env` 相对引用，绝不读取 `.env` 内容；环境变量 value 只允许出现在用户明确请求的 TOML 预览和最终配置文件中，不得进入错误、普通日志、IPC 审计信息或 UI 事件。
- 预览不读取或写入 `.devcontrol.toml`；创建必须重新查询项目、复核目录并重新校验 draft，不信任旧预览、隐藏 token 或 Renderer 缓存。
- Node Host Runtime 只接受 Control Center 提供的规范根目录和已生成 source；它以 `wx` 写完同目录高熵暂存文件，再用 `link` 原子地 no-replace 发布固定 basename `.devcontrol.toml`，绝不读取、截断、删除或覆盖已有最终文件。
- Renderer 不提交 root path、文件名、TOML source 或任意 channel；Preload 只新增 `projectConfigurations.preview/create` 两个固定方法，Main 只新增 `project-configurations:preview/create` 两个固定 invoke 通道。
- Renderer 保持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`，不得暴露原始 `ipcRenderer`、通用 `invoke`、Node 文件接口或目录选择器。
- 项目配置模块和 Control Center 不导入 Electron；测试只验证公开函数、公开接口和用户可见结果，不断言 `smol-toml` 内部对象、SQLite 表布局或私有调用次数。
- UI 使用英文、系统字体和 `color-scheme: light dark`；所有控件有可见标签、键盘可操作、焦点清晰，760×520 不产生页面横向滚动。
- 依赖使用 pnpm 11 与 Node 24 安装并由 `pnpm-lock.yaml` 固定；不得手写 lockfile。
- 不引入路由、全局状态、通用表单、Schema、弹窗、组件或秘密管理框架；不实现票据 03 及之后的检测、执行、编辑、热重载、日志、托盘或通知功能。

---

## File Structure

- `package.json`、`pnpm-lock.yaml`：增加 `smol-toml` 运行时依赖并由 pnpm 更新锁文件。
- `src/shared/contracts.ts`：保存所有跨进程可结构化克隆的项目配置 draft、规范化配置、预览、创建结果、错误和 `DesktopApi` 类型。
- `src/control-center/project-configuration.ts`：项目配置唯一公开模块；封装 `smol-toml`，执行解析、未知字段拒绝、业务校验、规范化与确定性序列化。
- `src/control-center/project-configuration.test.ts`：只经 `parseProjectConfiguration` 与 `buildProjectConfigurationPreview` 验证有效配置、平台合并语义、错误路径和脱敏。
- `src/control-center/errors.ts`：集中构造项目配置、项目未找到、已有配置和带项目 ID 的可操作错误。
- `src/control-center/project-registry.ts`、`src/control-center/sqlite-project-registry.ts`：增加按稳定 ID 查询的 `get(projectId)` 契约和参数化 SQLite 实现。
- `src/control-center/testing/test-project-registry.ts`、`src/control-center/project-registry.contract.test.ts`：提供内存测试适配器，并让 SQLite 与内存实现通过同一 `get` 行为契约。
- `src/control-center/host-runtime.ts`、`src/control-center/node-host-runtime.ts`：增加固定最终文件名、暂存文件独占写入、sync、close、硬链接 no-replace 发布和暂存清理能力。
- `src/control-center/node-host-runtime.test.ts`：验证成功写入、已有文件、并发创建、写入失败清理以及不读取 `.env`。
- `src/control-center/testing/test-host-runtime.ts`：为 Control Center 测试记录配置创建请求，不访问真实文件系统。
- `src/control-center/control-center.ts`、`src/control-center/control-center.test.ts`：实现并验证 preview/create 的项目身份解析、目录复核、重新校验、错误补充项目 ID 和 Host Runtime 协调。
- `src/main/ipc-result.ts`：共享可信 sender 检查和脱敏 `ActionResult` 包装；未知异常只生成固定公开错误。
- `src/main/register-project-ipc.ts`、`src/main/register-project-ipc.test.ts`：改用共享包装，保持原三个项目注册通道语义不变。
- `src/main/register-project-configuration-ipc.ts`、`src/main/register-project-configuration-ipc.test.ts`：绑定两个固定配置通道并只校验 IPC envelope 外形。
- `src/main/index.ts`：把配置 IPC 注册到现有主窗口和同一个 Control Center。
- `src/preload/index.ts`：把两个固定配置意图加入 `window.desktop`，不暴露底层 Electron 能力。
- `src/renderer/src/App.tsx`：只管理项目列表与同窗顶层视图切换。
- `src/renderer/src/ProjectListView.tsx`：保留项目列表并只为 available 项目显示 `Configure`。
- `src/renderer/src/ProjectConfigurationView.tsx`：实现 editing/previewing/creating/created 状态机、预览失效、异步错误与焦点恢复。
- `src/renderer/src/ServiceConfigurationForm.tsx`：实现单服务、动态参数/env/env-file 行、Shell 和双平台 disclosure 表单。
- `src/renderer/src/ProjectConfigurationPreviewPanel.tsx`：显示可聚焦、可选择、只读 TOML，并提供返回编辑和明确创建操作。
- `src/renderer/src/ConfigurationSuccess.tsx`：显示创建成功与项目内相对位置。
- `src/renderer/src/App.test.tsx`、`src/renderer/src/ProjectConfigurationView.test.tsx`：验证入口、草稿形状、状态转换、错误关联、防重复提交和不泄漏环境 value。
- `src/renderer/src/styles.css`：支持配置页双列/单列布局、动态行、disclosure、预览、安全换行和现有主题/焦点约束。
- `e2e/project-configuration.spec.ts`：通过真实 Preload 接口验证注册、预览、磁盘创建、已有文件保护和重启保留。
- `e2e/app-shell.spec.ts`、`e2e/ui-viewport.spec.ts`：更新公开能力白名单，并验证配置工作流键盘路径与 760×520 布局。
- `.github/workflows/ci.yml`：沿用现有 macOS 14/Windows 2025 矩阵，确认 typecheck、Vitest、build、Electron E2E 全部执行。
- `.scratch/developer-control-center-mvp/issues/02-portable-project-configuration.md`：仅在本地和双平台 CI 全部成功后勾选验收并改为 `ready-for-human`。

---

### Task 1: 建立配置公共契约与确定性草稿预览

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`（只由 pnpm 生成）
- Modify: `src/shared/contracts.ts`
- Modify: `src/control-center/errors.ts`
- Create: `src/control-center/project-configuration.ts`
- Create: `src/control-center/project-configuration.test.ts`

**Interfaces:**
- Consumes: `ControlCenterError` 与 `smol-toml.stringify(value)`。
- Produces:
  - `PlatformName = 'macos' | 'windows'`
  - `EnvironmentVariableDraft`、`PlatformOverrideDraft`、`DevelopmentServiceDraft`、`ProjectConfigurationDraft`
  - `PlatformOverride`、`DevelopmentServiceConfiguration`、`ProjectConfigurationV1`
  - `ProjectConfigurationPreview { source: string }`
  - `ProjectConfigurationCreated { relativePath: '.devcontrol.toml' }`
  - `buildProjectConfigurationPreview(draft: ProjectConfigurationDraft): ProjectConfigurationPreview`
  - `configurationError(code, fieldPath, message, nextAction, projectId?)`

- [ ] **Step 1: 安装 TOML 运行时依赖**
~~~bash
pnpm add smol-toml
git diff -- package.json pnpm-lock.yaml
~~~
Expected: `smol-toml` 只出现在 `dependencies`，`pnpm-lock.yaml` 由 pnpm 自动更新；没有手工编辑锁文件，也没有新增其他包。

- [ ] **Step 2: 写最小与完整草稿的 RED 行为测试**

创建 `src/control-center/project-configuration.test.ts`；测试只调用公开函数：
~~~typescript
import { expect, test } from 'vitest'
import type { ProjectConfigurationDraft } from '../shared/contracts'
import { buildProjectConfigurationPreview } from './project-configuration'
const minimalDraft: ProjectConfigurationDraft = {
  service: {
    id: 'web',
    program: '  pnpm  ',
    args: [],
    workingDirectory: '.',
    shell: false,
    envFiles: [],
    env: []
  }
}
test('builds a deterministic schema v1 preview with explicit safe defaults', () => {
  const first = buildProjectConfigurationPreview(minimalDraft)
  const second = buildProjectConfigurationPreview(minimalDraft)
  expect(first).toEqual(second)
  expect(first.source).toMatch(/^schema_version = 1\n/)
  expect(first.source).toContain('[services.web]')
  expect(first.source).toContain('program = "pnpm"')
  expect(first.source).toContain('args = []')
  expect(first.source).toContain('working_directory = "."')
  expect(first.source).toContain('shell = false')
  expect(first.source).toContain('env_files = []')
  expect(first.source.endsWith('\n')).toBe(true)
  expect(first.source.endsWith('\n\n')).toBe(false)
})
test('orders shared fields, environment keys and platform overrides deterministically', () => {
  const draft: ProjectConfigurationDraft = {
    service: {
      id: 'web',
      program: 'pnpm',
      args: ['dev', '--host', '127.0.0.1'],
      workingDirectory: 'apps/web',
      shell: true,
      envFiles: ['.env', 'apps/web/.env.local'],
      env: [
        { key: 'PORT', value: '3000' },
        { key: 'z_lower', value: 'last' },
        { key: 'NODE_ENV', value: 'development' },
        { key: '_FIRST', value: 'first' }
      ],
      macos: {
        args: ['dev', '--watch'],
        env: [{ key: 'WATCH_MODE', value: 'native' }]
      },
      windows: {
        program: 'pnpm.cmd',
        args: ['dev', '--watch'],
        env: [{ key: 'WATCH_MODE', value: 'poll' }]
      }
    }
  }
  const { source } = buildProjectConfigurationPreview(draft)
  expect(source.indexOf('schema_version')).toBeLessThan(source.indexOf('[services.web]'))
  expect(source.indexOf('program = "pnpm"')).toBeLessThan(source.indexOf('args = ['))
  expect(source.indexOf('NODE_ENV')).toBeLessThan(source.indexOf('PORT'))
  expect(source.indexOf('PORT')).toBeLessThan(source.indexOf('_FIRST'))
  expect(source.indexOf('_FIRST')).toBeLessThan(source.indexOf('z_lower'))
  expect(source.indexOf('[services.web.macos]')).toBeLessThan(
    source.indexOf('[services.web.windows]')
  )
  expect(source).toContain('shell = true')
})
~~~
- [ ] **Step 3: 运行测试并确认因公开模块缺失而失败**
~~~bash
pnpm test -- src/control-center/project-configuration.test.ts
~~~
Expected: FAIL，错误明确指向 `./project-configuration` 不存在或 `buildProjectConfigurationPreview` 未导出；不得以跳过测试转绿。

- [ ] **Step 4: 增加精确共享契约与配置错误构造器**

在 `src/shared/contracts.ts` 的 `ProjectSnapshot` 之后加入以下定义，并把 `ActionableError.resource` 扩展为三种资源、增加可选 `fieldPath`：
~~~typescript
export type PlatformName = 'macos' | 'windows'
export interface EnvironmentVariableDraft { key: string; value: string }
export interface PlatformOverrideDraft {
  program?: string; args?: string[]; env?: EnvironmentVariableDraft[]
}
export interface DevelopmentServiceDraft {
  id: string; program: string; args: string[]; workingDirectory: string; shell: boolean
  envFiles: string[]; env: EnvironmentVariableDraft[]
  macos?: PlatformOverrideDraft; windows?: PlatformOverrideDraft
}
export interface ProjectConfigurationDraft { service: DevelopmentServiceDraft }
export interface PlatformOverride {
  program?: string; args?: readonly string[]; env?: Readonly<Record<string, string>>
}
export interface DevelopmentServiceConfiguration {
  program: string; args: readonly string[]; workingDirectory: string; shell: boolean
  envFiles: readonly string[]; env: Readonly<Record<string, string>>
  macos?: PlatformOverride; windows?: PlatformOverride
}
export interface ProjectConfigurationV1 { schemaVersion: 1; services: Readonly<Record<string, DevelopmentServiceConfiguration>> }
export interface ProjectConfigurationPreview { source: string }
export interface ProjectConfigurationCreated { relativePath: '.devcontrol.toml' }
export type ConfigFieldPath = string
~~~
`ActionableError` 的完整形状改为：
~~~typescript
export interface ActionableError {
  code: string
  resource: { kind: 'project'; id?: string }
    | { kind: 'project_configuration'; projectId?: string }
    | { kind: 'application' }
  fieldPath?: ConfigFieldPath
  message: string
  nextAction: string
}
~~~
在 `src/control-center/errors.ts` 增加不回显 value/source 的构造器：
~~~typescript
export function configurationError(
  code: string,
  fieldPath: string | undefined,
  message: string,
  nextAction: string,
  projectId?: string
): ControlCenterError {
  return new ControlCenterError({
    code,
    resource: projectId
      ? { kind: 'project_configuration', projectId }
      : { kind: 'project_configuration' },
    ...(fieldPath === undefined ? {} : { fieldPath }),
    message,
    nextAction
  })
}
~~~
- [ ] **Step 5: 实现最小确定性预览生成器**

创建 `src/control-center/project-configuration.ts`。使用 `bigint` 只存在于传给 `smol-toml` 的内部文档，公开对象与 IPC 不返回 bigint：
~~~typescript
import { stringify } from 'smol-toml'
import type {
  DevelopmentServiceConfiguration,
  EnvironmentVariableDraft,
  PlatformOverride,
  PlatformOverrideDraft,
  ProjectConfigurationDraft,
  ProjectConfigurationPreview,
  ProjectConfigurationV1
} from '../shared/contracts'
import { configurationError } from './errors'
const serviceIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const environmentKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
function fail(code: string, fieldPath: string, message: string, nextAction: string): never {
  throw configurationError(code, fieldPath, message, nextAction)
}
function environmentFromRows(
  rows: readonly EnvironmentVariableDraft[],
  fieldPath: string
): Readonly<Record<string, string>> {
  const values = new Map<string, string>()
  rows.forEach((row, index) => {
    if (!environmentKeyPattern.test(row.key)) {
      fail(
        'CONFIG_ENVIRONMENT_KEY_INVALID',
        `${fieldPath}[${index}].key`,
        'The environment variable name is invalid.',
        'Use letters, numbers, and underscores, beginning with a letter or underscore.'
      )
    }
    if (values.has(row.key)) {
      fail(
        'CONFIG_ENVIRONMENT_KEY_DUPLICATE',
        `${fieldPath}[${index}].key`,
        'The environment variable name is duplicated.',
        'Keep one row for this environment variable.'
      )
    }
    values.set(row.key, row.value)
  })
  return Object.fromEntries([...values].sort(([left], [right]) => compareCodeUnits(left, right)))
}
function overrideFromDraft(
  draft: PlatformOverrideDraft | undefined,
  fieldPath: string
): PlatformOverride | undefined {
  if (draft === undefined) return undefined
  const result: PlatformOverride = {
    ...(draft.program === undefined ? {} : { program: draft.program.trim() }),
    ...(draft.args === undefined ? {} : { args: [...draft.args] }),
    ...(draft.env === undefined ? {} : { env: environmentFromRows(draft.env, `${fieldPath}.env`) })
  }
  if (Object.keys(result).length === 0) {
    fail(
      'CONFIG_PLATFORM_OVERRIDE_EMPTY',
      fieldPath,
      'The platform override is empty.',
      'Remove the override or enter a platform-specific difference.'
    )
  }
  return result
}
function configurationFromDraft(draft: ProjectConfigurationDraft): ProjectConfigurationV1 {
  const { service } = draft
  if (!serviceIdPattern.test(service.id) || service.id.length > 64) {
    fail(
      'CONFIG_SERVICE_ID_INVALID',
      '$.service.id',
      'The service identifier is invalid.',
      'Use 1-64 lowercase letters, numbers, and single hyphen-separated segments.'
    )
  }
  const program = service.program.trim()
  if (program.length === 0) {
    fail(
      'CONFIG_PROGRAM_REQUIRED',
      '$.service.program',
      'A program is required.',
      'Enter an executable name or project-relative program path.'
    )
  }
  const normalized: DevelopmentServiceConfiguration = {
    program,
    args: [...service.args],
    workingDirectory: service.workingDirectory,
    shell: service.shell,
    envFiles: [...service.envFiles],
    env: environmentFromRows(service.env, '$.service.env'),
    ...(service.macos === undefined ? {} : { macos: overrideFromDraft(service.macos, '$.service.macos')! }),
    ...(service.windows === undefined ? {} : { windows: overrideFromDraft(service.windows, '$.service.windows')! })
  }
  return { schemaVersion: 1, services: { [service.id]: normalized } }
}
function platformDocument(override: PlatformOverride): Record<string, unknown> {
  return {
    ...(override.program === undefined ? {} : { program: override.program }),
    ...(override.args === undefined ? {} : { args: [...override.args] }),
    ...(override.env === undefined ? {} : { env: override.env })
  }
}
function serviceDocument(service: DevelopmentServiceConfiguration): Record<string, unknown> {
  return {
    program: service.program,
    args: [...service.args],
    working_directory: service.workingDirectory,
    shell: service.shell,
    env_files: [...service.envFiles],
    env: service.env,
    ...(service.macos === undefined ? {} : { macos: platformDocument(service.macos) }),
    ...(service.windows === undefined ? {} : { windows: platformDocument(service.windows) })
  }
}
function serialize(configuration: ProjectConfigurationV1): string {
  const services = Object.fromEntries(
    Object.entries(configuration.services)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([id, service]) => [id, serviceDocument(service)])
  )
  return `${stringify({ schema_version: 1n, services }).replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`
}
export function buildProjectConfigurationPreview(
  draft: ProjectConfigurationDraft
): ProjectConfigurationPreview {
  return { source: serialize(configurationFromDraft(draft)) }
}
~~~
Task 2 会在同一公开入口加入完整运行时类型、路径和控制字符校验；本任务只建立可审查的有效输入生成路径、确定性顺序和公开类型，不把 parser 或校验逻辑复制到桌面层。

- [ ] **Step 6: 运行 GREEN 验证并提交**
~~~bash
pnpm test -- src/control-center/project-configuration.test.ts
pnpm typecheck
git add package.json pnpm-lock.yaml src/shared/contracts.ts src/control-center/errors.ts src/control-center/project-configuration.ts src/control-center/project-configuration.test.ts
git commit -m "feat: build portable project configuration previews"
~~~
Expected: 两个配置预览测试与类型检查全部 PASS；diff 中 `pnpm-lock.yaml` 只包含 pnpm 解析出的 `smol-toml` 依赖图。

---

### Task 2: 完成 schema v1 解析、严格校验与脱敏

**Files:**
- Modify: `src/control-center/project-configuration.ts`
- Modify: `src/control-center/project-configuration.test.ts`

**Interfaces:**
- Consumes: Task 1 的共享配置类型、`configurationError` 与确定性 serializer。
- Produces:
  - `parseProjectConfiguration(source: string): ProjectConfigurationV1`
  - `buildProjectConfigurationPreview(draft: ProjectConfigurationDraft): ProjectConfigurationPreview` 的完整运行时校验
  - 固定错误代码与 `$` 字段路径；所有失败抛 `ControlCenterError`，且 detail 不含环境 value、TOML source 或 `smol-toml` 原始异常。

- [ ] **Step 1: 写公开 parser、平台合并和默认值 RED 测试**

在现有测试中导入 `parseProjectConfiguration`，加入：
~~~typescript
test('parses the complete schema and exposes platform replacement and env merge semantics', () => {
  const source = `schema_version = 1
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
args = ["dev", "--watch"]
[services.web.macos.env]
WATCH_MODE = "native"
[services.web.windows]
program = "pnpm.cmd"
args = []
[services.web.windows.env]
PORT = "4000"
`
  const configuration = parseProjectConfiguration(source)
  expect(configuration).toEqual({
    schemaVersion: 1,
    services: {
      web: {
        program: 'pnpm',
        args: ['dev', '--host', '127.0.0.1'],
        workingDirectory: 'apps/web',
        shell: false,
        envFiles: ['.env', 'apps/web/.env.local'],
        env: { NODE_ENV: 'development', PORT: '3000' },
        macos: { args: ['dev', '--watch'], env: { WATCH_MODE: 'native' } },
        windows: { program: 'pnpm.cmd', args: [], env: { PORT: '4000' } }
      }
    }
  })
  const service = configuration.services.web!
  expect({
    ...service,
    program: service.windows?.program ?? service.program,
    args: service.windows?.args ?? service.args,
    env: { ...service.env, ...service.windows?.env }
  }).toMatchObject({
    program: 'pnpm.cmd',
    args: [],
    env: { NODE_ENV: 'development', PORT: '4000' },
    workingDirectory: 'apps/web',
    shell: false,
    envFiles: ['.env', 'apps/web/.env.local']
  })
})
test('fills all optional service defaults and only boolean true enables shell', () => {
  expect(parseProjectConfiguration(`schema_version = 1\n[services.web]\nprogram = "pnpm"\n`))
    .toEqual({
      schemaVersion: 1,
      services: {
        web: {
          program: 'pnpm',
          args: [],
          workingDirectory: '.',
          shell: false,
          envFiles: [],
          env: {}
        }
      }
    })
  expect(() => parseProjectConfiguration(
    `schema_version = 1\n[services.web]\nprogram = "pnpm"\nshell = "true"\n`
  )).toThrowError(expect.objectContaining({
    detail: expect.objectContaining({
      code: 'CONFIG_FIELD_TYPE_INVALID',
      fieldPath: '$.services.web.shell'
    })
  }))
})
~~~
- [ ] **Step 2: 写固定错误矩阵与环境值 mutation RED 测试**

使用 `test.each` 精确覆盖全部错误类别；输入和预期如下，不得将依赖异常文本作为断言：
~~~typescript
test.each([
  ['broken = "unterminated', 'CONFIG_TOML_INVALID', '$'],
  ['[services.web]\nprogram = "pnpm"', 'CONFIG_SCHEMA_VERSION_REQUIRED', '$.schema_version'],
  ['schema_version = 1.0\n[services.web]\nprogram = "pnpm"', 'CONFIG_SCHEMA_VERSION_UNSUPPORTED', '$.schema_version'],
  ['schema_version = 2\n[services.web]\nprogram = "pnpm"', 'CONFIG_SCHEMA_VERSION_UNSUPPORTED', '$.schema_version'],
  ['schema_version = 1\nextra = true\n[services.web]\nprogram = "pnpm"', 'CONFIG_UNKNOWN_FIELD', '$.extra'],
  ['schema_version = 1', 'CONFIG_SERVICES_REQUIRED', '$.services'],
  ['schema_version = 1\n[services."web.api"]\nprogram = "pnpm"', 'CONFIG_SERVICE_ID_INVALID', '$.services["web.api"]'],
  ['schema_version = 1\n[services.web]', 'CONFIG_PROGRAM_REQUIRED', '$.services.web.program'],
  ['schema_version = 1\n[services.web]\nprogram = "   "', 'CONFIG_PROGRAM_REQUIRED', '$.services.web.program'],
  ['schema_version = 1\n[services.web]\nprogram = "/usr/bin/node"', 'CONFIG_PATH_ABSOLUTE', '$.services.web.program'],
  ['schema_version = 1\n[services.web]\nprogram = "C:tools/node.exe"', 'CONFIG_PATH_ABSOLUTE', '$.services.web.program'],
  ['schema_version = 1\n[services.web]\nprogram = "../bin/server"', 'CONFIG_PATH_OUTSIDE_PROJECT', '$.services.web.program'],
  ['schema_version = 1\n[services.web]\nprogram = "pnpm"\nworking_directory = "C:/repo"', 'CONFIG_PATH_ABSOLUTE', '$.services.web.working_directory'],
  ['schema_version = 1\n[services.web]\nprogram = "pnpm"\nworking_directory = "apps/../web"', 'CONFIG_PATH_OUTSIDE_PROJECT', '$.services.web.working_directory'],
  ['schema_version = 1\n[services.web]\nprogram = "pnpm"\nenv_files = [".env", ".env"]', 'CONFIG_ENV_FILE_DUPLICATE', '$.services.web.env_files[1]'],
  ['schema_version = 1\n[services.web]\nprogram = "pnpm"\n[services.web.macos]', 'CONFIG_PLATFORM_OVERRIDE_EMPTY', '$.services.web.macos'],
  ['schema_version = 1\n[services.web]\nprogram = "pnpm"\n[services.web.windows]\nshell = true', 'CONFIG_PLATFORM_OVERRIDE_FIELD_INVALID', '$.services.web.windows.shell']
] as const)('rejects invalid schema without leaking source: %s', (source, code, fieldPath) => {
  let thrown: unknown
  try {
    parseProjectConfiguration(source)
  } catch (error) {
    thrown = error
  }
  expect(thrown).toMatchObject({ detail: { code, fieldPath } })
  expect(JSON.stringify(thrown)).not.toContain(source)
})
test.each([
  '/absolute/path',
  'C:/workspace/app',
  'C:workspace/app',
  '//server/share/file',
  '\\\\server\\share\\file',
  '~/secret',
  'https://example.com/.env',
  'apps\\web',
  'apps//web',
  'apps/./web',
  'apps/web/',
  ''
])('rejects a non-portable env file path: %s', (value) => {
  const draft = structuredClone(minimalDraft)
  draft.service.envFiles = [value]
  expect(() => buildProjectConfigurationPreview(draft)).toThrowError(
    expect.objectContaining({ detail: expect.objectContaining({ code: expect.stringMatching(/^CONFIG_PATH_/) }) })
  )
})
test('never includes an environment value in configuration failures', () => {
  const secretValue = 'mutation-secret-value-7391'
  const draft = structuredClone(minimalDraft)
  draft.service.env = [
    { key: 'SAFE_KEY', value: secretValue },
    { key: 'SAFE_KEY', value: secretValue }
  ]
  let thrown: unknown
  try {
    buildProjectConfigurationPreview(draft)
  } catch (error) {
    thrown = error
  }
  expect(thrown).toMatchObject({
    detail: {
      code: 'CONFIG_ENVIRONMENT_KEY_DUPLICATE',
      fieldPath: '$.service.env[1].key'
    }
  })
  expect(JSON.stringify(thrown)).not.toContain(secretValue)
})
~~~
草稿运行时恶意输入与容易被对象原型影响的合法 key 使用以下实际测试：
~~~typescript
test.each([
  ['unknown service field', { ...minimalDraft, service: { ...minimalDraft.service, surprise: true } }, 'CONFIG_UNKNOWN_FIELD', '$.service.surprise'],
  ['non-array args', { ...minimalDraft, service: { ...minimalDraft.service, args: 'dev' } }, 'CONFIG_FIELD_TYPE_INVALID', '$.service.args'],
  ['NUL program', { ...minimalDraft, service: { ...minimalDraft.service, program: 'pnpm\0' } }, 'CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', '$.service.program'],
  ['NUL argument', { ...minimalDraft, service: { ...minimalDraft.service, args: ['dev\0'] } }, 'CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', '$.service.args[0]'],
  ['NUL environment value', { ...minimalDraft, service: { ...minimalDraft.service, env: [{ key: 'SAFE', value: 'value\0' }] } }, 'CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', '$.service.env[0].value'],
  ['invalid environment key', { ...minimalDraft, service: { ...minimalDraft.service, env: [{ key: 'NOT-PORTABLE', value: 'value' }] } }, 'CONFIG_ENVIRONMENT_KEY_INVALID', '$.service.env[0].key'],
  ['empty platform override', { ...minimalDraft, service: { ...minimalDraft.service, macos: {} } }, 'CONFIG_PLATFORM_OVERRIDE_EMPTY', '$.service.macos']
] as const)('rejects malicious draft shape: %s', (_name, value, code, fieldPath) => {
  expect(() => buildProjectConfigurationPreview(value as unknown as ProjectConfigurationDraft))
    .toThrowError(expect.objectContaining({ detail: expect.objectContaining({ code, fieldPath }) }))
})

test.each(['pnpm.cmd', 'scripts/dev-server'])('accepts a portable program form: %s', (program) => {
  const draft = structuredClone(minimalDraft)
  draft.service.program = program
  draft.service.args = ['https://example.com', '/tool-specific/value']
  expect(() => buildProjectConfigurationPreview(draft)).not.toThrow()
})

test('round-trips __proto__ as an own environment key', () => {
  const draft = structuredClone(minimalDraft)
  draft.service.env = [{ key: '__proto__', value: 'safe-value' }]
  const parsed = parseProjectConfiguration(buildProjectConfigurationPreview(draft).source)
  expect(Object.hasOwn(parsed.services.web!.env, '__proto__')).toBe(true)
  expect(parsed.services.web!.env.__proto__).toBe('safe-value')
})
~~~

- [ ] **Step 3: 运行测试并确认 parser 与严格校验尚未实现**
~~~bash
pnpm test -- src/control-center/project-configuration.test.ts
~~~
Expected: 新增 parser 用例 FAIL（`parseProjectConfiguration` 未导出），且至少一个恶意 draft 用例因当前校验不足而 FAIL。

- [ ] **Step 4: 实现完整运行时 schema 校验**

在 `project-configuration.ts` 导入 `parse as parseToml`，并加入下列基础谓词、固定字段集合和路径规则；所有错误只使用固定文案，不拼接原始 value：
~~~typescript
import { parse as parseToml, stringify } from 'smol-toml'
type UnknownRecord = Record<string, unknown>
const topLevelFields = new Set(['schema_version', 'services'])
const serviceFields = new Set([
  'program', 'args', 'working_directory', 'shell', 'env_files', 'env', 'macos', 'windows'
])
const overrideFields = new Set(['program', 'args', 'env'])
const absolutePathPatterns = [
  /^\//,
  /^[A-Za-z]:/,
  /^\\\\/,
  /^\/\//,
  /^~/,
  /^[A-Za-z][A-Za-z0-9+.-]*:\/\//
]
function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function field(base: string, key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
    ? `${base}.${key}`
    : `${base}[${JSON.stringify(key)}]`
}
function rejectUnknown(record: UnknownRecord, allowed: ReadonlySet<string>, base: string): void {
  const unknown = Object.keys(record).find((key) => !allowed.has(key))
  if (unknown !== undefined) {
    fail(
      'CONFIG_UNKNOWN_FIELD',
      field(base, unknown),
      'The project configuration contains an unknown field.',
      'Remove the field or correct its spelling.'
    )
  }
}
function assertString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string') {
    fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The field has the wrong type.', 'Enter a string value.')
  }
  return value
}
function assertStringArray(value: unknown, fieldPath: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The field has the wrong type.', 'Enter a list of strings.')
  }
  value.forEach((item, index) => {
    if (item.includes('\0')) {
      fail(
        'CONFIG_STRING_CONTAINS_CONTROL_CHARACTER',
        `${fieldPath}[${index}]`,
        'The string contains a disallowed control character.',
        'Remove the control character and try again.'
      )
    }
  })
  return [...value]
}
function validatePortablePath(value: unknown, fieldPath: string, allowDot: boolean): string {
  const path = assertString(value, fieldPath)
  if (absolutePathPatterns.some((pattern) => pattern.test(path))) {
    fail('CONFIG_PATH_ABSOLUTE', fieldPath, 'The path must be project-relative.', 'Use a path relative to the project root.')
  }
  if (path.split('/').includes('..')) {
    fail('CONFIG_PATH_OUTSIDE_PROJECT', fieldPath, 'The path leaves the project root.', 'Choose a path inside the project root.')
  }
  if (
    path.includes('\\') || path.includes('\0') || path.includes('\r') || path.includes('\n') ||
    path.length === 0 || path.startsWith('/') || path.endsWith('/') || path.includes('//') ||
    (!allowDot && path === '.') || path.split('/').some((segment) => segment === '' || segment === '.')
  ) {
    if (allowDot && path === '.') return path
    fail('CONFIG_PATH_INVALID', fieldPath, 'The path is not portable.', 'Use a normalized project-relative path with / separators.')
  }
  return path
}
function validateProgram(value: unknown, fieldPath: string): string {
  if (value === undefined) {
    fail('CONFIG_PROGRAM_REQUIRED', fieldPath, 'A program is required.', 'Enter an executable name or project-relative program path.')
  }
  const program = assertString(value, fieldPath).trim()
  if (program.length === 0) {
    fail('CONFIG_PROGRAM_REQUIRED', fieldPath, 'A program is required.', 'Enter an executable name or project-relative program path.')
  }
  if (/[\0\r\n]/.test(program)) {
    fail(
      'CONFIG_STRING_CONTAINS_CONTROL_CHARACTER',
      fieldPath,
      'The program contains a disallowed control character.',
      'Remove the control character and try again.'
    )
  }
  const pathLike = program.includes('/') || program.includes('\\') || absolutePathPatterns.some((pattern) => pattern.test(program))
  return pathLike ? validatePortablePath(program, fieldPath, false) : program
}
~~~
实现 `normalizeEnvironmentRecord`、`normalizeEnvironmentRows`、`normalizeOverride`、`normalizeService` 和 `normalizeDraft`，并遵循以下精确契约：
~~~typescript
function normalizeEnvironmentRecord(value: unknown, fieldPath: string): Readonly<Record<string, string>> {
  if (value === undefined) return {}
  if (!isRecord(value)) {
    fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The environment table has the wrong type.', 'Use string environment values.')
  }
  const normalized: Array<[string, string]> = []
  for (const key of Object.keys(value).sort()) {
    if (!environmentKeyPattern.test(key)) {
      fail('CONFIG_ENVIRONMENT_KEY_INVALID', field(fieldPath, key), 'The environment variable name is invalid.', 'Use a portable environment variable name.')
    }
    const environmentValue = value[key]
    if (typeof environmentValue !== 'string') {
      fail('CONFIG_FIELD_TYPE_INVALID', field(fieldPath, key), 'The environment value has the wrong type.', 'Use a string environment value.')
    }
    if (/\0/.test(environmentValue)) {
      fail('CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', field(fieldPath, key), 'The environment value contains a disallowed control character.', 'Remove the control character and try again.')
    }
    normalized.push([key, environmentValue])
  }
  return Object.fromEntries(normalized)
}
function normalizeEnvFiles(value: unknown, fieldPath: string): readonly string[] {
  if (value === undefined) return []
  const files = assertStringArray(value, fieldPath).map((item, index) =>
    validatePortablePath(item, `${fieldPath}[${index}]`, false)
  )
  const seen = new Set<string>()
  files.forEach((item, index) => {
    if (seen.has(item)) {
      fail('CONFIG_ENV_FILE_DUPLICATE', `${fieldPath}[${index}]`, 'The environment file is duplicated.', 'Remove the duplicate environment file.')
    }
    seen.add(item)
  })
  return files
}
function normalizeParsedOverride(value: unknown, fieldPath: string): PlatformOverride | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The platform override has the wrong type.', 'Use a platform override table.')
  }
  const invalid = Object.keys(value).find((key) => !overrideFields.has(key))
  if (invalid !== undefined) {
    fail('CONFIG_PLATFORM_OVERRIDE_FIELD_INVALID', field(fieldPath, invalid), 'The platform override field is not allowed.', 'Move the field to the shared service table.')
  }
  if (Object.keys(value).length === 0) {
    fail('CONFIG_PLATFORM_OVERRIDE_EMPTY', fieldPath, 'The platform override is empty.', 'Remove the override or enter a platform-specific difference.')
  }
  return {
    ...(value.program === undefined ? {} : { program: validateProgram(value.program, `${fieldPath}.program`) }),
    ...(value.args === undefined ? {} : { args: assertStringArray(value.args, `${fieldPath}.args`) }),
    ...(value.env === undefined ? {} : { env: normalizeEnvironmentRecord(value.env, `${fieldPath}.env`) })
  }
}
~~~
`normalizeParsedService` 必须先拒绝未知字段，再按字段顺序补默认值；字段存在但类型错误时不得回退默认值：
~~~typescript
function normalizeParsedService(
  record: UnknownRecord,
  servicePath: string
): DevelopmentServiceConfiguration {
  rejectUnknown(record, serviceFields, servicePath)
  return {
    program: validateProgram(record.program, `${servicePath}.program`),
    args: record.args === undefined ? [] : assertStringArray(record.args, `${servicePath}.args`),
    workingDirectory: record.working_directory === undefined
      ? '.'
      : validatePortablePath(record.working_directory, `${servicePath}.working_directory`, true),
    shell: record.shell === undefined
      ? false
      : typeof record.shell === 'boolean'
        ? record.shell
        : fail('CONFIG_FIELD_TYPE_INVALID', `${servicePath}.shell`, 'Shell must be a boolean.', 'Use true or false.'),
    envFiles: normalizeEnvFiles(record.env_files, `${servicePath}.env_files`),
    env: normalizeEnvironmentRecord(record.env, `${servicePath}.env`),
    ...(record.macos === undefined ? {} : { macos: normalizeParsedOverride(record.macos, `${servicePath}.macos`)! }),
    ...(record.windows === undefined ? {} : { windows: normalizeParsedOverride(record.windows, `${servicePath}.windows`)! })
  }
}
~~~

草稿校验必须把跨 IPC 输入重新视为 `unknown`。使用下面的字段集合和实现；环境行通过 `Map` 检查重复并用 `Object.fromEntries` 生成 map，使 `__proto__` 等合法 key 不受对象原型影响：
~~~typescript
const draftFields = new Set(['service'])
const draftServiceFields = new Set([
  'id', 'program', 'args', 'workingDirectory', 'shell', 'envFiles', 'env', 'macos', 'windows'
])
const draftOverrideFields = new Set(['program', 'args', 'env'])
const environmentRowFields = new Set(['key', 'value'])

function normalizeEnvironmentRows(value: unknown, fieldPath: string): Readonly<Record<string, string>> {
  if (!Array.isArray(value)) {
    fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The environment rows have the wrong type.', 'Enter environment key and value rows.')
  }
  const entries = new Map<string, string>()
  value.forEach((candidate, index) => {
    const rowPath = `${fieldPath}[${index}]`
    if (!isRecord(candidate)) {
      fail('CONFIG_FIELD_TYPE_INVALID', rowPath, 'The environment row has the wrong type.', 'Enter an environment key and value.')
    }
    rejectUnknown(candidate, environmentRowFields, rowPath)
    const key = assertString(candidate.key, `${rowPath}.key`)
    const environmentValue = assertString(candidate.value, `${rowPath}.value`)
    if (!environmentKeyPattern.test(key)) {
      fail('CONFIG_ENVIRONMENT_KEY_INVALID', `${rowPath}.key`, 'The environment variable name is invalid.', 'Use a portable environment variable name.')
    }
    if (environmentValue.includes('\0')) {
      fail('CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', `${rowPath}.value`, 'The environment value contains a disallowed control character.', 'Remove the control character and try again.')
    }
    if (entries.has(key)) {
      fail('CONFIG_ENVIRONMENT_KEY_DUPLICATE', `${rowPath}.key`, 'The environment variable name is duplicated.', 'Keep one row for this environment variable.')
    }
    entries.set(key, environmentValue)
  })
  return Object.fromEntries([...entries].sort(([left], [right]) => compareCodeUnits(left, right)))
}

function normalizeDraftOverride(value: unknown, fieldPath: string): PlatformOverride | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The platform override has the wrong type.', 'Use a platform override object.')
  }
  const invalid = Object.keys(value).find((key) => !draftOverrideFields.has(key))
  if (invalid !== undefined) {
    fail('CONFIG_PLATFORM_OVERRIDE_FIELD_INVALID', field(fieldPath, invalid), 'The platform override field is not allowed.', 'Move the field to the shared service settings.')
  }
  if (Object.keys(value).length === 0) {
    fail('CONFIG_PLATFORM_OVERRIDE_EMPTY', fieldPath, 'The platform override is empty.', 'Remove the override or enter a platform-specific difference.')
  }
  return {
    ...(Object.hasOwn(value, 'program') ? { program: validateProgram(value.program, `${fieldPath}.program`) } : {}),
    ...(Object.hasOwn(value, 'args') ? { args: assertStringArray(value.args, `${fieldPath}.args`) } : {}),
    ...(Object.hasOwn(value, 'env') ? { env: normalizeEnvironmentRows(value.env, `${fieldPath}.env`) } : {})
  }
}

function normalizeDraft(value: unknown): ProjectConfigurationV1 {
  if (!isRecord(value)) {
    fail('CONFIG_FIELD_TYPE_INVALID', '$', 'The configuration draft has the wrong type.', 'Submit a structured configuration draft.')
  }
  rejectUnknown(value, draftFields, '$')
  if (!isRecord(value.service)) {
    fail('CONFIG_FIELD_TYPE_INVALID', '$.service', 'The service draft has the wrong type.', 'Submit one structured service draft.')
  }
  const service = value.service
  rejectUnknown(service, draftServiceFields, '$.service')
  if (typeof service.id !== 'string' || service.id.length > 64 || !serviceIdPattern.test(service.id)) {
    fail('CONFIG_SERVICE_ID_INVALID', '$.service.id', 'The service identifier is invalid.', 'Use 1-64 lowercase letters, numbers, and single hyphen-separated segments.')
  }
  if (typeof service.shell !== 'boolean') {
    fail('CONFIG_FIELD_TYPE_INVALID', '$.service.shell', 'Shell must be a boolean.', 'Use true or false.')
  }
  return {
    schemaVersion: 1,
    services: {
      [service.id]: {
        program: validateProgram(service.program, '$.service.program'),
        args: assertStringArray(service.args, '$.service.args'),
        workingDirectory: validatePortablePath(service.workingDirectory, '$.service.workingDirectory', true),
        shell: service.shell,
        envFiles: normalizeEnvFiles(service.envFiles, '$.service.envFiles'),
        env: normalizeEnvironmentRows(service.env, '$.service.env'),
        ...(service.macos === undefined ? {} : { macos: normalizeDraftOverride(service.macos, '$.service.macos')! }),
        ...(service.windows === undefined ? {} : { windows: normalizeDraftOverride(service.windows, '$.service.windows')! })
      }
    }
  }
}

export function buildProjectConfigurationPreview(
  draft: ProjectConfigurationDraft
): ProjectConfigurationPreview {
  return { source: serialize(normalizeDraft(draft as unknown)) }
}
~~~
删除 Task 1 的 `configurationFromDraft` 旧实现，避免两套草稿校验路径。不要在 Main、Preload 或 Renderer 重复这些深层规则。

- [ ] **Step 5: 实现公开解析入口与 round-trip 不变量**

公开 parser 必须启用 bigint integer 解析，以区分 `1` 和 `1.0`，捕获时只生成固定语法错误：
~~~typescript
export function parseProjectConfiguration(source: string): ProjectConfigurationV1 {
  let document: unknown
  try {
    document = parseToml(source, { integersAsBigInt: true })
  } catch {
    fail(
      'CONFIG_TOML_INVALID',
      '$',
      'The project configuration is not valid TOML.',
      'Check the TOML syntax and try again.'
    )
  }
  if (!isRecord(document)) {
    fail('CONFIG_TOML_INVALID', '$', 'The project configuration is not valid TOML.', 'Check the TOML syntax and try again.')
  }
  rejectUnknown(document, topLevelFields, '$')
  if (!Object.hasOwn(document, 'schema_version')) {
    fail('CONFIG_SCHEMA_VERSION_REQUIRED', '$.schema_version', 'The schema version is missing.', 'Set schema_version to 1.')
  }
  if (document.schema_version !== 1n) {
    fail('CONFIG_SCHEMA_VERSION_UNSUPPORTED', '$.schema_version', 'The schema version is not supported.', 'Use schema_version = 1.')
  }
  if (!isRecord(document.services) || Object.keys(document.services).length === 0) {
    fail('CONFIG_SERVICES_REQUIRED', '$.services', 'At least one service is required.', 'Define at least one service table.')
  }
  const services: Array<[string, DevelopmentServiceConfiguration]> = []
  for (const id of Object.keys(document.services).sort()) {
    const servicePath = field('$.services', id)
    if (!serviceIdPattern.test(id) || id.length > 64) {
      fail('CONFIG_SERVICE_ID_INVALID', servicePath, 'The service identifier is invalid.', 'Use 1-64 lowercase letters, numbers, and single hyphen-separated segments.')
    }
    const value = document.services[id]
    if (!isRecord(value)) {
      fail('CONFIG_FIELD_TYPE_INVALID', servicePath, 'The service has the wrong type.', 'Use a service table.')
    }
    services.push([id, normalizeParsedService(value, servicePath)])
  }
  return { schemaVersion: 1, services: Object.fromEntries(services) }
}
~~~
在测试中加入唯一 round-trip 断言：
~~~typescript
test('round-trips a generated preview through the public parser', () => {
  const preview = buildProjectConfigurationPreview(minimalDraft)
  expect(parseProjectConfiguration(preview.source)).toEqual({
    schemaVersion: 1,
    services: {
      web: {
        program: 'pnpm',
        args: [],
        workingDirectory: '.',
        shell: false,
        envFiles: [],
        env: {}
      }
    }
  })
})

test('round-trips every shared and platform field from a complete draft', () => {
  const draft = structuredClone(minimalDraft)
  Object.assign(draft.service, {
    args: ['dev', '--host', '127.0.0.1'],
    workingDirectory: 'apps/web',
    shell: true,
    envFiles: ['.env', 'apps/web/.env.local'],
    env: [{ key: 'NODE_ENV', value: 'development' }, { key: 'PORT', value: '3000' }],
    macos: { args: ['dev', '--watch'], env: [{ key: 'WATCH_MODE', value: 'native' }] },
    windows: {
      program: 'pnpm.cmd',
      args: [],
      env: [{ key: 'PORT', value: '4000' }, { key: 'WATCH_MODE', value: 'poll' }]
    }
  })
  expect(parseProjectConfiguration(buildProjectConfigurationPreview(draft).source)).toEqual({
    schemaVersion: 1,
    services: {
      web: {
        program: 'pnpm',
        args: ['dev', '--host', '127.0.0.1'],
        workingDirectory: 'apps/web',
        shell: true,
        envFiles: ['.env', 'apps/web/.env.local'],
        env: { NODE_ENV: 'development', PORT: '3000' },
        macos: { args: ['dev', '--watch'], env: { WATCH_MODE: 'native' } },
        windows: { program: 'pnpm.cmd', args: [], env: { PORT: '4000', WATCH_MODE: 'poll' } }
      }
    }
  })
})
~~~
- [ ] **Step 6: 运行公开行为矩阵与架构扫描**
~~~bash
pnpm test -- src/control-center/project-configuration.test.ts
pnpm typecheck
rg -n "smol-toml|parseProjectConfiguration|buildProjectConfigurationPreview" src
~~~
Expected: 配置模块测试全部 PASS；`smol-toml` 与两个公开配置函数只出现在配置模块及其行为测试，Renderer/Main/Preload 无命中；恶意输入断言中没有环境 value 或完整 TOML source 泄漏。

- [ ] **Step 7: 提交**
~~~bash
git add src/control-center/project-configuration.ts src/control-center/project-configuration.test.ts
git commit -m "feat: validate project configuration schema"
~~~
Expected: 提交只包含配置模块与公开行为测试，未修改票据状态。

---

### Task 3: 为项目注册表增加稳定 ID 查询

**Files:**
- Modify: `src/control-center/project-registry.ts`
- Modify: `src/control-center/sqlite-project-registry.ts`
- Create: `src/control-center/testing/test-project-registry.ts`
- Create: `src/control-center/project-registry.contract.test.ts`

**Interfaces:**
- Consumes: 现有 `StoredProject { id; name; rootPath }` 与 SQLite `projects` 表。
- Produces: `ProjectRegistry.get(projectId: string): StoredProject | null`；SQLite 与内存测试适配器行为一致，不访问文件系统。

- [ ] **Step 1: 写 Registry 公共契约 RED 测试**
~~~typescript
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import type { ProjectRegistry } from './project-registry'
import { SqliteProjectRegistry } from './sqlite-project-registry'
import { TestProjectRegistry } from './testing/test-project-registry'
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action()
})
async function registryFactories(): Promise<Array<[string, ProjectRegistry]>> {
  const root = await mkdtemp(join(tmpdir(), 'dcc-registry-contract-'))
  const sqlite = new SqliteProjectRegistry(join(root, 'projects.sqlite'))
  const memory = new TestProjectRegistry()
  cleanup.push(
    async () => rm(root, { recursive: true, force: true }),
    async () => sqlite.close(),
    async () => memory.close()
  )
  return [['sqlite', sqlite], ['memory', memory]]
}
test('get returns the matching project and null without touching project files', async () => {
  for (const [name, registry] of await registryFactories()) {
    const first = { id: 'project-1', name: 'first', rootPath: '/registered/first' }
    const second = { id: 'project-2', name: 'second', rootPath: '/registered/second' }
    registry.insert(first)
    registry.insert(second)
    expect(registry.get('project-2'), name).toEqual(second)
    expect(registry.get('unknown-project'), name).toBeNull()
  }
})
~~~
- [ ] **Step 2: 运行测试并确认接口缺失**
~~~bash
pnpm test -- src/control-center/project-registry.contract.test.ts
~~~
Expected: FAIL，TypeScript/运行时错误明确指出 `ProjectRegistry.get` 与 `TestProjectRegistry` 尚不存在。

- [ ] **Step 3: 实现接口、参数化 SQLite 查询和内存适配器**

`ProjectRegistry` 完整接口改为：
~~~typescript
export interface ProjectRegistry {
  list(): StoredProject[]
  get(projectId: string): StoredProject | null
  insert(project: StoredProject): void
  remove(projectId: string): void
  close(): void
}
~~~
`SqliteProjectRegistry.get` 使用参数化查询，并复用一个只校验公开行字段的映射函数：
~~~typescript
get(projectId: string): StoredProject | null {
  const row = this.database
    .prepare('SELECT id, name, root_path FROM projects WHERE id = ?')
    .get(projectId)
  return row === undefined ? null : projectFromRow(row)
}
~~~
其中 `projectFromRow` 同时供 `list()` 使用：
~~~typescript
function projectFromRow(row: Record<string, unknown>): StoredProject {
  const { id, name, root_path: rootPath } = row
  if (typeof id !== 'string' || typeof name !== 'string' || typeof rootPath !== 'string') {
    throw new TypeError('Invalid project registry row: id, name, and root_path must be strings.')
  }
  return { id, name, rootPath }
}
~~~
测试适配器只保留内存 map：
~~~typescript
import type { ProjectRegistry, StoredProject } from '../project-registry'
export class TestProjectRegistry implements ProjectRegistry {
  private readonly projects = new Map<string, StoredProject>()
  constructor(initialProjects: readonly StoredProject[] = []) {
    initialProjects.forEach((project) => this.projects.set(project.id, project))
  }
  list(): StoredProject[] {
    return [...this.projects.values()]
  }
  get(projectId: string): StoredProject | null {
    return this.projects.get(projectId) ?? null
  }
  insert(project: StoredProject): void {
    this.projects.set(project.id, project)
  }
  remove(projectId: string): void {
    this.projects.delete(projectId)
  }
  close(): void {}
}
~~~
- [ ] **Step 4: 运行 Registry 与现有 Control Center 回归**
~~~bash
pnpm test -- src/control-center/project-registry.contract.test.ts src/control-center/sqlite-project-registry.test.ts src/control-center/control-center.test.ts
pnpm typecheck
~~~
Expected: 新旧测试全部 PASS；现有注册、恢复、missing 与取消注册行为不变。

- [ ] **Step 5: 提交**
~~~bash
git add src/control-center/project-registry.ts src/control-center/sqlite-project-registry.ts src/control-center/testing/test-project-registry.ts src/control-center/project-registry.contract.test.ts
git commit -m "feat: look up registered projects by id"
~~~
Expected: 提交只增加 Registry 查询能力和共享契约测试。

---

### Task 4: 以完整暂存和 no-replace 语义创建固定项目配置文件

**Files:**
- Modify: `src/control-center/host-runtime.ts`
- Modify: `src/control-center/node-host-runtime.ts`
- Modify: `src/control-center/node-host-runtime.test.ts`
- Modify: `src/control-center/errors.ts`
- Modify: `src/control-center/testing/test-host-runtime.ts`

**Interfaces:**
- Consumes: 已复核的规范开发项目根目录与 `buildProjectConfigurationPreview` 生成的 UTF-8 source。
- Produces:
  - `HostRuntime.createProjectConfiguration(rootPath: string, source: string): Promise<void>`
  - `projectConfigurationAlreadyExists(projectId?: string): ControlCenterError`
  - `TestHostRuntime.createdProjectConfigurations`，供后续 Control Center 测试观察公开调用结果。

- [ ] **Step 1: 写成功创建、已有文件和并发创建 RED 测试**

扩展 `node-host-runtime.test.ts` 的 fs import，使用真实临时目录验证公开方法：
~~~typescript
import { link, mkdtemp, mkdir, open, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
test('creates the complete project configuration as UTF-8', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  await mkdir(rootPath)
  const source = 'schema_version = 1\n\n[services.web]\nprogram = "pnpm"\n'
  await new NodeHostRuntime().createProjectConfiguration(rootPath, source)
  await expect(readFile(join(rootPath, '.devcontrol.toml'), 'utf8')).resolves.toBe(source)
  await expect(readdir(rootPath)).resolves.toEqual(['.devcontrol.toml'])
})
test('never changes an existing project configuration', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  const target = join(rootPath, '.devcontrol.toml')
  await mkdir(rootPath)
  await writeFile(target, 'existing-marker', 'utf8')
  await expect(
    new NodeHostRuntime().createProjectConfiguration(rootPath, 'replacement')
  ).rejects.toMatchObject({
    detail: {
      code: 'PROJECT_CONFIGURATION_ALREADY_EXISTS',
      resource: { kind: 'project_configuration' }
    }
  })
  await expect(readFile(target, 'utf8')).resolves.toBe('existing-marker')
  await expect(readdir(rootPath)).resolves.toEqual(['.devcontrol.toml'])
})
test('allows at most one concurrent creator and preserves its complete bytes', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  await mkdir(rootPath)
  const runtime = new NodeHostRuntime()
  const results = await Promise.allSettled([
    runtime.createProjectConfiguration(rootPath, 'first-complete\n'),
    runtime.createProjectConfiguration(rootPath, 'second-complete\n')
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  const rejected = results.filter((result): result is PromiseRejectedResult =>
    result.status === 'rejected'
  )
  expect(rejected).toHaveLength(1)
  expect(rejected[0]!.reason).toMatchObject({
    detail: { code: 'PROJECT_CONFIGURATION_ALREADY_EXISTS' }
  })
  const stored = await readFile(join(rootPath, '.devcontrol.toml'), 'utf8')
  expect(['first-complete\n', 'second-complete\n']).toContain(stored)
  await expect(readdir(rootPath)).resolves.toEqual(['.devcontrol.toml'])
})
~~~
- [ ] **Step 2: 写失败关闭/清理和不读取 `.env` 的 RED 测试**

把文件顶部现有 mock 扩展为可观测 `open`、`link` 与 `rm`，默认仍调用真实实现：
~~~typescript
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    realpath: vi.fn(actual.realpath),
    open: vi.fn(actual.open),
    link: vi.fn(actual.link),
    rm: vi.fn(actual.rm)
  }
})

beforeEach(async () => {
  vi.clearAllMocks()
  temporaryRoot = await mkdtemp(join(tmpdir(), 'developer-control-center-'))
})
~~~
失败测试向 `NodeHostRuntime` 注入固定暂存 ID，先用真实句柄创建同一个暂存路径，再让该句柄写入失败；最终路径必须始终不存在，暂存路径必须被清理：
~~~typescript
test('closes and removes only the staging file created by a failed write', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  const target = join(rootPath, '.devcontrol.toml')
  const staging = join(rootPath, '.devcontrol.toml.tmp-write-failure')
  await mkdir(rootPath)
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const handle = await actual.open(staging, 'wx')
  const close = vi.spyOn(handle, 'close')
  vi.spyOn(handle, 'writeFile').mockRejectedValueOnce(new Error('write sentinel'))
  vi.mocked(open).mockResolvedValueOnce(handle)
  await expect(
    new NodeHostRuntime(() => 'write-failure').createProjectConfiguration(rootPath, 'complete source')
  ).rejects.toThrow('write sentinel')
  expect(close).toHaveBeenCalledOnce()
  await expect(readFile(target, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(staging, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})
test('writes env file references without reading the referenced files', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  await mkdir(rootPath)
  const source = 'schema_version = 1\nenv_files = ["missing-secret.env"]\n'
  await new NodeHostRuntime().createProjectConfiguration(rootPath, source)
  await expect(readFile(join(rootPath, '.devcontrol.toml'), 'utf8')).resolves.toBe(source)
  await expect(readFile(join(rootPath, 'missing-secret.env'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})
~~~
同步、关闭、清理和文件系统错误使用以下实际用例：
~~~typescript
test.each(['sync', 'close'] as const)('does not publish when staging %s fails', async (method) => {
  const rootPath = join(temporaryRoot, `failure-${method}`)
  const staging = join(rootPath, `.devcontrol.toml.tmp-${method}-failure`)
  await mkdir(rootPath)
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const handle = await actual.open(staging, 'wx')
  const sentinel = new Error(`${method} sentinel`)
  if (method === 'sync') vi.spyOn(handle, 'sync').mockRejectedValueOnce(sentinel)
  if (method === 'close') {
    const actualClose = handle.close.bind(handle)
    vi.spyOn(handle, 'close').mockRejectedValueOnce(sentinel).mockImplementationOnce(actualClose)
  }
  vi.mocked(open).mockResolvedValueOnce(handle)
  await expect(
    new NodeHostRuntime(() => `${method}-failure`).createProjectConfiguration(rootPath, 'source')
  ).rejects.toBe(sentinel)
  await expect(readFile(join(rootPath, '.devcontrol.toml'), 'utf8'))
    .rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(staging, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})

test('preserves the write error when staging cleanup fails', async () => {
  const rootPath = join(temporaryRoot, 'cleanup-failure')
  const staging = join(rootPath, '.devcontrol.toml.tmp-cleanup-failure')
  await mkdir(rootPath)
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const handle = await actual.open(staging, 'wx')
  const sentinel = new Error('write sentinel')
  vi.spyOn(handle, 'writeFile').mockRejectedValueOnce(sentinel)
  vi.mocked(open).mockResolvedValueOnce(handle)
  vi.mocked(rm).mockRejectedValueOnce(new Error('cleanup sentinel'))
  await expect(
    new NodeHostRuntime(() => 'cleanup-failure').createProjectConfiguration(rootPath, 'source')
  ).rejects.toBe(sentinel)
})

test('keeps a successful published result when staging cleanup fails', async () => {
  const rootPath = join(temporaryRoot, 'published-cleanup-failure')
  await mkdir(rootPath)
  vi.mocked(rm).mockRejectedValueOnce(new Error('cleanup sentinel'))
  await expect(
    new NodeHostRuntime(() => 'published-cleanup-failure')
      .createProjectConfiguration(rootPath, 'complete source')
  ).resolves.toBeUndefined()
  await expect(readFile(join(rootPath, '.devcontrol.toml'), 'utf8'))
    .resolves.toBe('complete source')
  await expect(readdir(rootPath).then((entries) => entries.sort())).resolves.toEqual([
    '.devcontrol.toml',
    '.devcontrol.toml.tmp-published-cleanup-failure'
  ])
})

test.each(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'])('maps staging filesystem error %s', async (code) => {
  const rootPath = join(temporaryRoot, `filesystem-${code}`)
  await mkdir(rootPath)
  vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error('filesystem sentinel'), { code }))
  await expect(new NodeHostRuntime().createProjectConfiguration(rootPath, 'source'))
    .rejects.toMatchObject({ detail: { code: 'PROJECT_DIRECTORY_UNAVAILABLE' } })
  expect(link).not.toHaveBeenCalled()
})
~~~
已有 marker 与并发测试使用真实 `link`，分别证明 `EEXIST` 不改变最终字节、两个并发调用中恰好一个发布成功；普通非文件系统 sentinel 仍使用 `rejects.toBe(sentinel)` 证明原样抛出。

- [ ] **Step 3: 运行测试并确认方法缺失**
~~~bash
pnpm test -- src/control-center/node-host-runtime.test.ts
~~~
Expected: 新测试 FAIL，明确指出 `createProjectConfiguration` 尚未实现；现有目录检查测试仍 PASS。

- [ ] **Step 4: 扩展 Host Runtime 契约和错误工厂**

`host-runtime.ts` 完整接口改为：
~~~typescript
export interface HostRuntime {
  inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory>
  createProjectConfiguration(rootPath: string, source: string): Promise<void>
}
~~~
`errors.ts` 增加：
~~~typescript
export function projectConfigurationAlreadyExists(projectId?: string): ControlCenterError {
  return configurationError(
    'PROJECT_CONFIGURATION_ALREADY_EXISTS',
    undefined,
    'The project configuration already exists and was not changed.',
    'Open .devcontrol.toml in an external editor to review or change it.',
    projectId
  )
}
~~~
- [ ] **Step 5: 实现完整暂存、no-replace 发布与 best-effort 暂存清理**

在 `node-host-runtime.ts` 导入 `randomUUID`、`link`、`open`、`rm`、`join`、`ControlCenterError` 和新错误工厂。构造器只注入暂存 ID 生成器，生产默认仍是 `randomUUID`：
~~~typescript
constructor(private readonly nextStagingId: () => string = randomUUID) {}

async createProjectConfiguration(rootPath: string, source: string): Promise<void> {
  const targetPath = join(rootPath, '.devcontrol.toml')
  const stagingPath = join(rootPath, `.devcontrol.toml.tmp-${this.nextStagingId()}`)
  let handle: Awaited<ReturnType<typeof open>> | undefined
  let stagingCreated = false
  try {
    handle = await open(stagingPath, 'wx')
    stagingCreated = true
    await handle.writeFile(source, { encoding: 'utf8' })
    await handle.sync()
    await handle.close()
    handle = undefined
    try {
      await link(stagingPath, targetPath)
    } catch (error) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw projectConfigurationAlreadyExists()
      }
      throw error
    }
  } catch (error) {
    if (handle) {
      try {
        await handle.close()
      } catch {
        // The original write/sync/close error remains authoritative.
      }
    }
    if (error instanceof ControlCenterError) throw error
    rethrowFileSystemError(error, rootPath)
  } finally {
    if (stagingCreated) {
      try {
        await rm(stagingPath, { force: true })
      } catch {
        // Staging cleanup never changes the published result or original error.
      }
    }
  }
}
~~~
`rethrowFileSystemError` 继续只把 `ENOENT`、`ENOTDIR`、`EACCES`、`EPERM` 映射为 `projectDirectoryUnavailable(rootPath)`；只有 `link(stagingPath, targetPath)` 的 `EEXIST` 映射为 `PROJECT_CONFIGURATION_ALREADY_EXISTS`。最终路径只能由 `join(rootPath, '.devcontrol.toml')` 形成，暂存名只能由固定前缀加本地 `randomUUID` 形成，方法签名不得增加 basename 或任意 path 参数。文件系统不支持硬链接时保持未知错误并由 Main 脱敏，禁止回退到覆盖式 rename 或可暴露部分最终内容的 copy。

让 `TestHostRuntime` 满足新接口并可观察 source：
~~~typescript
export interface CreatedProjectConfiguration {
  rootPath: string
  source: string
}
export class TestHostRuntime implements HostRuntime {
  readonly createdProjectConfigurations: CreatedProjectConfiguration[] = []
  constructor(private readonly directories: ReadonlyMap<string, ProjectDirectory>) {}
  async inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory> {
    const directory = this.directories.get(rootPath)
    if (!directory) throw projectDirectoryUnavailable(rootPath)
    return directory
  }
  async createProjectConfiguration(rootPath: string, source: string): Promise<void> {
    this.createdProjectConfigurations.push({ rootPath, source })
  }
}
~~~
- [ ] **Step 6: 运行 GREEN、静态边界检查并提交**
~~~bash
pnpm test -- src/control-center/node-host-runtime.test.ts src/control-center/control-center.test.ts
pnpm typecheck
rg -n "\.devcontrol\.toml|open\(|link\(|readFile\(" src/control-center/node-host-runtime.ts
git add src/control-center/host-runtime.ts src/control-center/node-host-runtime.ts src/control-center/node-host-runtime.test.ts src/control-center/errors.ts src/control-center/testing/test-host-runtime.ts
git commit -m "feat: create project configuration exclusively"
~~~
Expected: 所有 Host Runtime 与回归测试 PASS；静态扫描命中固定最终名、暂存前缀、`open(stagingPath, 'wx')` 与 `link(stagingPath, targetPath)`，不命中 `readFile`、rename 或 copy；类型检查通过。

---

### Task 5: 通过 Control Center 编排预览与创建

**Files:**
- Modify: `src/control-center/control-center.ts`
- Modify: `src/control-center/control-center.test.ts`
- Modify: `src/control-center/errors.ts`

**Interfaces:**
- Consumes:
  - `ProjectRegistry.get(projectId: string): StoredProject | null`
  - `HostRuntime.inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory>`
  - `HostRuntime.createProjectConfiguration(rootPath: string, source: string): Promise<void>`
  - `buildProjectConfigurationPreview(draft: ProjectConfigurationDraft): ProjectConfigurationPreview`
- Produces:
  - `ControlCenter.previewProjectConfiguration(projectId, draft): Promise<ProjectConfigurationPreview>`
  - `ControlCenter.createProjectConfiguration(projectId, draft): Promise<ProjectConfigurationCreated>`
  - `projectNotFound(projectId)` 和 `withProjectId(error, projectId)`，保证公开配置/目录错误带可信注册 ID。

- [ ] **Step 1: 写 preview 不写文件与 create 使用规范根目录的 RED 测试**

使用 `TestProjectRegistry` 和 `TestHostRuntime` 建立显式项目身份：
~~~typescript
const configurationDraft: ProjectConfigurationDraft = {
  service: {
    id: 'web',
    program: 'pnpm',
    args: ['dev'],
    workingDirectory: '.',
    shell: false,
    envFiles: ['.env'],
    env: [{ key: 'NODE_ENV', value: 'development' }]
  }
}
test('previews a registered project without creating a file', async () => {
  const registry = new TestProjectRegistry([
    { id: 'project-1', name: 'sample-project', rootPath: '/stored/project' }
  ])
  const host = new TestHostRuntime(new Map([
    ['/stored/project', { canonicalPath: '/canonical/project', name: 'sample-project' }]
  ]))
  const center = new ControlCenter(registry, host)
  const preview = await center.previewProjectConfiguration('project-1', configurationDraft)
  expect(preview.source).toContain('schema_version = 1')
  expect(preview.source).toContain('NODE_ENV = "development"')
  expect(host.createdProjectConfigurations).toEqual([])
})
test('revalidates and creates in the canonical registered project root', async () => {
  const registry = new TestProjectRegistry([
    { id: 'project-1', name: 'sample-project', rootPath: '/stored/project' }
  ])
  const host = new TestHostRuntime(new Map([
    ['/stored/project', { canonicalPath: '/canonical/project', name: 'sample-project' }]
  ]))
  const center = new ControlCenter(registry, host)
  await center.previewProjectConfiguration('project-1', configurationDraft)
  const result = await center.createProjectConfiguration('project-1', configurationDraft)
  expect(result).toEqual({ relativePath: '.devcontrol.toml' })
  expect(host.createdProjectConfigurations).toEqual([
    {
      rootPath: '/canonical/project',
      source: expect.stringContaining('[services.web]')
    }
  ])
})
~~~
- [ ] **Step 2: 写重新校验、身份错误和项目 ID 注入 RED 测试**
~~~typescript
function configuredCenter(): { center: ControlCenter; host: TestHostRuntime } {
  const registry = new TestProjectRegistry([
    { id: 'project-1', name: 'sample-project', rootPath: '/stored/project' }
  ])
  const host = new TestHostRuntime(new Map([
    ['/stored/project', { canonicalPath: '/canonical/project', name: 'sample-project' }]
  ]))
  return { center: new ControlCenter(registry, host), host }
}

test('rejects a changed invalid draft at create time without writing', async () => {
  const { center, host } = configuredCenter()
  await center.previewProjectConfiguration('project-1', configurationDraft)
  const changed = structuredClone(configurationDraft)
  changed.service.workingDirectory = '../outside'
  await expect(center.createProjectConfiguration('project-1', changed)).rejects.toMatchObject({
    detail: {
      code: 'CONFIG_PATH_OUTSIDE_PROJECT',
      resource: { kind: 'project_configuration', projectId: 'project-1' },
      fieldPath: '$.service.workingDirectory'
    }
  })
  expect(host.createdProjectConfigurations).toEqual([])
})
test.each(['', '   '])('rejects an invalid project id before registry access', async (projectId) => {
  const registry = { get: vi.fn() } as unknown as ProjectRegistry
  const center = new ControlCenter(registry, {} as HostRuntime)
  await expect(center.previewProjectConfiguration(projectId, configurationDraft)).rejects.toMatchObject({
    detail: { code: 'INVALID_PROJECT_ID', resource: { kind: 'project' } }
  })
  expect(registry.get).not.toHaveBeenCalled()
})
test('distinguishes an unknown registration from a missing directory', async () => {
  const unknown = new ControlCenter(new TestProjectRegistry(), new TestHostRuntime(new Map()))
  await expect(unknown.previewProjectConfiguration('project-404', configurationDraft)).rejects.toMatchObject({
    detail: { code: 'PROJECT_NOT_FOUND', resource: { kind: 'project', id: 'project-404' } }
  })
  const missing = new ControlCenter(
    new TestProjectRegistry([{ id: 'project-1', name: 'missing', rootPath: '/missing' }]),
    new TestHostRuntime(new Map())
  )
  await expect(missing.previewProjectConfiguration('project-1', configurationDraft)).rejects.toMatchObject({
    detail: { code: 'PROJECT_DIRECTORY_UNAVAILABLE', resource: { kind: 'project', id: 'project-1' } }
  })
})

test('adds the trusted project id to an already-exists create failure', async () => {
  const { center, host } = configuredCenter()
  vi.spyOn(host, 'createProjectConfiguration').mockRejectedValueOnce(
    projectConfigurationAlreadyExists()
  )
  await expect(center.createProjectConfiguration('project-1', configurationDraft))
    .rejects.toMatchObject({
      detail: {
        code: 'PROJECT_CONFIGURATION_ALREADY_EXISTS',
        resource: { kind: 'project_configuration', projectId: 'project-1' }
      }
    })
})

test('queries the registration and directory again for every create', async () => {
  const registry = new TestProjectRegistry([
    { id: 'project-1', name: 'sample-project', rootPath: '/stored/project' }
  ])
  const host = new TestHostRuntime(new Map([
    ['/stored/project', { canonicalPath: '/canonical/project', name: 'sample-project' }]
  ]))
  const get = vi.spyOn(registry, 'get')
  const inspect = vi.spyOn(host, 'inspectProjectDirectory')
  const center = new ControlCenter(registry, host)
  await center.createProjectConfiguration('project-1', configurationDraft)
  await center.createProjectConfiguration('project-1', configurationDraft)
  expect(get).toHaveBeenCalledTimes(2)
  expect(inspect).toHaveBeenCalledTimes(2)
  expect(host.createdProjectConfigurations).toHaveLength(2)
})
~~~
这些用例与无效 draft 不触发 create、missing 项目不触发 Host Runtime 的断言共同证明顺序；不 mock 或断言配置模块私有函数。

- [ ] **Step 3: 运行测试并确认 Control Center 方法缺失**
~~~bash
pnpm test -- src/control-center/control-center.test.ts
~~~
Expected: 新增测试 FAIL，明确指出 `previewProjectConfiguration`/`createProjectConfiguration` 不存在；票据 01 的旧测试仍 PASS。

- [ ] **Step 4: 增加项目错误与可信项目 ID 重建函数**

在 `errors.ts` 增加：
~~~typescript
export function projectNotFound(projectId: string): ControlCenterError {
  return new ControlCenterError({
    code: 'PROJECT_NOT_FOUND',
    resource: { kind: 'project', id: projectId },
    message: 'The registered project could not be found.',
    nextAction: 'Return to the project list and refresh it.'
  })
}
export function withProjectId(error: ControlCenterError, projectId: string): ControlCenterError {
  if (error.detail.resource.kind === 'project_configuration') {
    return new ControlCenterError({
      ...error.detail,
      resource: { kind: 'project_configuration', projectId }
    })
  }
  if (error.detail.resource.kind === 'project') {
    return new ControlCenterError({
      ...error.detail,
      resource: { kind: 'project', id: projectId }
    })
  }
  return error
}
~~~
`invalidProjectId()` 继续使用 `resource: { kind: 'project' }`；不得把 Renderer 提交的其他字段写入 error resource。

- [ ] **Step 5: 实现共享准备流程和两个公开方法**

在 `control-center.ts` 导入配置类型/构建器和新错误函数，加入一个不暴露出类的准备方法：
~~~typescript
private async prepareProjectConfiguration(
  projectId: string,
  draft: ProjectConfigurationDraft
): Promise<{ rootPath: string; preview: ProjectConfigurationPreview }> {
  if (typeof projectId !== 'string' || projectId.trim().length === 0) throw invalidProjectId()
  const project = this.projectRegistry.get(projectId)
  if (project === null) throw projectNotFound(projectId)
  let directory: ProjectDirectory
  try {
    directory = await this.hostRuntime.inspectProjectDirectory(project.rootPath)
  } catch (error) {
    if (error instanceof ControlCenterError) throw withProjectId(error, projectId)
    throw error
  }
  try {
    return {
      rootPath: directory.canonicalPath,
      preview: buildProjectConfigurationPreview(draft)
    }
  } catch (error) {
    if (error instanceof ControlCenterError) throw withProjectId(error, projectId)
    throw error
  }
}
async previewProjectConfiguration(
  projectId: string,
  draft: ProjectConfigurationDraft
): Promise<ProjectConfigurationPreview> {
  return (await this.prepareProjectConfiguration(projectId, draft)).preview
}
async createProjectConfiguration(
  projectId: string,
  draft: ProjectConfigurationDraft
): Promise<ProjectConfigurationCreated> {
  const prepared = await this.prepareProjectConfiguration(projectId, draft)
  try {
    await this.hostRuntime.createProjectConfiguration(prepared.rootPath, prepared.preview.source)
  } catch (error) {
    if (error instanceof ControlCenterError) throw withProjectId(error, projectId)
    throw error
  }
  return { relativePath: '.devcontrol.toml' }
}
~~~
`ProjectDirectory` 从 `host-runtime.ts` 作为 type 导入。每次 create 都调用 `prepareProjectConfiguration`，不保存上次 preview，不增加 token 或缓存。

- [ ] **Step 6: 运行 GREEN、回归与提交**
~~~bash
pnpm test -- src/control-center/control-center.test.ts src/control-center/project-configuration.test.ts src/control-center/node-host-runtime.test.ts
pnpm typecheck
git add src/control-center/control-center.ts src/control-center/control-center.test.ts src/control-center/errors.ts
git commit -m "feat: orchestrate project configuration creation"
~~~
Expected: 新旧 Control Center 测试全部 PASS；preview 没有写入，create 使用规范根目录并重新校验，所有已分类错误携带可信项目 ID。

---

### Task 6: 接通固定配置 IPC 与安全 Preload

**Files:**
- Create: `src/main/ipc-result.ts`
- Modify: `src/main/register-project-ipc.ts`
- Modify: `src/main/register-project-ipc.test.ts`
- Create: `src/main/register-project-configuration-ipc.ts`
- Create: `src/main/register-project-configuration-ipc.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/renderer/src/App.test.tsx`
- Modify: `e2e/app-shell.spec.ts`

**Interfaces:**
- Consumes: Task 5 的两个 Control Center 方法，以及现有 trusted sender 谓词。
- Produces:
  - IPC channels `project-configurations:preview`、`project-configurations:create`
  - `registerProjectConfigurationIpc(ipc, controlCenter, isTrustedSender): void`
  - `DesktopApi.projectConfigurations.preview(projectId, draft): Promise<ActionResult<ProjectConfigurationPreview>>`
  - `DesktopApi.projectConfigurations.create(projectId, draft): Promise<ActionResult<ProjectConfigurationCreated>>`
  - 共享 `authorizedResult(event, isTrustedSender, resourceKind, action)`，领域错误只返回 detail，未知错误固定脱敏。

- [ ] **Step 1: 写固定通道、可信 sender 与 envelope RED 测试**

创建 `register-project-configuration-ipc.test.ts`，文件头和完整 fixture 如下：
~~~typescript
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ControlCenter } from '../control-center/control-center'
import { configurationError } from '../control-center/errors'
import type { ProjectConfigurationDraft } from '../shared/contracts'
import { registerProjectConfigurationIpc } from './register-project-configuration-ipc'

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
const trustedEvent = {} as IpcMainInvokeEvent
const untrustedEvent = {} as IpcMainInvokeEvent
const configurationDraft: ProjectConfigurationDraft = {
  service: {
    id: 'web',
    program: 'pnpm',
    args: ['dev'],
    workingDirectory: '.',
    shell: false,
    envFiles: [],
    env: []
  }
}
const previewProjectConfiguration = vi.fn<ControlCenter['previewProjectConfiguration']>()
const createProjectConfiguration = vi.fn<ControlCenter['createProjectConfiguration']>()
const controlCenter = {
  previewProjectConfiguration,
  createProjectConfiguration
} as unknown as ControlCenter
beforeEach(() => vi.resetAllMocks())
function captureHandlers() {
  const handlers = new Map<string, Handler>()
  const ipc = {
    handle(channel: string, handler: Handler) {
      handlers.set(channel, handler)
    }
  } as Pick<IpcMain, 'handle'>
  return { handlers, ipc }
}
test('registers exactly the two project configuration channels', () => {
  const { handlers, ipc } = captureHandlers()
  registerProjectConfigurationIpc(ipc, controlCenter, () => true)
  expect([...handlers.keys()].sort()).toEqual([
    'project-configurations:create',
    'project-configurations:preview'
  ])
})
test('forwards only projectId and a structured draft', async () => {
  const { handlers, ipc } = captureHandlers()
  previewProjectConfiguration.mockResolvedValue({ source: 'schema_version = 1\n' })
  registerProjectConfigurationIpc(ipc, controlCenter, () => true)
  await expect(handlers.get('project-configurations:preview')!(trustedEvent, {
    projectId: 'project-1',
    draft: configurationDraft
  })).resolves.toEqual({ ok: true, value: { source: 'schema_version = 1\n' } })
  expect(previewProjectConfiguration).toHaveBeenCalledWith('project-1', configurationDraft)
})
test('rejects an untrusted sender before any control center call', async () => {
  const { handlers, ipc } = captureHandlers()
  registerProjectConfigurationIpc(ipc, controlCenter, () => false)
  await expect(handlers.get('project-configurations:create')!(untrustedEvent, {
    projectId: 'project-1', draft: configurationDraft
  })).resolves.toMatchObject({ ok: false, error: { code: 'UNTRUSTED_IPC_SENDER' } })
  expect(createProjectConfiguration).not.toHaveBeenCalled()
})

test.each([
  ['null request', null, 'CONFIG_FIELD_TYPE_INVALID', '$'],
  ['array request', [], 'CONFIG_FIELD_TYPE_INVALID', '$'],
  ['missing project id', {}, 'INVALID_PROJECT_ID', undefined],
  ['empty project id', { projectId: '', draft: {} }, 'INVALID_PROJECT_ID', undefined],
  ['non-object draft', { projectId: 'project-1', draft: null }, 'CONFIG_FIELD_TYPE_INVALID', '$.draft'],
  ['root path capability', { projectId: 'project-1', draft: configurationDraft, rootPath: '/private' }, 'CONFIG_UNKNOWN_FIELD', '$.rootPath'],
  ['source capability', { projectId: 'project-1', draft: configurationDraft, source: 'toml' }, 'CONFIG_UNKNOWN_FIELD', '$.source'],
  ['file name capability', { projectId: 'project-1', draft: configurationDraft, fileName: 'other.toml' }, 'CONFIG_UNKNOWN_FIELD', '$.fileName']
] as const)('rejects malformed envelope: %s', async (_name, value, code, fieldPath) => {
  const { handlers, ipc } = captureHandlers()
  registerProjectConfigurationIpc(ipc, controlCenter, () => true)
  const result = await handlers.get('project-configurations:preview')!(trustedEvent, value)
  expect(result).toMatchObject({ ok: false, error: { code } })
  if (fieldPath === undefined) {
    expect(result).not.toHaveProperty('error.fieldPath')
  } else {
    expect(result).toHaveProperty('error.fieldPath', fieldPath)
  }
  expect(previewProjectConfiguration).not.toHaveBeenCalled()
  expect(createProjectConfiguration).not.toHaveBeenCalled()
})
~~~

- [ ] **Step 2: 写领域/未知错误脱敏和 Preload 能力 RED 测试**
~~~typescript
test('serializes configuration errors without stack or environment value', async () => {
  const secretValue = 'ipc-secret-mutation-4815'
  const { handlers, ipc } = captureHandlers()
  previewProjectConfiguration.mockRejectedValue(configurationError(
    'CONFIG_ENVIRONMENT_KEY_DUPLICATE',
    '$.service.env[1].key',
    'The environment variable name is duplicated.',
    'Keep one row for this environment variable.',
    'project-1'
  ))
  registerProjectConfigurationIpc(ipc, controlCenter, () => true)
  const result = await handlers.get('project-configurations:preview')!(trustedEvent, {
    projectId: 'project-1',
    draft: { ...configurationDraft, service: { ...configurationDraft.service, env: [
      { key: 'SAFE_KEY', value: secretValue },
      { key: 'SAFE_KEY', value: secretValue }
    ] } }
  })
  expect(result).toMatchObject({
    ok: false,
    error: { code: 'CONFIG_ENVIRONMENT_KEY_DUPLICATE', fieldPath: '$.service.env[1].key' }
  })
  expect(JSON.stringify(result)).not.toContain(secretValue)
  expect(JSON.stringify(result)).not.toContain('stack')
})
test('replaces unexpected errors with fixed configuration-safe details', async () => {
  const { handlers, ipc } = captureHandlers()
  createProjectConfiguration.mockRejectedValue(new Error('secret-value and /private/path'))
  registerProjectConfigurationIpc(ipc, controlCenter, () => true)
  const result = await handlers.get('project-configurations:create')!(trustedEvent, {
    projectId: 'project-1', draft: configurationDraft
  })
  expect(result).toEqual({
    ok: false,
    error: {
      code: 'UNEXPECTED_ERROR',
      resource: { kind: 'project_configuration' },
      message: 'The project configuration action could not be completed.',
      nextAction: 'Try again. If the problem continues, restart the application.'
    }
  })
  expect(JSON.stringify(result)).not.toContain('secret-value')
  expect(JSON.stringify(result)).not.toContain('/private/path')
})
~~~
先更新 `e2e/app-shell.spec.ts` 的能力快照，使顶层和配置方法都按字典序比较：
~~~typescript
const candidate = window as unknown as {
  desktop?: { projects?: object; projectConfigurations?: object }
}
return {
  hasRequire: 'require' in window,
  hasProcess: 'process' in window,
  desktopKeys: candidate.desktop ? Object.keys(candidate.desktop).sort() : [],
  projectKeys: candidate.desktop?.projects
    ? Object.keys(candidate.desktop.projects).sort()
    : [],
  configurationKeys: candidate.desktop?.projectConfigurations
    ? Object.keys(candidate.desktop.projectConfigurations).sort()
    : []
}
~~~
期望固定为 `desktopKeys: ['projectConfigurations', 'projects']`、`configurationKeys: ['create', 'preview']`、`projectKeys: ['add', 'list', 'remove']`，并继续要求 `require/process` 不可见。此时运行 E2E 应因 Preload 尚未暴露新接口而失败。

- [ ] **Step 3: 运行 RED 测试**
~~~bash
pnpm test -- src/main/register-project-configuration-ipc.test.ts src/main/register-project-ipc.test.ts
pnpm test:e2e -- e2e/app-shell.spec.ts
~~~
Expected: 单元测试因注册函数缺失而 FAIL；E2E 因 `projectConfigurations` 不存在而 FAIL；原项目通道测试不得出现与测试基建无关的失败。

- [ ] **Step 4: 提取统一 ActionResult 包装并保持项目注册行为不变**

创建 `src/main/ipc-result.ts`：
~~~typescript
import type { IpcMainInvokeEvent } from 'electron'
import { ControlCenterError } from '../control-center/errors'
import type { ActionableError, ActionResult } from '../shared/contracts'
type ResourceKind = 'project' | 'project_configuration'
function unexpectedError(resourceKind: ResourceKind): ActionableError {
  return {
    code: 'UNEXPECTED_ERROR',
    resource: { kind: resourceKind },
    message: resourceKind === 'project_configuration'
      ? 'The project configuration action could not be completed.'
      : 'The project action could not be completed.',
    nextAction: 'Try again. If the problem continues, restart the application.'
  }
}
function untrustedIpcSender(): ActionableError {
  return {
    code: 'UNTRUSTED_IPC_SENDER',
    resource: { kind: 'application' },
    message: 'The request was rejected.',
    nextAction: 'Use the Developer Control Center window and try again.'
  }
}
export async function authorizedResult<T>(
  event: IpcMainInvokeEvent,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  resourceKind: ResourceKind,
  action: () => Promise<T>
): Promise<ActionResult<T>> {
  if (!isTrustedSender(event)) return { ok: false, error: untrustedIpcSender() }
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ControlCenterError ? error.detail : unexpectedError(resourceKind)
    }
  }
}
~~~
把 `register-project-ipc.ts` 的本地 `unexpectedError`、`untrustedIpcSender`、`resultOf` 和 `authorized` 删除，每个 handler 改为调用 `authorizedResult(event, isTrustedSender, 'project', action)`；运行其现有测试确认通道、取消选择、领域错误和未知错误文案保持通过。

- [ ] **Step 5: 实现 envelope 校验与两个固定 handler**

创建 `register-project-configuration-ipc.ts`：
~~~typescript
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { ControlCenter } from '../control-center/control-center'
import { configurationError, invalidProjectId } from '../control-center/errors'
import type { ProjectConfigurationDraft } from '../shared/contracts'
import { authorizedResult } from './ipc-result'
type Request = { projectId: string; draft: ProjectConfigurationDraft }
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function requestFrom(value: unknown): Request {
  if (!isRecord(value)) {
    throw configurationError('CONFIG_FIELD_TYPE_INVALID', '$', 'The configuration request has the wrong type.', 'Submit a structured configuration request.')
  }
  const unknown = Object.keys(value).find((key) => key !== 'projectId' && key !== 'draft')
  if (unknown !== undefined) {
    throw configurationError('CONFIG_UNKNOWN_FIELD', `$.${unknown}`, 'The configuration request contains an unknown field.', 'Remove the unsupported request field.')
  }
  if (typeof value.projectId !== 'string' || value.projectId.trim().length === 0) {
    throw invalidProjectId()
  }
  if (!isRecord(value.draft)) {
    throw configurationError('CONFIG_FIELD_TYPE_INVALID', '$.draft', 'The configuration draft has the wrong type.', 'Submit a structured configuration draft.')
  }
  return { projectId: value.projectId, draft: value.draft as unknown as ProjectConfigurationDraft }
}
export function registerProjectConfigurationIpc(
  ipc: Pick<IpcMain, 'handle'>,
  controlCenter: ControlCenter,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
): void {
  ipc.handle('project-configurations:preview', (event, input: unknown) =>
    authorizedResult(event, isTrustedSender, 'project_configuration', async () => {
      const request = requestFrom(input)
      return controlCenter.previewProjectConfiguration(request.projectId, request.draft)
    })
  )
  ipc.handle('project-configurations:create', (event, input: unknown) =>
    authorizedResult(event, isTrustedSender, 'project_configuration', async () => {
      const request = requestFrom(input)
      return controlCenter.createProjectConfiguration(request.projectId, request.draft)
    })
  )
}
~~~
Main 只检查 envelope；`draft.service` 及其以下所有字段由 Task 2 的配置模块检查。`requestFrom` 不导出，不接受根路径、文件名、source 或动态 channel。

- [ ] **Step 6: 扩展 DesktopApi、Preload 和生产组装**

`DesktopApi` 完整形状变为：
~~~typescript
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
~~~
在 `preload/index.ts` 现有 `projects` 同级增加：
~~~typescript
projectConfigurations: {
  preview: (projectId: string, draft: ProjectConfigurationDraft) =>
    ipcRenderer.invoke('project-configurations:preview', { projectId, draft }) as
      ReturnType<DesktopApi['projectConfigurations']['preview']>,
  create: (projectId: string, draft: ProjectConfigurationDraft) =>
    ipcRenderer.invoke('project-configurations:create', { projectId, draft }) as
      ReturnType<DesktopApi['projectConfigurations']['create']>
}
~~~
Preload 同时从共享契约导入 `ProjectConfigurationDraft` type。在 `main/index.ts` 创建一次 trusted sender 谓词并同时注册两个 IPC 模块：
~~~typescript
const isTrustedSender = (event: IpcMainInvokeEvent) =>
  event.senderFrame === mainWindow.webContents.mainFrame
registerProjectIpc(
  ipcMain,
  controlCenter,
  createProjectDirectoryPicker(mainWindow),
  isTrustedSender
)
registerProjectConfigurationIpc(ipcMain, controlCenter, isTrustedSender)
~~~
在现有 `App.test.tsx` 的每个 `DesktopApi` fake 中加入不会被票据 01 测试调用的完整命名空间，保证本任务的全仓类型检查独立通过：
~~~typescript
projectConfigurations: {
  preview: async () => ({ ok: true, value: { source: 'schema_version = 1\n' } }),
  create: async () => ({ ok: true, value: { relativePath: '.devcontrol.toml' } })
}
~~~
- [ ] **Step 7: 运行 GREEN、安全能力扫描并提交**
~~~bash
pnpm test -- src/main/register-project-configuration-ipc.test.ts src/main/register-project-ipc.test.ts
pnpm typecheck
pnpm test:e2e -- e2e/app-shell.spec.ts
rg -n "ipcRenderer|project-configurations:|rootPath|fileName|source" src/preload/index.ts src/main/register-project-configuration-ipc.ts
git add src/main src/preload/index.ts src/shared/contracts.ts src/renderer/src/App.test.tsx e2e/app-shell.spec.ts
git commit -m "feat: expose safe project configuration intents"
~~~
Expected: 两组 Main 测试、类型检查和 app-shell E2E 全部 PASS；Preload 只有固定 `ipcRenderer.invoke` 通道，配置请求不接受 rootPath/fileName/source，Renderer 仍看不到 `require`、`process` 或通用 invoke。

---

### Task 7: 实现同窗配置表单与预览状态机

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/ProjectListView.tsx`
- Create: `src/renderer/src/ProjectConfigurationView.tsx`
- Create: `src/renderer/src/ServiceConfigurationForm.tsx`
- Create: `src/renderer/src/ProjectConfigurationPreviewPanel.tsx`
- Create: `src/renderer/src/ConfigurationSuccess.tsx`
- Modify: `src/renderer/src/App.test.tsx`
- Create: `src/renderer/src/ProjectConfigurationView.test.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: `DesktopApi.projectConfigurations.preview/create`、available `ProjectSnapshot` 和全部 draft/result/error 类型。
- Produces: `ConfigurationWorkflowState` 四态联合；`ProjectListView({ projects, error, onAdd, onRemove, onConfigure })`；`ProjectConfigurationView({ desktop, project, onBack })`；表单、预览和成功子组件都只接收序列化 props/callback。

- [ ] **Step 1: 写入口、draft、预览失效和创建 RED 测试**

`ProjectConfigurationView.test.tsx` 先建立完整公开依赖，再覆盖核心流：
~~~tsx
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { DesktopApi, ProjectSnapshot } from '../../shared/contracts'
import { ProjectConfigurationView } from './ProjectConfigurationView'

const project = {
  id: 'project-1',
  name: 'sample-project',
  rootPath: '/projects/sample-project',
  availability: 'available'
} satisfies Extract<ProjectSnapshot, { availability: 'available' }>
const preview = vi.fn<DesktopApi['projectConfigurations']['preview']>()
const create = vi.fn<DesktopApi['projectConfigurations']['create']>()
const desktop: DesktopApi = {
  projects: {
    list: async () => ({ ok: true, value: [project] }),
    add: async () => ({ ok: true, value: null }),
    remove: async () => ({ ok: true, value: null })
  },
  projectConfigurations: { preview, create }
}
beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

test('previews the structured draft, invalidates it after editing, then creates once', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'schema_version = 1\n[services.web]\nprogram = "pnpm"\n' } })
  create.mockResolvedValue({ ok: true, value: { relativePath: '.devcontrol.toml' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)
  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Add argument' }))
  await user.type(screen.getByLabelText('Argument 1'), 'dev')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(preview).toHaveBeenCalledWith('project-1', expect.objectContaining({ service: expect.objectContaining({
    id: 'web', program: 'pnpm', args: ['dev'], workingDirectory: '.', shell: false, envFiles: [], env: []
  }) }))
  expect(screen.getByText(/schema_version = 1/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Back to editing' }))
  await user.clear(screen.getByLabelText('Working directory'))
  await user.type(screen.getByLabelText('Working directory'), 'apps/web')
  expect(screen.queryByRole('button', { name: 'Create configuration' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  await user.click(screen.getByRole('button', { name: 'Create configuration' }))
  expect(create).toHaveBeenCalledTimes(1)
  expect(await screen.findByText('.devcontrol.toml created')).toBeVisible()
})

test('ignores a stale preview response after the draft changes', async () => {
  let resolveFirst!: (value: Awaited<ReturnType<typeof preview>>) => void
  preview.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
  preview.mockResolvedValueOnce({ ok: true, value: { source: 'new preview' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)
  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  await user.clear(screen.getByLabelText('Program'))
  await user.type(screen.getByLabelText('Program'), 'npm')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(await screen.findByText('new preview')).toBeVisible()
  await act(async () => resolveFirst({ ok: true, value: { source: 'stale preview' } }))
  expect(screen.getByText('new preview')).toBeVisible()
  expect(screen.queryByText('stale preview')).not.toBeInTheDocument()
})
~~~
同一测试文件加入 Shell、平台覆盖、防重复提交和字段错误用例：
~~~tsx
test('submits shell only after selection and omits disabled platform overrides', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'preview' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)
  await user.type(screen.getByLabelText('Program'), 'pnpm')
  expect(screen.getByLabelText('Run through shell')).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'macOS overrides' })).toHaveAttribute('aria-expanded', 'false')
  await user.click(screen.getByLabelText('Run through shell'))
  await user.click(screen.getByRole('button', { name: 'macOS overrides' }))
  await user.type(screen.getByLabelText('macOS Program'), 'node')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(preview).toHaveBeenCalledWith('project-1', expect.objectContaining({
    service: expect.objectContaining({ shell: true, macos: { program: 'node' } })
  }))
  expect(preview.mock.calls[0]![1].service.windows).toBeUndefined()
})

test('submits Windows program, argument and environment overrides only', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'preview' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)
  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Windows overrides' }))
  await user.type(screen.getByLabelText('Windows Program'), 'pnpm.cmd')
  await user.click(screen.getByRole('button', { name: 'Add Windows argument' }))
  await user.type(screen.getByLabelText('Windows Argument 1'), 'dev')
  await user.click(screen.getByRole('button', { name: 'Add windows environment value' }))
  await user.type(screen.getByLabelText('Windows Environment key 1'), 'WATCH_MODE')
  await user.type(screen.getByLabelText('Windows Environment value 1'), 'poll')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(preview.mock.calls[0]![1].service.windows).toEqual({
    program: 'pnpm.cmd',
    args: ['dev'],
    env: [{ key: 'WATCH_MODE', value: 'poll' }]
  })
})

test.each([
  ['Add argument', 'Argument 1', 'dev', 'Remove argument 1', 'args'],
  ['Add environment file', 'Environment file 1', '.env', 'Remove environment file 1', 'envFiles']
] as const)('adds and removes a %s row without retaining stale data', async (
  addName, inputName, value, removeName, field
) => {
  preview.mockResolvedValue({ ok: true, value: { source: 'preview' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)
  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: addName }))
  await user.type(screen.getByLabelText(inputName), value)
  await user.click(screen.getByRole('button', { name: removeName }))
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(preview.mock.calls[0]![1].service[field]).toEqual([])
})

test('adds and removes an environment row without retaining its value', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'preview' } })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)
  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Add environment value' }))
  await user.type(screen.getByLabelText('Environment key 1'), 'PORT')
  await user.type(screen.getByLabelText('Environment value 1'), '3000')
  await user.click(screen.getByRole('button', { name: 'Remove environment value 1' }))
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(preview.mock.calls[0]![1].service.env).toEqual([])
})

test('prevents duplicate create calls while the first request is pending', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'preview' } })
  let resolveCreate!: (value: Awaited<ReturnType<typeof create>>) => void
  create.mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve }))
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)
  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  const createButton = screen.getByRole('button', { name: 'Create configuration' })
  await user.dblClick(createButton)
  expect(create).toHaveBeenCalledTimes(1)
  expect(createButton).toBeDisabled()
  resolveCreate({ ok: true, value: { relativePath: '.devcontrol.toml' } })
  expect(await screen.findByText('.devcontrol.toml created')).toBeVisible()
})

test('focuses a mapped field error without rendering the environment value', async () => {
  const secretValue = 'renderer-secret-mutation-7124'
  preview.mockResolvedValue({
    ok: false,
    error: {
      code: 'CONFIG_ENVIRONMENT_KEY_DUPLICATE',
      resource: { kind: 'project_configuration', projectId: 'project-1' },
      fieldPath: '$.service.env[1].key',
      message: 'The environment variable name is duplicated.',
      nextAction: 'Keep one row for this environment variable.'
    }
  })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)
  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Add environment value' }))
  await user.click(screen.getByRole('button', { name: 'Add environment value' }))
  await user.type(screen.getByLabelText('Environment key 2'), 'SAFE_KEY')
  await user.type(screen.getByLabelText('Environment value 2'), secretValue)
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(screen.getByLabelText('Environment key 2')).toBeFocused()
  expect(screen.getByRole('alert')).not.toHaveTextContent(secretValue)
})
~~~
在 `App.test.tsx` 加入以下 available/missing 入口断言：
~~~tsx
test('offers configuration only for an available project', async () => {
  const availableProject: ProjectSnapshot = {
    id: 'project-available',
    name: 'sample-project',
    rootPath: '/projects/sample-project',
    availability: 'available'
  }
  const missingProject: ProjectSnapshot = {
    id: 'project-missing',
    name: 'missing-project',
    rootPath: '/projects/missing-project',
    availability: 'missing',
    problem: {
      code: 'PROJECT_DIRECTORY_UNAVAILABLE',
      resource: { kind: 'project', id: 'project-missing' },
      message: 'The project directory is unavailable.',
      nextAction: 'Reconnect the drive and try again.'
    }
  }
  render(<App desktop={createDesktopApi(availableProject, [availableProject, missingProject])} />)
  expect(await screen.findByRole('button', { name: 'Configure sample-project' })).toBeVisible()
  expect(screen.queryByRole('button', { name: `Configure ${missingProject.name}` })).not.toBeInTheDocument()
})
~~~
页级错误焦点使用以下参数化测试；动态参数、环境值和 env-file 各在核心测试中执行一次增加和删除，并在每次改变后断言 `Create configuration` 不存在：
~~~tsx
test.each([
  ['CONFIG_UNKNOWN_FIELD', '$.service.unknown', 'project_configuration'],
  ['PROJECT_NOT_FOUND', undefined, 'project'],
  ['PROJECT_DIRECTORY_UNAVAILABLE', undefined, 'project'],
  ['PROJECT_CONFIGURATION_ALREADY_EXISTS', undefined, 'project_configuration']
] as const)('focuses the page alert for %s', async (code, fieldPath, kind) => {
  preview.mockResolvedValue({
    ok: false,
    error: {
      code,
      resource: kind === 'project'
        ? { kind: 'project', id: 'project-1' }
        : { kind: 'project_configuration', projectId: 'project-1' },
      ...(fieldPath === undefined ? {} : { fieldPath }),
      message: 'The configuration action failed.',
      nextAction: 'Review the project and try again.'
    }
  })
  const user = userEvent.setup()
  render(<ProjectConfigurationView desktop={desktop} project={project} onBack={vi.fn()} />)
  await user.type(screen.getByLabelText('Program'), 'pnpm')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(await screen.findByRole('alert')).toBeFocused()
})
~~~

- [ ] **Step 2: 运行 RED 测试**
~~~bash
pnpm test -- src/renderer/src/App.test.tsx src/renderer/src/ProjectConfigurationView.test.tsx
~~~
Expected: FAIL，因为 Configure 入口、配置组件和状态机尚不存在。

- [ ] **Step 3: 实现顶层视图与精确状态机**
~~~tsx
import { useEffect, useRef, useState } from 'react'
import type {
  ActionableError,
  DesktopApi,
  ProjectConfigurationCreated,
  ProjectConfigurationDraft,
  ProjectConfigurationPreview,
  ProjectSnapshot
} from '../../shared/contracts'
import { ConfigurationSuccess } from './ConfigurationSuccess'
import { ProjectConfigurationPreviewPanel } from './ProjectConfigurationPreviewPanel'
import { ServiceConfigurationForm } from './ServiceConfigurationForm'

type ConfigurationWorkflowState =
  | { kind: 'editing'; draft: ProjectConfigurationDraft; error?: ActionableError }
  | { kind: 'previewing'; draft: ProjectConfigurationDraft; preview: ProjectConfigurationPreview; error?: ActionableError }
  | { kind: 'creating'; draft: ProjectConfigurationDraft; preview: ProjectConfigurationPreview }
  | { kind: 'created'; result: ProjectConfigurationCreated }
const initialDraft: ProjectConfigurationDraft = { service: {
  id: 'web', program: '', args: [], workingDirectory: '.', shell: false, envFiles: [], env: []
} }
export function ProjectConfigurationView({ desktop, project, onBack }: ProjectConfigurationViewProps) {
const [state, setState] = useState<ConfigurationWorkflowState>({
  kind: 'editing',
  draft: structuredClone(initialDraft)
})
const previewSequence = useRef(0)
const createInFlight = useRef(false)
const alertRef = useRef<HTMLElement>(null)
function editDraft(nextDraft: ProjectConfigurationDraft): void {
  previewSequence.current += 1
  setState({ kind: 'editing', draft: nextDraft })
}
async function previewConfiguration() {
  if (state.kind !== 'editing') return
  const sequence = ++previewSequence.current
  const draftSnapshot = structuredClone(state.draft)
  const result = await desktop.projectConfigurations.preview(project.id, draftSnapshot)
  if (sequence !== previewSequence.current) return
  setState(result.ok
    ? { kind: 'previewing', draft: draftSnapshot, preview: result.value }
    : { kind: 'editing', draft: draftSnapshot, error: result.error })
}
async function createConfiguration() {
  if (state.kind !== 'previewing' || createInFlight.current) return
  createInFlight.current = true
  const snapshot = state
  setState({ kind: 'creating', draft: snapshot.draft, preview: snapshot.preview })
  try {
    const result = await desktop.projectConfigurations.create(project.id, snapshot.draft)
    setState(result.ok
      ? { kind: 'created', result: result.value }
      : { ...snapshot, error: result.error })
  } finally {
    createInFlight.current = false
  }
}
const stateError = state.kind === 'editing' || state.kind === 'previewing'
  ? state.error
  : undefined
useEffect(() => {
  if (!stateError) return
  const controlId = controlIdFor(stateError.fieldPath)
  const target = controlId ? document.getElementById(controlId) : alertRef.current
  ;(target ?? alertRef.current)?.focus()
}, [stateError])
if (state.kind === 'created') {
  return <main className="app-shell configuration-page">
    <button type="button" onClick={onBack}>Back to projects</button>
    <ConfigurationSuccess result={state.result} />
  </main>
}
return <main className="app-shell configuration-page">
  <header className="app-header">
    <div><p className="eyebrow">Project configuration</p><h1>{project.name}</h1></div>
  </header>
  <div className="configuration-layout">
    {state.kind === 'editing' ? <section>
      {state.error ? <section ref={alertRef} tabIndex={-1} className="action-error" role="alert">
        <strong>{state.error.message}</strong><span>{state.error.nextAction}</span>
      </section> : null}
      <ServiceConfigurationForm draft={state.draft} error={state.error}
        onChange={editDraft} onPreview={() => void previewConfiguration()} onBack={onBack} />
    </section> : <ProjectConfigurationPreviewPanel
      preview={state.preview}
      creating={state.kind === 'creating'}
      error={state.kind === 'previewing' ? state.error : undefined}
      alertRef={alertRef}
      onBack={() => setState({ kind: 'editing', draft: state.draft })}
      onCreate={() => void createConfiguration()}
    />}
    <aside className="configuration-help">
      <h2>Portable configuration</h2>
      <p>Paths stay relative to the project root. Put secrets in referenced .env files.</p>
    </aside>
  </div>
</main>
}
~~~
`ProjectConfigurationView.tsx` 自己声明以下 props；其他组件的 props 与 imports 放在各自模块中：
~~~tsx
interface ProjectConfigurationViewProps {
  desktop: DesktopApi
  project: Extract<ProjectSnapshot, { availability: 'available' }>
  onBack(): void
}
~~~
`ConfigurationSuccess.tsx` 与 `ProjectConfigurationPreviewPanel.tsx` 使用以下完整最小实现：
~~~tsx
// ConfigurationSuccess.tsx
import type { ProjectConfigurationCreated } from '../../shared/contracts'
export function ConfigurationSuccess({ result }: { result: ProjectConfigurationCreated }) {
  return <section className="configuration-success" aria-live="polite">
    <h2>{result.relativePath} created</h2>
    <p>Created at the project root.</p>
  </section>
}

// ProjectConfigurationPreviewPanel.tsx
import type { RefObject } from 'react'
import type { ActionableError, ProjectConfigurationPreview } from '../../shared/contracts'
interface PreviewPanelProps {
  preview: ProjectConfigurationPreview
  creating: boolean
  error: ActionableError | undefined
  alertRef: RefObject<HTMLElement | null>
  onBack(): void
  onCreate(): void
}
export function ProjectConfigurationPreviewPanel(props: PreviewPanelProps) {
  return <section aria-labelledby="configuration-preview-heading">
    <h2 id="configuration-preview-heading">Configuration preview</h2>
    {props.error ? <section ref={props.alertRef} tabIndex={-1} className="action-error" role="alert">
      <strong>{props.error.message}</strong><span>{props.error.nextAction}</span>
    </section> : null}
    <pre tabIndex={0} aria-label="Project configuration preview">{props.preview.source}</pre>
    <div className="configuration-actions">
      <button type="button" onClick={props.onBack} disabled={props.creating}>Back to editing</button>
      <button type="button" className="primary-action" onClick={props.onCreate} disabled={props.creating}>
        {props.creating ? 'Creating configuration…' : 'Create configuration'}
      </button>
    </div>
  </section>
}
~~~

`App.tsx` 保留现有 list/add/remove 状态与方法，只把返回分支改成下面的精确顶层切换；`ProjectListView` 接收并渲染原有 header、错误、空状态和项目行 JSX，项目行的操作区使用这里给出的按钮条件：
~~~tsx
import { ProjectConfigurationView } from './ProjectConfigurationView'
import { ProjectListView } from './ProjectListView'

const [configuredProject, setConfiguredProject] = useState<
  Extract<ProjectSnapshot, { availability: 'available' }> | null
>(null)
if (configuredProject) {
  return <ProjectConfigurationView
    desktop={desktop}
    project={configuredProject}
    onBack={() => setConfiguredProject(null)}
  />
}
return <ProjectListView
  projects={projects}
  error={error}
  onAdd={() => void addProject()}
  onRemove={(projectId) => void removeProject(projectId)}
  onConfigure={setConfiguredProject}
/>

// ProjectListView.tsx
import type { ActionableError, ProjectSnapshot } from '../../shared/contracts'
interface ProjectListViewProps {
  projects: ProjectSnapshot[]
  error: ActionableError | null
  onAdd(): void
  onRemove(projectId: string): void
  onConfigure(project: Extract<ProjectSnapshot, { availability: 'available' }>): void
}
export function ProjectListView(props: ProjectListViewProps) {
  return <main className="app-shell">
    <header className="app-header">
      <div><p className="eyebrow">Local workspace</p><h1>Developer Control Center</h1>
        <p className="introduction">Register local repositories and keep their development services in view.</p>
      </div>
      <button className="primary-action" type="button" onClick={props.onAdd}>Add project</button>
    </header>
    {props.error ? <section className="action-error" role="alert">
      <strong>{props.error.message}</strong><span>{props.error.nextAction}</span>
    </section> : null}
    <section className="projects" aria-labelledby="projects-heading">
      <div className="section-heading"><div><p className="eyebrow">Projects</p>
        <h2 id="projects-heading">Registered projects</h2></div>
        <span className="project-count" aria-label={`${props.projects.length} registered projects`}>
          {props.projects.length}
        </span>
      </div>
      {props.projects.length === 0 ? <div className="empty-state">
        <p className="empty-title">No projects yet</p>
        <p>Add a local repository to begin managing its development services.</p>
      </div> : <ul className="project-list">{props.projects.map((project) => <li
        className="project-row" key={project.id}>
        <div className="project-summary"><div className="project-title-row"><h3>{project.name}</h3>
          <span className={`status status-${project.availability}`}>
            {project.availability === 'available' ? 'Available' : 'Missing'}
          </span></div>
          <p className="project-path">{project.rootPath}</p>
          {project.availability === 'missing' ? <div className="project-problem" role="alert">
            <strong>{project.problem.message}</strong><span>{project.problem.nextAction}</span>
          </div> : null}
        </div>
        <div className="project-actions">
          {project.availability === 'available' ? <button type="button" className="secondary-action"
            aria-label={`Configure ${project.name}`} onClick={() => props.onConfigure(project)}>
            Configure
          </button> : null}
          <button type="button" className="secondary-action" aria-label={`Remove ${project.name}`}
            onClick={() => props.onRemove(project.id)}>Remove</button>
        </div>
      </li>)}</ul>}
    </section>
  </main>
}
~~~
状态机中的 `useEffect` 通过下面的纯映射解析已知 control ID；找到控件则聚焦控件，否则聚焦带 `tabIndex={-1}` 的页级 alert。映射只解析固定正则，不执行路径表达式：
~~~tsx
function controlIdFor(fieldPath: string | undefined): string | undefined {
  if (fieldPath === '$.service.id') return 'service-id'
  if (fieldPath === '$.service.program') return 'program'
  if (fieldPath === '$.service.workingDirectory') return 'working-directory'
  const indexed = fieldPath?.match(/^\$\.service\.(args|envFiles|env)\[(\d+)](?:\.(key|value))?$/)
  if (indexed) {
    const index = indexed[2]
    if (indexed[1] === 'args') return `argument-${index}`
    if (indexed[1] === 'envFiles') return `env-file-${index}`
    return `environment-${indexed[3]}-${index}`
  }
  const platform = fieldPath?.match(/^\$\.service\.(macos|windows)\.(program|args|env)(?:\[(\d+)])?(?:\.(key|value))?$/)
  if (!platform) return undefined
  if (platform[2] === 'program') return `${platform[1]}-program`
  if (platform[2] === 'args') return `${platform[1]}-argument-${platform[3]}`
  return `${platform[1]}-environment-${platform[4]}-${platform[3]}`
}
~~~

- [ ] **Step 4: 实现动态服务表单与平台区**

`ServiceConfigurationForm.tsx` 使用小型行编辑器而非表单框架。下面代码给出完整更新规则、共享字段和平台字段；`FieldIssue` 只显示与自身路径完全匹配的错误：
~~~tsx
import type {
  ActionableError,
  EnvironmentVariableDraft,
  PlatformName,
  PlatformOverrideDraft,
  ProjectConfigurationDraft
} from '../../shared/contracts'

interface ServiceConfigurationFormProps {
  draft: ProjectConfigurationDraft
  error: ActionableError | undefined
  onChange(draft: ProjectConfigurationDraft): void
  onPreview(): void
  onBack(): void
}

function replaceAt<T>(values: readonly T[], index: number, value: T): T[] {
  return values.map((current, currentIndex) => currentIndex === index ? value : current)
}
function removeAt<T>(values: readonly T[], index: number): T[] {
  return values.filter((_, currentIndex) => currentIndex !== index)
}
function FieldIssue({ error, path }: { error: ActionableError | undefined; path: string }) {
  return error?.fieldPath === path
    ? <span className="field-error" id={`issue-${path}`}>{error.message}</span>
    : null
}
function describedBy(error: ActionableError | undefined, path: string): string | undefined {
  return error?.fieldPath === path ? `issue-${path}` : undefined
}

interface StringRowsProps {
  title: string
  itemName: string
  addLabel: string
  idPrefix: string
  pathPrefix: string
  values: readonly string[]
  error: ActionableError | undefined
  onChange(values: string[]): void
}
function StringRows(props: StringRowsProps) {
  return <fieldset><legend>{props.title}</legend>
    {props.values.map((value, index) => {
      const id = `${props.idPrefix}-${index}`
      const path = `${props.pathPrefix}[${index}]`
      return <div className="dynamic-row" key={index}>
        <label htmlFor={id}>{props.itemName} {index + 1}</label>
        <input id={id} value={value} aria-describedby={describedBy(props.error, path)}
          onChange={(event) => props.onChange(replaceAt(props.values, index, event.target.value))} />
        <button type="button" aria-label={`Remove ${props.itemName.toLowerCase()} ${index + 1}`}
          onClick={() => props.onChange(removeAt(props.values, index))}>Remove</button>
        <FieldIssue error={props.error} path={path} />
      </div>
    })}
    <button type="button" onClick={() => props.onChange([...props.values, ''])}>{props.addLabel}</button>
  </fieldset>
}

interface EnvironmentRowsProps {
  title: string
  labelPrefix: string
  idPrefix: string
  pathPrefix: string
  rows: readonly EnvironmentVariableDraft[]
  error: ActionableError | undefined
  onChange(rows: EnvironmentVariableDraft[]): void
}
function EnvironmentRows(props: EnvironmentRowsProps) {
  return <fieldset><legend>{props.title}</legend>
    {props.rows.map((row, index) => {
      const keyPath = `${props.pathPrefix}[${index}].key`
      const valuePath = `${props.pathPrefix}[${index}].value`
      return <div className="dynamic-row environment-row" key={index}>
        <label htmlFor={`${props.idPrefix}-key-${index}`}>{props.labelPrefix}Environment key {index + 1}</label>
        <input id={`${props.idPrefix}-key-${index}`} value={row.key}
          aria-describedby={describedBy(props.error, keyPath)}
          onChange={(event) => props.onChange(replaceAt(props.rows, index, { ...row, key: event.target.value }))} />
        <FieldIssue error={props.error} path={keyPath} />
        <label htmlFor={`${props.idPrefix}-value-${index}`}>{props.labelPrefix}Environment value {index + 1}</label>
        <input id={`${props.idPrefix}-value-${index}`} value={row.value}
          aria-describedby={describedBy(props.error, valuePath)}
          onChange={(event) => props.onChange(replaceAt(props.rows, index, { ...row, value: event.target.value }))} />
        <FieldIssue error={props.error} path={valuePath} />
        <button type="button" aria-label={`Remove ${props.labelPrefix.toLowerCase()}environment value ${index + 1}`}
          onClick={() => props.onChange(removeAt(props.rows, index))}>Remove</button>
      </div>
    })}
    <button type="button" onClick={() => props.onChange([...props.rows, { key: '', value: '' }])}>
      Add {props.labelPrefix.toLowerCase()}environment value
    </button>
  </fieldset>
}

function PlatformOverrideEditor(props: {
  platform: PlatformName
  override: PlatformOverrideDraft | undefined
  error: ActionableError | undefined
  onChange(override: PlatformOverrideDraft | undefined): void
}) {
  const title = props.platform === 'macos' ? 'macOS' : 'Windows'
  const base = `$.service.${props.platform}`
  const regionId = `${props.platform}-overrides`
  return <section>
    <button type="button" aria-expanded={props.override !== undefined} aria-controls={regionId}
      onClick={() => props.onChange(props.override === undefined ? {} : undefined)}>{title} overrides</button>
    {props.override === undefined ? null : <div id={regionId} role="region" aria-label={`${title} overrides`}>
      <label htmlFor={`${props.platform}-program`}>{title} Program</label>
      <input id={`${props.platform}-program`} value={props.override.program ?? ''}
        aria-describedby={describedBy(props.error, `${base}.program`)}
        onChange={(event) => props.onChange({ ...props.override, program: event.target.value })} />
      <FieldIssue error={props.error} path={`${base}.program`} />
      <StringRows title={`${title} Arguments`} itemName={`${title} Argument`}
        addLabel={`Add ${title} argument`} idPrefix={`${props.platform}-argument`}
        pathPrefix={`${base}.args`} values={props.override.args ?? []} error={props.error}
        onChange={(args) => props.onChange({ ...props.override, args })} />
      <EnvironmentRows title={`${title} Environment values`} labelPrefix={`${title} `}
        idPrefix={`${props.platform}-environment`} pathPrefix={`${base}.env`}
        rows={props.override.env ?? []} error={props.error}
        onChange={(env) => props.onChange({ ...props.override, env })} />
    </div>}
  </section>
}

export function ServiceConfigurationForm(props: ServiceConfigurationFormProps) {
  const service = props.draft.service
  const changeService = (patch: Partial<typeof service>) =>
    props.onChange({ service: { ...service, ...patch } })
  const changePlatform = (platform: PlatformName, override: PlatformOverrideDraft | undefined) => {
    const nextService = { ...service }
    if (override === undefined) delete nextService[platform]
    else nextService[platform] = override
    props.onChange({ service: nextService })
  }
  return <form onSubmit={(event) => { event.preventDefault(); props.onPreview() }}>
    <label htmlFor="service-id">Service ID</label>
    <input id="service-id" value={service.id} aria-describedby={describedBy(props.error, '$.service.id')}
      onChange={(event) => changeService({ id: event.target.value.trim() })} />
    <FieldIssue error={props.error} path="$.service.id" />
    <label htmlFor="program">Program</label>
    <input id="program" value={service.program} aria-describedby={describedBy(props.error, '$.service.program')}
      onChange={(event) => changeService({ program: event.target.value })} />
    <FieldIssue error={props.error} path="$.service.program" />
    <StringRows title="Arguments" itemName="Argument" addLabel="Add argument" idPrefix="argument"
      pathPrefix="$.service.args" values={service.args} error={props.error}
      onChange={(args) => changeService({ args })} />
    <label htmlFor="working-directory">Working directory</label>
    <input id="working-directory" value={service.workingDirectory}
      aria-describedby={describedBy(props.error, '$.service.workingDirectory')}
      onChange={(event) => changeService({ workingDirectory: event.target.value })} />
    <p>Use / separators and a path relative to the project root.</p>
    <FieldIssue error={props.error} path="$.service.workingDirectory" />
    <EnvironmentRows title="Environment values" labelPrefix="" idPrefix="environment"
      pathPrefix="$.service.env" rows={service.env} error={props.error}
      onChange={(env) => changeService({ env })} />
    <p>Only enter non-sensitive values; put secrets in .env files.</p>
    <StringRows title="Environment files" itemName="Environment file" addLabel="Add environment file"
      idPrefix="env-file" pathPrefix="$.service.envFiles" values={service.envFiles} error={props.error}
      onChange={(envFiles) => changeService({ envFiles })} />
    <label><input type="checkbox" checked={service.shell}
      onChange={(event) => changeService({ shell: event.target.checked })} />Run through shell</label>
    <p>Shell execution changes quoting and expansion behavior. Enable it only when required.</p>
    <PlatformOverrideEditor platform="macos" override={service.macos} error={props.error}
      onChange={(override) => changePlatform('macos', override)} />
    <PlatformOverrideEditor platform="windows" override={service.windows} error={props.error}
      onChange={(override) => changePlatform('windows', override)} />
    <div className="configuration-actions">
      <button type="button" onClick={props.onBack}>Back to projects</button>
      <button type="submit" className="primary-action">Preview configuration</button>
    </div>
  </form>
}
~~~
平台 disclosure 初始因 `override === undefined` 折叠且不写入 draft；展开产生 `{}`，若不填写直接预览则由配置模块返回 `CONFIG_PLATFORM_OVERRIDE_EMPTY`；再次关闭通过 `delete nextService[platform]` 移除整个覆盖。平台区不渲染 working directory、shell 或 env files。

- [ ] **Step 5: 实现响应式样式并转 GREEN**

`styles.css` 增加 `.configuration-layout { display:grid; grid-template-columns:minmax(0,2fr) minmax(18rem,1fr) }`、动态行 grid、fieldset/legend、只读 preview `overflow:auto`、长 path/fieldPath `overflow-wrap:anywhere`；`@media (max-width: 48rem)` 改为单列，操作栏 `flex-wrap:wrap`，所有输入 `min-width:0;width:100%`。保留全局 `color-scheme`、系统字体与 `:focus-visible`。
~~~bash
pnpm test -- src/renderer/src/App.test.tsx src/renderer/src/ProjectConfigurationView.test.tsx
pnpm typecheck
git add src/renderer
git commit -m "feat: add project configuration workflow"
~~~
Expected: Renderer 测试与类型检查 PASS；项目注册旧流程仍可用，所有 draft 变化都失效旧预览，环境 value 不进入错误或事件。

---

### Task 8: 完成真实 Electron 验收、双平台 CI 与票据收尾

**Files:**
- Create: `e2e/project-configuration.spec.ts`
- Modify: `e2e/ui-viewport.spec.ts`
- Verify: `.github/workflows/ci.yml`
- Modify after all gates pass: `.scratch/developer-control-center-mvp/issues/02-portable-project-configuration.md`

**Interfaces:**
- Consumes: 完整 DesktopApi/Renderer 流程、公开 `parseProjectConfiguration`、真实 SQLite Registry 与 Node Host Runtime。
- Produces: macOS/Windows 可观察的创建/不覆盖证据，以及票据 02 的 `ready-for-human` 完成状态。

- [ ] **Step 1: 补充真实创建与已有文件保护验收 E2E**
~~~typescript
import { _electron as electron, expect, test, type ElectronApplication, type TestInfo } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseProjectConfiguration } from '../src/control-center/project-configuration'

async function launchApp(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, DCC_E2E_USER_DATA: userData }
  })
}

async function launchRegisteredProject(testInfo: TestInfo) {
  const projectRoot = join(testInfo.outputPath(), 'sample-project')
  const userData = testInfo.outputPath('user-data')
  await mkdir(projectRoot, { recursive: true })
  const app = await launchApp(userData)
  try {
    await app.evaluate(({ dialog }, selectedPath) => {
      Object.defineProperty(dialog, 'showOpenDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePaths: [selectedPath] })
      })
    }, projectRoot)
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(page.getByRole('heading', { name: 'sample-project' })).toBeVisible()
    return { app, page, projectRoot, userData }
  } catch (error) {
    await app.close().catch(() => undefined)
    throw error
  }
}

test('registers, previews and creates a parseable project configuration', async ({}, testInfo) => {
  const launched = await launchRegisteredProject(testInfo)
  let app = launched.app
  let page = launched.page
  const { projectRoot, userData } = launched
  try {
    await page.getByRole('button', { name: 'Configure sample-project' }).click()
    await page.getByLabel('Program').fill('pnpm')
    await page.getByRole('button', { name: 'Add argument' }).click()
    await page.getByLabel('Argument 1').fill('dev')
    await page.getByRole('button', { name: 'Preview configuration' }).click()
    await expect(page.getByLabel('Project configuration preview')).toContainText('schema_version = 1')
    await page.getByRole('button', { name: 'Create configuration' }).click()
    await expect(page.getByText('.devcontrol.toml created')).toBeVisible()
    const source = await readFile(join(projectRoot, '.devcontrol.toml'), 'utf8')
    expect(parseProjectConfiguration(source).services.web).toMatchObject({ program: 'pnpm', args: ['dev'], shell: false })
    await app.close()
    app = await launchApp(userData)
    page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'sample-project' })).toBeVisible()
    await expect(readFile(join(projectRoot, '.devcontrol.toml'), 'utf8')).resolves.toBe(source)
  } finally { await app.close().catch(() => undefined) }
})

test('never overwrites an existing project configuration or leaks an environment value', async ({}, testInfo) => {
  const secretValue = 'e2e-secret-mutation-9021'
  const { app, page, projectRoot } = await launchRegisteredProject(testInfo)
  const target = join(projectRoot, '.devcontrol.toml')
  await writeFile(target, 'existing-marker', 'utf8')
  try {
    await page.getByRole('button', { name: 'Configure sample-project' }).click()
    await page.getByLabel('Program').fill('pnpm')
    await page.getByRole('button', { name: 'Add environment value' }).click()
    await page.getByLabel('Environment key 1').fill('SAFE_KEY')
    await page.getByLabel('Environment value 1').fill(secretValue)
    await page.getByRole('button', { name: 'Preview configuration' }).click()
    await page.getByRole('button', { name: 'Create configuration' }).click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('already exists')
    await expect(alert).not.toContainText(secretValue)
    await expect(readFile(target, 'utf8')).resolves.toBe('existing-marker')
  } finally {
    await app.close()
  }
})
~~~
helper 只通过 Electron 主进程替换系统目录选择结果，不新增测试 IPC；磁盘断言只在 Playwright 进程执行。

- [ ] **Step 2: 运行端到端验收**
~~~bash
pnpm test:e2e -- e2e/project-configuration.spec.ts
~~~
Expected: PASS；真实文件能由公开 parser 重新解析，重启后保持不变，已有 marker 字节不变，错误 alert 不含 mutation value。若失败，只修复公开产品路径，不添加测试专用 IPC 或 Renderer 文件能力。

- [ ] **Step 3: 验证键盘、760×520、主题和能力白名单**

`ui-viewport.spec.ts` 增加下列键盘与视口验收；注册完成后，核心配置操作只使用 Tab/Enter 和键盘输入：
~~~typescript
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('Keyboard target was not reachable within 80 Tab presses.')
}

for (const size of [{ width: 1100, height: 720 }, { width: 760, height: 520 }]) {
  test(`keeps configuration usable at ${size.width}x${size.height}`, async ({}, testInfo) => {
    const projectRoot = join(testInfo.outputPath(), 'sample-project')
    await mkdir(projectRoot, { recursive: true })
    const app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, DCC_E2E_USER_DATA: testInfo.outputPath('user-data') }
    })
    try {
      await app.evaluate(({ BrowserWindow, dialog }, input) => {
        BrowserWindow.getAllWindows()[0]!.setContentSize(input.size.width, input.size.height)
        Object.defineProperty(dialog, 'showOpenDialog', {
          configurable: true,
          value: async () => ({ canceled: false, filePaths: [input.projectRoot] })
        })
      }, { size, projectRoot })
      const page = await app.firstWindow()
      await page.getByRole('button', { name: 'Add project' }).click()
      const configure = page.getByRole('button', { name: 'Configure sample-project' })
      await tabTo(page, configure)
      await page.keyboard.press('Enter')
      const program = page.getByLabel('Program')
      await tabTo(page, program)
      await page.keyboard.type('pnpm')
      const previewButton = page.getByRole('button', { name: 'Preview configuration' })
      await tabTo(page, previewButton)
      await page.keyboard.press('Enter')
      const preview = page.getByLabel('Project configuration preview')
      await expect(preview).toContainText('schema_version = 1')
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await preview.evaluate((element) => getComputedStyle(element).overflowX)).toMatch(/auto|scroll/)
      const back = page.getByRole('button', { name: 'Back to editing' })
      await tabTo(page, back)
      await page.keyboard.press('Enter')
      await tabTo(page, previewButton)
      await page.keyboard.press('Enter')
      const createButton = page.getByRole('button', { name: 'Create configuration' })
      await tabTo(page, createButton)
      expect(await createButton.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.screenshot({
        path: testInfo.outputPath(`project-configuration-${size.width}x${size.height}.png`)
      })
      await page.keyboard.press('Enter')
      await expect(page.getByText('.devcontrol.toml created')).toBeVisible()
    } finally {
      await app.close()
    }
  })
}
~~~
顶部 import 增加 `type Locator`、`type Page`、`mkdir` 与 `join`。逐张用本地图片查看工具打开截图，确认无遮挡、无页面横向滚动、暗色主题可读且没有错误残留；截图只留在 Playwright 输出目录，不提交。
~~~bash
pnpm test:e2e -- e2e/project-configuration.spec.ts e2e/ui-viewport.spec.ts e2e/app-shell.spec.ts
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
~~~
Expected: 全部 PASS 且无警告；Electron 安全白名单仍精确，真实文件可由公开 parser 解析，已有字节不变。

- [ ] **Step 4: 提交桌面验收并检查现有 CI 定义**
~~~bash
rg -n 'macos-14|windows-2025|pnpm install --frozen-lockfile|pnpm typecheck|pnpm test|pnpm build|pnpm test:e2e' .github/workflows/ci.yml
git add e2e
git commit -m "test: verify project configuration on Electron"
~~~
Expected: CI 文件无需改动且所有矩阵/命令均命中；E2E 提交不包含截图、项目临时目录或 userData。

- [ ] **Step 5: 推送并观察真实双平台 CI**
~~~bash
set -euo pipefail
dcc_ci_sha=$(git rev-parse HEAD)
git push origin feature/developer-control-center-mvp
dcc_ci_run_id=''
for dcc_ci_attempt in {1..30}; do
  dcc_ci_run_id=$(gh run list --branch feature/developer-control-center-mvp --commit "$dcc_ci_sha" --event push --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  test -n "$dcc_ci_run_id" && break
  sleep 2
done
test -n "$dcc_ci_run_id"
test "$(gh run view "$dcc_ci_run_id" --json headSha --jq '.headSha')" = "$dcc_ci_sha"
gh run watch "$dcc_ci_run_id" --exit-status
gh run view "$dcc_ci_run_id" --json jobs
test "$(gh run view "$dcc_ci_run_id" --json jobs --jq '[.jobs[] | select(.conclusion != "success")] | length')" = '0'
~~~
Expected: `Verify (macos-14)` 与 `Verify (windows-2025)` 均为 `completed/success`；任一 Job 失败则票据保持 `ready-for-agent`，按失败输出修复、重新运行本地完整检查并再次观察 CI。

- [ ] **Step 6: 仅在全部证据成功后收尾票据并提交**

勾选票据 02 的八项验收，把 `Status: ready-for-agent` 改为 `Status: ready-for-human`，不修改其他票据：
~~~bash
set -euo pipefail
git add .scratch/developer-control-center-mvp/issues/02-portable-project-configuration.md
git commit -m "docs: mark portable configuration ready for review"
dcc_final_ci_sha=$(git rev-parse HEAD)
git push
dcc_final_ci_run_id=''
for dcc_final_ci_attempt in {1..30}; do
  dcc_final_ci_run_id=$(gh run list --branch feature/developer-control-center-mvp --commit "$dcc_final_ci_sha" --event push --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  test -n "$dcc_final_ci_run_id" && break
  sleep 2
done
test -n "$dcc_final_ci_run_id"
test "$(gh run view "$dcc_final_ci_run_id" --json headSha --jq '.headSha')" = "$dcc_final_ci_sha"
gh run watch "$dcc_final_ci_run_id" --exit-status
test "$(gh run view "$dcc_final_ci_run_id" --json jobs --jq '[.jobs[] | select(.conclusion != "success")] | length')" = '0'
pnpm check
git status --short
~~~
Expected: 状态提交触发的 macOS/Windows Job 再次全部成功；本地 `pnpm check` PASS 且无警告；工作树除 SDD 忽略文件外干净。此时票据 02 等待人工审查，未实现票据 03+。
