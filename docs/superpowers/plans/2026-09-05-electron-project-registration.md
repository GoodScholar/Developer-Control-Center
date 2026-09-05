# Electron Project Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已批准架构迁移到 Electron，并交付票据 01 的完整项目注册闭环：选择目录、持久化、重启恢复、安全取消注册和双平台 CI。

**Architecture:** Electron 主进程托管不依赖 Electron 的 TypeScript Control Center 模块；Renderer 只能通过沙盒化 Preload 窄接口提交项目操作。项目注册元数据使用 Node 内置 SQLite 保存，目录检查通过 Host Runtime 接口隔离。

**Tech Stack:** Electron、React、TypeScript、Vite、electron-vite、pnpm、Node `node:sqlite`、Vitest、React Testing Library、Playwright Electron、GitHub Actions

**Spec:** `docs/superpowers/specs/2026-09-05-electron-architecture-migration-design.md`，并受 `.scratch/developer-control-center-mvp/spec.md` 与 `.scratch/developer-control-center-mvp/issues/01-project-registration.md` 约束。

## Global Constraints

- 首版支持 macOS 13 及以上版本和 Windows 11，项目注册的用户可见语义必须一致。
- Renderer 必须设置 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`。
- Preload 不得暴露原始 `ipcRenderer`、任意通道、任意路径读取或任意命令执行。
- Control Center 不得导入 Electron；UI 和自动化测试必须通过同一个 Control Center 接口操作项目。
- 文件访问仅限用户通过系统目录选择器确认的项目目录与应用数据目录。
- 项目取消注册只删除应用本地记录，不修改或删除开发项目中的文件。
- SQLite 保存项目注册元数据；不得用 JSON 文件替代该持久化承诺。
- 错误必须包含稳定代码、受影响资源、面向用户的说明和下一步建议。
- 默认无账户、无云后端、无遥测、无管理员或 root 权限要求。
- 不实现票据 02 及之后的项目配置、服务启动、日志、托盘或通知功能。
- UI 属于 `Operate` 模式：优先任务效率、状态清晰和桌面习惯；本票据不启动正式品牌或视觉重设计，不引入外部组件库、图片资产或装饰性动画。
- 测试只验证公开接口和用户可见行为，不断言 SQLite 表布局或私有调用次数。
- 使用 pnpm 11 与 Node 24；依赖版本由提交的锁文件固定。

---

## File Structure

- `package.json`：应用元数据和开发、构建、类型检查、测试命令。
- `pnpm-lock.yaml`：固定依赖图。
- `electron.vite.config.ts`：Main、Preload、Renderer 构建入口。
- `tsconfig.json`、`tsconfig.node.json`、`tsconfig.web.json`：严格类型检查。
- `vitest.config.ts`：Node 与 jsdom 行为测试。
- `playwright.config.ts`：Electron 桌面验收。
- `src/shared/contracts.ts`：跨进程可序列化接口。
- `src/control-center/*`：Control Center、Host Runtime 与 SQLite 注册适配器。
- `src/main/*`：Electron 生命周期、目录选择与固定 IPC。
- `src/preload/index.ts`：受限 Context Bridge。
- `src/renderer/*`：项目列表与注册界面。
- `e2e/*`：真实 Electron 冒烟和项目注册验收。
- `.github/workflows/ci.yml`：macOS 与 Windows CI。

---

### Task 1: 将规划文档迁移到 Electron

**Files:**
- Create: `PRODUCT.md`
- Modify: `docs/adr/0003-tauri-web-rust-desktop-architecture.md`
- Create: `docs/adr/0005-electron-typescript-desktop-architecture.md`
- Modify: `.scratch/developer-control-center-mvp/spec.md`

**Interfaces:**
- Consumes: 已批准的 Electron 架构迁移设计。
- Produces: 唯一有效的 Electron + TypeScript + Node Host Runtime 规划基线。

- [ ] **Step 1: 运行旧架构失败扫描**

~~~bash
rg -n 'Tauri|Rust 核心|Rust Host Runtime|Cargo' .scratch/developer-control-center-mvp docs/adr
~~~

Expected: 命中 ADR-0003、MVP 规格及受影响票据，证明有效规划仍要求旧架构。

- [ ] **Step 2: 标记旧 ADR 并创建新 ADR**

ADR-0003 顶部增加：

~~~markdown
---
status: superseded by ADR-0005
---
~~~

ADR-0005 使用以下完整内容：

~~~markdown
# 采用 Electron 与 TypeScript 本地核心

## Decision

Developer Control Center 使用 Electron 承载 React、TypeScript 和 Vite 界面，并由 Electron 主进程直接托管不依赖 Electron 的 TypeScript Control Center 模块。Node Host Runtime 负责进程、文件、端口和网络能力；Renderer 保持沙盒化，只能通过受限 Preload 接口操作项目，以单一 TypeScript 技术栈替代原有跨语言桌面方案。

## Consequences

Main、Preload 和 Renderer 之间只传递可序列化请求、快照、事件和结构化错误。Control Center 不导入 Electron，因此 UI 与自动化测试可以使用同一接口，未来也可以在不改变领域接口的前提下迁移进程边界。

## Alternatives considered

- Electron Utility Process：首版不采用，因为它会立即引入额外进程生命周期、序列化和故障恢复复杂度，而项目注册闭环不需要这种隔离；Control Center 的深接口保留未来迁移空间。
- 独立本地守护进程：首版不采用，因为安装、升级、单实例和通信成本超出个人开发者 MVP 的必要范围。
~~~

- [ ] **Step 3: 沉淀已确认的产品事实**

创建 `PRODUCT.md`，只记录前序问答已经确认的长期事实，不加入视觉偏好。`Platform` 中的 `web` 是 Impeccable 产品模式对 Electron Renderer 技术的分类；产品的实际交付平台仍在 `Operating Context` 中明确为 macOS 与 Windows 桌面应用：

~~~markdown
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
~~~

- [ ] **Step 4: 修订规格**

逐项替换有效架构需求：Tauri 2 改为 Electron，Rust 核心改为 TypeScript Control Center，Rust Host Runtime 改为 Node Host Runtime，Tauri 通信改为 Main/Preload/Renderer 通信，并删除 Cargo 或 Rust 构建工具链要求。增加 Renderer 沙盒、上下文隔离、关闭 Node 集成及窄 Preload 接口约束，不改变产品行为、阻塞边、验收数量或任何票据的当前 `ready-for-agent` Triage 状态。环境安装器的 Out of Scope 清单属于技术中立的产品范围，必须继续包含 Rust；现有票据也无需为了迁移而改写。

- [ ] **Step 5: 验证迁移**

~~~bash
rg -n 'Tauri|Rust 核心|Rust Host Runtime|Cargo' .scratch/developer-control-center-mvp docs/adr
~~~

Expected: 仅允许命中带 `superseded by ADR-0005` 的 ADR-0003；有效规格、ADR-0005 和票据无命中。

~~~bash
rg -n 'Electron|TypeScript Control Center|Node Host Runtime' .scratch/developer-control-center-mvp/spec.md .scratch/developer-control-center-mvp/issues docs/adr/0005-electron-typescript-desktop-architecture.md
~~~

Expected: 新架构在规格和 ADR-0005 中均有命中；技术中立的票据继续引用 Host Runtime 和 Control Center。

- [ ] **Step 6: 提交**

~~~bash
git add PRODUCT.md docs/adr .scratch/developer-control-center-mvp
git commit -m "docs: migrate MVP architecture to Electron"
~~~

---

### Task 2: 建立安全的 Electron 空项目列表

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `playwright.config.ts`
- Create: `src/main/index.ts`
- Create: `src/main/create-window.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/styles.css`
- Create: `e2e/app-shell.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: ADR-0005 的 Electron 安全边界。
- Produces: 可启动应用、沙盒 Renderer 和空项目列表。

- [ ] **Step 1: 创建包清单并安装依赖**

`package.json`：

~~~json
{
  "name": "developer-control-center",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "test": "vitest run",
    "test:e2e": "pnpm build && playwright test",
    "check": "pnpm typecheck && pnpm test && pnpm test:e2e"
  }
}
~~~

~~~bash
pnpm add react react-dom
pnpm add -D electron electron-vite vite typescript @types/node @types/react @types/react-dom @vitejs/plugin-react @playwright/test vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
~~~

Expected: 锁文件生成，安装无错误。

- [ ] **Step 2: 创建构建和类型配置**

`electron.vite.config.ts`：

~~~typescript
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: { build: { externalizeDeps: false } },
  renderer: { plugins: [react()] }
})
~~~

electron-vite 5 默认处理 Main 依赖，不使用已弃用的 `externalizeDepsPlugin`。Preload 显式关闭依赖外置以生成可在 Electron sandbox 中加载的单文件 bundle；应用保持默认 CJS Main/Preload 输出，因此入口与 preload 路径都是 `index.js`。

`tsconfig.json`：

~~~json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true
  }
}
~~~

`tsconfig.node.json`：

~~~json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["node", "electron"],
    "noEmit": true
  },
  "include": [
    "electron.vite.config.ts",
    "playwright.config.ts",
    "vitest.config.ts",
    "src/main/**/*.ts",
    "src/preload/**/*.ts",
    "src/shared/**/*.ts",
    "src/control-center/**/*.ts",
    "e2e/**/*.ts"
  ]
}
~~~

`tsconfig.web.json`：

~~~json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vitest/globals"],
    "noEmit": true
  },
  "include": ["src/renderer/**/*.ts", "src/renderer/**/*.tsx", "src/shared/**/*.ts"]
}
~~~

- [ ] **Step 3: 写 Electron 启动 RED 测试**

`playwright.config.ts`：

~~~typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 30_000,
  use: { trace: 'retain-on-failure' }
})
~~~

`e2e/app-shell.spec.ts`：

~~~typescript
import { _electron as electron, expect, test } from '@playwright/test'

test('opens an empty project list', async ({}, testInfo) => {
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, DCC_E2E_USER_DATA: testInfo.outputPath('user-data') }
  })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'Developer Control Center' })).toBeVisible()
    await expect(page.getByText('No projects yet')).toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      const candidate = window as unknown as { desktop?: { projects?: object } }
      return {
        hasRequire: 'require' in window,
        hasProcess: 'process' in window,
        desktopKeys: candidate.desktop ? Object.keys(candidate.desktop) : [],
        projectKeys: candidate.desktop?.projects
          ? Object.keys(candidate.desktop.projects).sort()
          : []
      }
    })).toEqual({
      hasRequire: false,
      hasProcess: false,
      desktopKeys: [],
      projectKeys: []
    })
  } finally {
    await app.close()
  }
})
~~~

~~~bash
pnpm test:e2e
~~~

Expected: FAIL，因为应用入口尚不存在。

- [ ] **Step 4: 实现最小安全空壳**

`src/main/create-window.ts`：

~~~typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function developmentRendererUrl(): string | null {
  const value = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL
  if (!value) return null
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('ELECTRON_RENDERER_URL must use loopback HTTP')
  }
  return url.toString()
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  const developmentUrl = developmentRendererUrl()
  if (developmentUrl) {
    void window.loadURL(developmentUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}
~~~

`src/main/index.ts`：

~~~typescript
import { app } from 'electron'
import { createMainWindow } from './create-window'

if (process.env.DCC_E2E_USER_DATA) app.setPath('userData', process.env.DCC_E2E_USER_DATA)
void app.whenReady().then(createMainWindow)
app.on('window-all-closed', () => app.quit())
~~~

`src/preload/index.ts` 只包含 `export {}`。

`src/renderer/index.html`：

~~~html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Developer Control Center</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
~~~

`src/renderer/src/main.tsx` 使用 `createRoot(document.getElementById('root')!).render(<App />)` 挂载应用；`App.tsx` 的完整初始组件为：

~~~tsx
export function App() {
  return (
    <main>
      <h1>Developer Control Center</h1>
      <p>No projects yet</p>
    </main>
  )
}
~~~

`styles.css` 设置系统字体、浅色/深色变量，并为 `:focus-visible` 提供清晰轮廓；不引入组件库或票据范围外的页面结构。

此阶段 Preload 尚未暴露 API，所以 E2E 断言 `desktopKeys` 和 `projectKeys` 均为空；Task 4 接通 API 后将同一断言更新为仅允许 `desktop.projects` 与 `add/list/remove` 三个方法。`require`、`process` 必须始终不可见。

- [ ] **Step 5: 忽略产物并转 GREEN**

向 `.gitignore` 增加：

~~~gitignore
node_modules/
out/
test-results/
playwright-report/
~~~

~~~bash
pnpm typecheck
pnpm test:e2e
~~~

Expected: 类型检查通过，启动测试 PASS，输出无警告。

- [ ] **Step 6: 提交**

~~~bash
git add package.json pnpm-lock.yaml electron.vite.config.ts tsconfig*.json playwright.config.ts src e2e .gitignore
git commit -m "feat: add secure Electron application shell"
~~~

---

### Task 3: 通过 Control Center 接口实现项目注册

**Files:**
- Create: `vitest.config.ts`
- Create: `src/shared/contracts.ts`
- Create: `src/control-center/host-runtime.ts`
- Create: `src/control-center/errors.ts`
- Create: `src/control-center/node-host-runtime.ts`
- Create: `src/control-center/node-host-runtime.test.ts`
- Create: `src/control-center/project-registry.ts`
- Create: `src/control-center/sqlite-project-registry.ts`
- Create: `src/control-center/control-center.ts`
- Create: `src/control-center/testing/test-host-runtime.ts`
- Create: `src/control-center/control-center.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: SQLite 路径和 Host Runtime 目录检查。
- Produces:
  - `ProjectSnapshot` 是可辨识联合：available 快照无问题字段，missing 快照必须携带 `problem: ActionableError`。
  - `ControlCenter.listProjects(): Promise<ProjectSnapshot[]>`
  - `ControlCenter.registerProject(rootPath: string): Promise<ProjectSnapshot>`
  - `ControlCenter.unregisterProject(projectId: string): Promise<void>`
  - `ControlCenter.close(): void`

- [ ] **Step 1: 配置 Vitest**

`vitest.config.ts`：

~~~typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['src/renderer/**/*.test.tsx']
  }
})
~~~

- [ ] **Step 2: 写注册与恢复 RED 测试**

~~~typescript
test('registers a project and restores it from local metadata', async () => {
  const hostRuntime = new TestHostRuntime(new Map([
    [projectRoot, { canonicalPath: projectRoot, name: 'sample-project' }]
  ]))
  const first = createTestControlCenter(databasePath, hostRuntime)
  const registered = await first.registerProject(projectRoot)
  expect(registered).toEqual({
    id: 'project-1',
    name: 'sample-project',
    rootPath: projectRoot,
    availability: 'available'
  })
  first.close()
  const reopened = createTestControlCenter(databasePath, hostRuntime)
  await expect(reopened.listProjects()).resolves.toEqual([registered])
  reopened.close()
})
~~~

~~~bash
pnpm test -- src/control-center/control-center.test.ts
~~~

Expected: FAIL，因为接口尚未定义。

- [ ] **Step 3: 实现共享类型和深接口**

`src/shared/contracts.ts`：

~~~typescript
interface ProjectIdentity {
  id: string
  name: string
  rootPath: string
}

export type ProjectSnapshot =
  | (ProjectIdentity & { availability: 'available' })
  | (ProjectIdentity & { availability: 'missing'; problem: ActionableError })

export interface ActionableError {
  code: string
  resource: { kind: 'project'; id?: string } | { kind: 'application' }
  message: string
  nextAction: string
}
~~~

`src/control-center/errors.ts` 定义唯一可跨层识别的领域错误：

~~~typescript
import type { ActionableError } from '../shared/contracts'

export class ControlCenterError extends Error {
  constructor(readonly detail: ActionableError) {
    super(detail.message)
    this.name = 'ControlCenterError'
  }
}

export function projectDirectoryUnavailable(
  rootPath: string,
  projectId?: string
): ControlCenterError {
  return new ControlCenterError({
    code: 'PROJECT_DIRECTORY_UNAVAILABLE',
    resource: projectId ? { kind: 'project', id: projectId } : { kind: 'project' },
    message: `The project directory is unavailable: ${rootPath}`,
    nextAction: 'Reconnect the drive or choose an accessible project directory.'
  })
}

export function invalidProjectId(): ControlCenterError {
  return new ControlCenterError({
    code: 'INVALID_PROJECT_ID',
    resource: { kind: 'project' },
    message: 'The project identifier is invalid.',
    nextAction: 'Refresh the project list and try again.'
  })
}
~~~

Host Runtime：

~~~typescript
export interface ProjectDirectory {
  canonicalPath: string
  name: string
}

export interface HostRuntime {
  inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory>
}
~~~

测试适配器使用明确目录映射，不访问真实文件系统：

~~~typescript
export class TestHostRuntime implements HostRuntime {
  constructor(private readonly directories: ReadonlyMap<string, ProjectDirectory>) {}

  async inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory> {
    const directory = this.directories.get(rootPath)
    if (!directory) throw projectDirectoryUnavailable(rootPath)
    return directory
  }
}
~~~

Project Registry 的完整持久接口为：

~~~typescript
export interface StoredProject {
  id: string
  name: string
  rootPath: string
}

export interface ProjectRegistry {
  list(): StoredProject[]
  insert(project: StoredProject): void
  remove(projectId: string): void
  close(): void
}
~~~

`SqliteProjectRegistry` 构造时打开传入的数据库路径，并执行：

~~~sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE
) STRICT;
~~~

`list()` 使用参数为空的 `SELECT id, name, root_path FROM projects ORDER BY rowid` 并把 `root_path` 映射为 `rootPath`；`insert()` 使用 `INSERT INTO projects (id, name, root_path) VALUES (?, ?, ?)`；`remove()` 使用 `DELETE FROM projects WHERE id = ?`。所有带值语句都通过 `DatabaseSync.prepare(...).run(...)` 参数化，`close()` 关闭数据库。Control Center 接受 Registry、Host Runtime 和可注入 ID 生成器。生产环境使用 `randomUUID`，测试使用固定生成器。注册与恢复测试使用 SQLite 临时文件和 TestHostRuntime；只有 NodeHostRuntime 的契约测试访问真实临时目录。

测试文件中的工厂必须显式组装真实 SQLite 适配器，不允许绕过持久化：

~~~typescript
function createTestControlCenter(
  databasePath: string,
  hostRuntime: HostRuntime,
  nextId: () => string = () => 'project-1'
): ControlCenter {
  return new ControlCenter(
    new SqliteProjectRegistry(databasePath),
    hostRuntime,
    nextId
  )
}
~~~

Step 2 使用映射了 `projectRoot` 的 `TestHostRuntime` 调用该工厂；Step 5 使用 `NodeHostRuntime`，因此删除真实临时目录后能观察到 `missing`，并能从磁盘读取标记文件证明取消注册未删除项目内容。

- [ ] **Step 4: 实现注册并转 GREEN**

先写 Node Host Runtime 契约测试：

~~~typescript
test('canonicalizes an accessible project directory', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  await mkdir(rootPath)
  await expect(new NodeHostRuntime().inspectProjectDirectory(rootPath)).resolves.toEqual({
    canonicalPath: await realpath(rootPath),
    name: 'sample-project'
  })
})

test('returns an actionable error for a missing directory', async () => {
  const rootPath = join(temporaryRoot, 'missing-project')
  await expect(new NodeHostRuntime().inspectProjectDirectory(rootPath)).rejects.toMatchObject({
    detail: {
      code: 'PROJECT_DIRECTORY_UNAVAILABLE',
      message: `The project directory is unavailable: ${rootPath}`,
      nextAction: 'Reconnect the drive or choose an accessible project directory.'
    }
  })
})
~~~

~~~bash
pnpm test -- src/control-center/node-host-runtime.test.ts
~~~

Expected: FAIL，因为 NodeHostRuntime 尚未实现。

然后实现 `registerProject`：先规范化目录，再保存并返回 available 快照。`NodeHostRuntime` 使用 `realpath` 和 `stat` 且只接受目录；失败抛出代码 `PROJECT_DIRECTORY_UNAVAILABLE` 的可操作错误。

~~~bash
pnpm test -- src/control-center/node-host-runtime.test.ts
pnpm test -- src/control-center/control-center.test.ts
~~~

Expected: Node Host Runtime 契约、注册与恢复测试全部 PASS。

- [ ] **Step 5: 写 missing 与安全取消注册 RED 测试**

~~~typescript
test('keeps a registration when its directory is missing', async () => {
  const registered = await controlCenter.registerProject(projectRoot)
  await remove(projectRoot, { recursive: true })
  await expect(controlCenter.listProjects()).resolves.toEqual([
    {
      ...registered,
      availability: 'missing',
      problem: {
        code: 'PROJECT_DIRECTORY_UNAVAILABLE',
        resource: { kind: 'project', id: registered.id },
        message: `The project directory is unavailable: ${projectRoot}`,
        nextAction: 'Reconnect the drive or choose an accessible project directory.'
      }
    }
  ])
})

test('unregisters without deleting project files', async () => {
  const marker = join(projectRoot, 'keep-me.txt')
  await writeFile(marker, 'preserve')
  const registered = await controlCenter.registerProject(projectRoot)
  await controlCenter.unregisterProject(registered.id)
  await expect(readFile(marker, 'utf8')).resolves.toBe('preserve')
  await expect(controlCenter.listProjects()).resolves.toEqual([])
  controlCenter.close()

  const reopened = createTestControlCenter(databasePath, new NodeHostRuntime())
  await expect(reopened.listProjects()).resolves.toEqual([])
  reopened.close()
})
~~~

Expected: 至少一个新增测试 FAIL。

- [ ] **Step 6: 实现并验证完整核心行为**

`unregisterProject` 只删除 Registry 记录。`listProjects` 遇到不可访问目录时只返回 missing，不删除注册，并使用 `projectDirectoryUnavailable(rootPath, projectId).detail` 填充快照的 `problem`。

~~~bash
pnpm test -- src/control-center/control-center.test.ts
pnpm typecheck
~~~

Expected: 全部 PASS，无警告。

- [ ] **Step 7: 提交**

~~~bash
git add package.json vitest.config.ts src/shared src/control-center
git commit -m "feat: persist project registrations"
~~~

---

### Task 4: 接通 Main、Preload 与项目注册界面

**Files:**
- Create: `src/main/project-directory-picker.ts`
- Create: `src/main/register-project-ipc.ts`
- Create: `src/main/register-project-ipc.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/global.d.ts`
- Create: `src/renderer/src/test-setup.ts`
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/App.test.tsx`
- Modify: `src/renderer/src/styles.css`
- Modify: `vitest.config.ts`
- Modify: `e2e/app-shell.spec.ts`
- Create: `e2e/project-registration.spec.ts`
- Create: `e2e/ui-viewport.spec.ts`

**Interfaces:**
- Consumes: Task 3 的 Control Center 与 ProjectSnapshot。
- Produces: `window.desktop.projects.list()`、`add()`、`remove(projectId)`；三者均返回结构化 `ActionResult`，Main 是唯一打开目录选择器的调用者。

- [ ] **Step 1: 写 Renderer RED 测试**

将 `vitest.config.ts` 改成两个测试项目：

~~~typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/control-center/**/*.test.ts', 'src/main/**/*.test.ts']
        }
      },
      {
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.tsx'],
          setupFiles: ['src/renderer/src/test-setup.ts']
        }
      }
    ]
  }
})
~~~

`test-setup.ts` 只导入 `@testing-library/jest-dom/vitest`。使用注入的 Desktop API 测试 Add 与 Remove，测试内 fake 必须实现公开接口：

~~~tsx
function createDesktopApi(
  project: ProjectSnapshot,
  initialProjects: ProjectSnapshot[] = []
): DesktopApi {
  let projects = initialProjects
  return {
    projects: {
      list: async () => ({ ok: true, value: projects }),
      add: async () => {
        projects = [project]
        return { ok: true, value: project }
      },
      remove: async () => {
        projects = []
        return { ok: true, value: null }
      }
    }
  }
}

test('adds and removes a selected project', async () => {
  const user = userEvent.setup()
  const desktop = createDesktopApi({
    id: 'project-1',
    name: 'sample-project',
    rootPath: '/projects/sample-project',
    availability: 'available'
  })
  render(<App desktop={desktop} />)
  await user.click(screen.getByRole('button', { name: 'Add project' }))
  expect(await screen.findByText('sample-project')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Remove sample-project' }))
  await waitFor(() => expect(screen.queryByText('sample-project')).not.toBeInTheDocument())
})
~~~

Missing 目录测试使用快照携带的稳定问题契约，不允许 UI 自己猜文案：

~~~tsx
test('explains a missing project directory and the next action', async () => {
  const missingProject: ProjectSnapshot = {
    id: 'project-1',
    name: 'sample-project',
    rootPath: '/projects/sample-project',
    availability: 'missing',
    problem: {
      code: 'PROJECT_DIRECTORY_UNAVAILABLE',
      resource: { kind: 'project', id: 'project-1' },
      message: 'The project directory is unavailable: /projects/sample-project',
      nextAction: 'Reconnect the drive or choose an accessible project directory.'
    }
  }
  render(<App desktop={createDesktopApi(missingProject, [missingProject])} />)
  expect(await screen.findByText(missingProject.problem.message)).toBeVisible()
  expect(screen.getByText(missingProject.problem.nextAction)).toBeVisible()
})
~~~

~~~bash
pnpm test -- src/renderer/src/App.test.tsx
~~~

Expected: FAIL，因为 App 尚无 Desktop API。

- [ ] **Step 2: 实现 Desktop API 与 Renderer**

共享契约增加：

~~~typescript
export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ActionableError }

export interface DesktopApi {
  projects: {
    list(): Promise<ActionResult<ProjectSnapshot[]>>
    add(): Promise<ActionResult<ProjectSnapshot | null>>
    remove(projectId: string): Promise<ActionResult<null>>
  }
}
~~~

`global.d.ts` 将 `window.desktop` 声明为 `DesktopApi`。`main.tsx` 改为 `<App desktop={window.desktop} />`。`App` 通过属性接收 Desktop API，初始调用 `list`；仅在 `ok: true` 时读取 `value`，在 `ok: false` 时保存 `error`。Add 返回 `value: null` 表示用户取消选择并保持列表不变。项目行显示名称、规范化路径和 Available/Missing；错误以 `role="alert"` 同时显示 `message` 与 `nextAction`。Remove 成功后按 ID 从本地列表移除，失败时保留列表并显示错误。

~~~bash
pnpm test -- src/renderer/src/App.test.tsx
~~~

Expected: Step 1 的 Add/Remove 与 missing 说明测试全部 PASS。

- [ ] **Step 3: 写 Main IPC 与桌面流程 RED 测试**

目录选择接口：

~~~typescript
export interface ProjectDirectoryPicker {
  chooseProjectDirectory(): Promise<string | null>
}
~~~

测试取消返回 `{ ok: true, value: null }`、选择目录只调用 Control Center、remove 拒绝空项目标识、Control Center 错误转换为 `{ ok: false, error }` 且序列化结果不包含堆栈。

测试使用捕获 handler 的最小 fake，并明确验证通道白名单与 sender 拒绝行为：

~~~typescript
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ControlCenter } from '../control-center/control-center'
import { projectDirectoryUnavailable } from '../control-center/errors'
import { registerProjectIpc } from './register-project-ipc'

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

const listProjects = vi.fn<ControlCenter['listProjects']>()
const registerProject = vi.fn<ControlCenter['registerProject']>()
const unregisterProject = vi.fn<ControlCenter['unregisterProject']>()
const controlCenter = {
  listProjects,
  registerProject,
  unregisterProject,
  close: vi.fn()
} as unknown as ControlCenter
const picker = { chooseProjectDirectory: vi.fn<() => Promise<string | null>>() }
const trustedEvent = {} as IpcMainInvokeEvent
const untrustedEvent = {} as IpcMainInvokeEvent

beforeEach(() => {
  vi.resetAllMocks()
})

function captureHandlers() {
  const handlers = new Map<string, Handler>()
  const ipc = {
    handle(channel: string, handler: Handler) {
      handlers.set(channel, handler)
    }
  } as Pick<IpcMain, 'handle'>
  return { handlers, ipc }
}

test('registers only the three project channels and returns cancellation', async () => {
  const { handlers, ipc } = captureHandlers()
  picker.chooseProjectDirectory.mockResolvedValue(null)
  registerProjectIpc(ipc, controlCenter, picker, () => true)
  expect([...handlers.keys()].sort()).toEqual([
    'projects:add',
    'projects:list',
    'projects:remove'
  ])
  await expect(handlers.get('projects:add')!(trustedEvent)).resolves.toEqual({
    ok: true,
    value: null
  })
  expect(registerProject).not.toHaveBeenCalled()
})

test('rejects an untrusted sender before touching the control center', async () => {
  const { handlers, ipc } = captureHandlers()
  registerProjectIpc(ipc, controlCenter, picker, () => false)
  await expect(handlers.get('projects:list')!(untrustedEvent)).resolves.toMatchObject({
    ok: false,
    error: { code: 'UNTRUSTED_IPC_SENDER' }
  })
  expect(listProjects).not.toHaveBeenCalled()
})

test('serializes domain errors without a stack', async () => {
  const { handlers, ipc } = captureHandlers()
  listProjects.mockRejectedValue(projectDirectoryUnavailable('/missing'))
  registerProjectIpc(ipc, controlCenter, picker, () => true)
  const result = await handlers.get('projects:list')!(trustedEvent)
  expect(result).toMatchObject({
    ok: false,
    error: { code: 'PROJECT_DIRECTORY_UNAVAILABLE' }
  })
  expect(JSON.stringify(result)).not.toContain('stack')
})
~~~

空 ID 测试为：

~~~typescript
test('rejects an empty project id without unregistering', async () => {
  const { handlers, ipc } = captureHandlers()
  registerProjectIpc(ipc, controlCenter, picker, () => true)
  await expect(handlers.get('projects:remove')!(trustedEvent, '')).resolves.toMatchObject({
    ok: false,
    error: { code: 'INVALID_PROJECT_ID' }
  })
  expect(unregisterProject).not.toHaveBeenCalled()
})
~~~

~~~bash
pnpm test -- src/main/register-project-ipc.test.ts
~~~

Expected: FAIL，因为处理函数尚不存在。

同时先创建 Step 5 给出的 `e2e/project-registration.spec.ts`，不要实现 Main/Preload 连接，然后运行：

~~~bash
pnpm test:e2e -- e2e/project-registration.spec.ts
~~~

Expected: FAIL，因为页面尚无 Add project 操作且项目 IPC 尚未注册。记录该失败后才进入 Step 4。

- [ ] **Step 4: 实现 Main 和安全 Preload**

主进程在 app ready 后创建 SQLite Registry、Node Host Runtime 与 Control Center，并注册 `projects:list`、`projects:add`、`projects:remove` 固定通道。`projects:add` 不接收 Renderer 路径；应用退出时关闭 Control Center。

Preload 使用 `contextBridge.exposeInMainWorld` 暴露 Desktop API，每个方法绑定固定通道，不暴露通用 invoke 或原始 ipcRenderer。

Preload 的完整公开形状为：

~~~typescript
import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/contracts'

contextBridge.exposeInMainWorld('desktop', {
  projects: {
    list: () => ipcRenderer.invoke('projects:list') as ReturnType<DesktopApi['projects']['list']>,
    add: () => ipcRenderer.invoke('projects:add') as ReturnType<DesktopApi['projects']['add']>,
    remove: (projectId: string) =>
      ipcRenderer.invoke('projects:remove', projectId) as ReturnType<DesktopApi['projects']['remove']>
  }
} satisfies DesktopApi)
~~~

Main 的注册函数必须接收依赖并集中绑定固定通道。所有 handler 都在 Main 内转换为纯数据结果，不允许 Electron 将 Error 对象或堆栈直接穿过 IPC：

~~~typescript
import type { IpcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { ActionResult, ActionableError } from '../shared/contracts'
import { ControlCenterError } from '../control-center/errors'

function unexpectedError(): ActionableError {
  return {
    code: 'UNEXPECTED_ERROR',
    resource: { kind: 'project' },
    message: 'The project action could not be completed.',
    nextAction: 'Try again. If the problem continues, restart the application.'
  }
}

function untrustedIpcSender(): ActionableError {
  return {
    code: 'UNTRUSTED_IPC_SENDER',
    resource: { kind: 'application' },
    message: 'The project request was rejected.',
    nextAction: 'Use the Developer Control Center window and try again.'
  }
}

async function resultOf<T>(action: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ControlCenterError ? error.detail : unexpectedError()
    }
  }
}

export function registerProjectIpc(
  ipc: Pick<IpcMain, 'handle'>,
  controlCenter: ControlCenter,
  picker: ProjectDirectoryPicker,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
): void {
  const authorized = <T>(
    event: IpcMainInvokeEvent,
    action: () => Promise<T>
  ): Promise<ActionResult<T>> => {
    if (!isTrustedSender(event)) {
      return Promise.resolve({ ok: false, error: untrustedIpcSender() })
    }
    return resultOf(action)
  }

  ipc.handle('projects:list', (event) => authorized(event, () => controlCenter.listProjects()))
  ipc.handle('projects:add', (event) => authorized(event, async () => {
    const rootPath = await picker.chooseProjectDirectory()
    return rootPath === null ? null : await controlCenter.registerProject(rootPath)
  }))
  ipc.handle('projects:remove', (event, projectId: unknown) => authorized(event, async () => {
    if (typeof projectId !== 'string' || projectId.length === 0) throw invalidProjectId()
    await controlCenter.unregisterProject(projectId)
    return null
  }))
}
~~~

`invalidProjectId()` 与 Task 3 的错误工厂放在 `src/control-center/errors.ts`，返回代码 `INVALID_PROJECT_ID`、资源类型 `project`、可读说明和修复建议。`untrustedIpcSender()` 在 Main 层返回普通 `ActionableError`，代码为 `UNTRUSTED_IPC_SENDER`，不包含 URL、堆栈或进程信息。

生产组装在 `app.whenReady()` 后完成：数据库路径固定为 `join(app.getPath('userData'), 'developer-control-center.sqlite3')`；使用 `new SqliteProjectRegistry(databasePath)`、`new NodeHostRuntime()` 和 `randomUUID` 创建 Control Center；目录选择器只调用 `dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })`。`isTrustedSender` 只在 `event.senderFrame === mainWindow.webContents.mainFrame` 时返回 true。`before-quit` 只调用一次 `controlCenter.close()`，窗口关闭不得提前关闭数据库。

`src/main/project-directory-picker.ts`：

~~~typescript
export function createProjectDirectoryPicker(
  mainWindow: BrowserWindow
): ProjectDirectoryPicker {
  return {
    async chooseProjectDirectory() {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    }
  }
}
~~~

`src/main/index.ts` 的组装顺序为：

~~~typescript
let controlCenter: ControlCenter | undefined

if (process.env.DCC_E2E_USER_DATA) {
  app.setPath('userData', process.env.DCC_E2E_USER_DATA)
}

void app.whenReady().then(() => {
  const mainWindow = createMainWindow()
  const databasePath = join(app.getPath('userData'), 'developer-control-center.sqlite3')
  controlCenter = new ControlCenter(
    new SqliteProjectRegistry(databasePath),
    new NodeHostRuntime(),
    randomUUID
  )
  registerProjectIpc(
    ipcMain,
    controlCenter,
    createProjectDirectoryPicker(mainWindow),
    (event) => event.senderFrame === mainWindow.webContents.mainFrame
  )
})

app.on('before-quit', () => {
  controlCenter?.close()
  controlCenter = undefined
})

app.on('window-all-closed', () => app.quit())
~~~

更新 `e2e/app-shell.spec.ts` 的能力断言：`hasRequire` 与 `hasProcess` 仍为 false，`desktopKeys` 必须精确等于 `['projects']`，`projectKeys` 必须精确等于 `['add', 'list', 'remove']`。这和 Main 单元测试的精确 handler 集合共同证明 Preload 与 IPC 没有额外通用能力。

在同一 E2E 中验证导航和新窗口被阻止：

~~~typescript
const originalUrl = page.url()
await page.evaluate(() => {
  window.location.href = 'https://example.com/'
})
await expect.poll(() => page.url()).toBe(originalUrl)

const windowCount = app.windows().length
await page.evaluate(() => window.open('https://example.com/', '_blank'))
await expect.poll(() => app.windows().length).toBe(windowCount)
~~~

~~~bash
pnpm test -- src/main/register-project-ipc.test.ts
pnpm test -- src/renderer/src/App.test.tsx
pnpm typecheck
~~~

Expected: Main 与 Renderer 测试 PASS。

- [ ] **Step 5: 将真实桌面验收转为 GREEN**

`project-registration.spec.ts` 创建临时项目目录和标记文件，使用独立 userData 启动 Electron。通过 Electron 主进程测试上下文临时替换 `dialog.showOpenDialog` 返回该目录，然后点击 Add、重启并验证恢复、点击 Remove、确认标记文件仍存在。测试骨架为：

~~~typescript
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

function launchApp(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, DCC_E2E_USER_DATA: userData }
  })
}

test('registers, restores and safely unregisters a project', async ({}, testInfo) => {
  const projectRoot = join(testInfo.outputPath(), 'sample-project')
  await mkdir(projectRoot, { recursive: true })
  const marker = join(projectRoot, 'keep-me.txt')
  await writeFile(marker, 'preserve')
  const userData = testInfo.outputPath('user-data')

  let app = await launchApp(userData)
  await app.evaluate(({ dialog }, selectedPath) => {
    Object.defineProperty(dialog, 'showOpenDialog', {
      configurable: true,
      value: async () => ({ canceled: false, filePaths: [selectedPath] })
    })
  }, projectRoot)
  let page = await app.firstWindow()
  await page.getByRole('button', { name: 'Add project' }).click()
  await expect(page.getByText('sample-project')).toBeVisible()
  await app.close()

  app = await launchApp(userData)
  page = await app.firstWindow()
  await expect(page.getByText('sample-project')).toBeVisible()
  await page.getByRole('button', { name: 'Remove sample-project' }).click()
  await expect(page.getByText('sample-project')).toBeHidden()
  await app.close()

  app = await launchApp(userData)
  page = await app.firstWindow()
  await expect(page.getByText('No projects yet')).toBeVisible()
  await expect(readFile(marker, 'utf8')).resolves.toBe('preserve')
  await app.close()
})
~~~

测试注入只发生在 Playwright 的 Electron 主进程上下文；生产代码不增加测试通道、环境变量选路或路径旁路。

~~~bash
pnpm test:e2e -- e2e/project-registration.spec.ts
~~~

Expected: RED 后只修复 Main、Preload、Renderer 和 SQLite 的必要连接，最终 PASS。

- [ ] **Step 6: 运行完整检查并提交**

`e2e/ui-viewport.spec.ts` 在常规窗口和最小支持窗口上验证横向溢出与键盘焦点，并生成检查截图：

~~~typescript
import { _electron as electron, expect, test } from '@playwright/test'

for (const size of [
  { width: 1100, height: 720 },
  { width: 760, height: 520 }
]) {
  test(`keeps the project shell usable at ${size.width}x${size.height}`, async ({}, testInfo) => {
    const app = await electron.launch({
      args: ['out/main/index.js'],
      env: { ...process.env, DCC_E2E_USER_DATA: testInfo.outputPath('user-data') }
    })
    try {
      await app.evaluate(({ BrowserWindow }, bounds) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(bounds.width, bounds.height)
      }, size)
      const page = await app.firstWindow()
      await expect(page.getByRole('button', { name: 'Add project' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'Add project' })).toBeFocused()
      await page.screenshot({ path: testInfo.outputPath(`ui-review-${size.width}x${size.height}.png`) })
    } finally {
      await app.close()
    }
  })
}
~~~

逐张打开截图确认没有溢出、遮挡、空白截图或错误状态残留。Renderer 行为测试继续覆盖 Add、项目行、Missing、Remove 和错误状态。随后只运行一次 Impeccable 机械检测：

~~~bash
node /Users/shen/.skills-manager/skills/impeccable/scripts/detect.mjs --json src/renderer/src/App.tsx src/renderer/src/styles.css
~~~

Expected: 两种窗口尺寸下空状态与 Add 操作清晰可用，键盘焦点可见；Renderer 测试覆盖其余状态。修复检测器的机械问题，并记录任何因票据范围而明确保留的提示。截图属于验证产物，不提交到 Git。

~~~bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git add src e2e vitest.config.ts
git commit -m "feat: add project registration workflow"
~~~

Expected: 全部 PASS，输出无警告。

---

### Task 5: 建立 macOS 与 Windows CI 门槛

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `.scratch/developer-control-center-mvp/issues/01-project-registration.md`

**Interfaces:**
- Consumes: Task 2–4 的类型检查、行为测试、构建与桌面验收命令。
- Produces: 双平台 CI 门槛和完成状态的票据 01。

- [ ] **Step 1: 运行完整本地检查**

~~~bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
~~~

Expected: 全部 PASS 且无警告。

- [ ] **Step 2: 创建最小权限双平台工作流**

`.github/workflows/ci.yml` 使用以下完整内容：

~~~yaml
name: CI

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify:
    name: Verify (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        os: [macos-14, windows-2025]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm test:e2e
~~~

- [ ] **Step 3: 验证并提交工作流**

~~~bash
pnpm check
rg -n 'push:|pull_request:|workflow_dispatch:|macos-14|windows-2025|contents: read|pnpm typecheck|pnpm test|pnpm build|pnpm test:e2e' .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "ci: verify project registration on desktop platforms"
~~~

Expected: check PASS，所有 CI 约束均有命中。

- [ ] **Step 4: 经明确授权后观察真实双平台 CI**

先运行 `git remote get-url origin`。若没有远程仓库，或用户尚未明确授权推送，则停止在此门槛：不得创建 GitHub 仓库、添加猜测的 remote、推送分支、勾选 CI 验收项或改变票据状态。向用户请求准确的 GitHub 仓库和推送授权。

获得授权后推送 `feature/developer-control-center-mvp`，使用 `gh run list --branch feature/developer-control-center-mvp --workflow CI --limit 1` 找到本次运行，再执行：

~~~bash
gh run watch <run-id> --exit-status
gh run view <run-id> --json jobs
~~~

Expected: `Verify (macos-14)` 与 `Verify (windows-2025)` 均为 `completed/success`。任一 Job 未成功时保持票据为 `ready-for-agent`，按测试输出修复并重新运行完整本地检查与 CI。

- [ ] **Step 5: 完成票据并提交状态**

只有本地完整检查与上述两个真实 CI Job 都有成功证据时，勾选票据 01 的全部验收项，并将其 Triage 状态改为项目定义的 `ready-for-human`，表示实现已完成且等待维护者合并判断。

~~~bash
git add .scratch/developer-control-center-mvp/issues/01-project-registration.md
git commit -m "docs: mark project registration ready for review"
git push
~~~

最终状态提交会触发第二次 CI；再次观察并要求两个矩阵 Job 都成功，然后执行：

~~~bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git status --short
~~~

Expected: 本地与最新远程 CI 全部 PASS，输出无警告，工作树除 SDD 忽略文件外干净。
