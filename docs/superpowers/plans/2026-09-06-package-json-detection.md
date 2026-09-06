# Package.json Detection Proposals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 注册根目录含 `package.json` 的开发项目后，安全生成可编辑、可删除、可拒绝的检测建议，并仅在用户预览和确认后创建经过同一配置边界校验的多服务 `.devcontrol.toml`。

**Architecture:** 先把票据 02 的单服务草稿原子迁移为 canonical `ProjectConfigurationDraft { services }`，手动配置继续提交一元素数组；Electron-free 纯 detector 只把 manifest source 转换为无执行权限的候选项。Control Center 从 Registry 解析可信项目根并协调固定路径 Host Runtime 检查，Main/Preload 只暴露 `projectId` 意图，Renderer 管理注册后的检测、建议审核、预览和确认状态，不接触脚本体、根路径或执行能力。

**Tech Stack:** Electron 44、React 19、TypeScript 7、Vite/electron-vite、pnpm 11、Node 24、`smol-toml`、Node `node:sqlite`/`node:fs/promises`、Vitest、React Testing Library、Playwright Electron、GitHub Actions

**Spec:** `docs/superpowers/specs/2026-09-06-package-json-detection-design.md`，并受 `.scratch/developer-control-center-mvp/issues/03-package-json-detection.md`、`.scratch/developer-control-center-mvp/spec.md`、`docs/superpowers/specs/2026-09-05-portable-project-configuration-design.md`、`CONTEXT.md`、ADR-0001/0002/0004/0005 约束。

## Global Constraints

- 首版支持 macOS 13 及以上版本和 Windows 11；检测、配置校验、错误与创建语义在两端一致，CI 固定运行 `macos-14` 与 `windows-2025`。
- 检测只在项目注册成功后由 Renderer 调用，注册事务不依赖检测；检测失败不得回滚或删除已保存的项目注册。
- 检测只检查已注册规范根目录中的固定文件 `.devcontrol.toml` 与 `package.json`，先检查配置是否存在；存在配置时返回 `none/configuration-exists`，不得读取 manifest。
- 只建议精确小写 `dev`、`start`、`serve`、`watch` 与冒号后至少一个字符的 `dev:*`；其他大小写、生命周期、测试、构建、发布或空 `dev:` 脚本全部忽略。
- `packageManager` 只识别 `pnpm`、`npm`、`yarn`、`bun` 的合法 `<name>@<version>` 前缀；缺失、非字符串、格式非法或未知值统一回退 `npm`，不得读取 lockfile。
- `package.json` 只按 JSON 数据解析；不得使用 `require()`、动态 import、包管理器 API、Shell、`child_process`、`eval` 或任何进程执行能力，不解析、拼接、记录或返回 package script body。
- 每个候选只使用 allowlist 中的结构化 `program`、独立 `args: ['run', scriptName]`、`workingDirectory: '.'`、`shell: false`、空 `envFiles` 与空 `env`；script name 不拼成 Shell 命令。
- 检测建议没有执行或持久化权限；拒绝只丢弃当前 Renderer 内存状态，既不调用后端 mutation，也不写 `.devcontrol.toml`，拒绝后不自动重显。
- canonical 草稿固定为 `ProjectConfigurationDraft { services: DevelopmentServiceDraft[] }`；至少一个服务，按输入顺序校验，重复服务 ID 指向后一个 `$.services[index].id`，有效服务按 service ID 的 UTF-16 code-unit 顺序序列化。
- 手动配置必须使用与检测建议相同的 canonical 多服务边界，并继续初始化一元素数组；不得保留 `{ service }` 兼容分支、联合类型或第二套校验器。
- 草稿字段路径固定为 `$.services[0].id`、`$.services[0].program`、`$.services[1].env[2].key` 这类索引形式；持久 TOML parser 继续使用 `$.services.web.program` 或 `$.services["Web"]`。
- 预览与创建都复用 `buildProjectConfigurationPreview(draft)`；创建每次重新查询 Registry、复核目录、重新校验 draft，并沿用票据 02 的原子 no-replace 发布，绝不信任旧预览或建议来源。
- Renderer 只传稳定 `projectId`；Registry 是根路径真相来源。Preload 不暴露原始 `ipcRenderer`、通用 channel、任意路径、文件读取、命令或执行接口。
- 固定检测 IPC 通道为 `detection-proposals:detect`，envelope 只允许自有属性 `projectId`；Main 必须先授权 sender，再校验普通对象 envelope。
- manifest 读取、JSON、根形状、scripts 形状、选中脚本值类型和 containment 失败使用固定 `ActionableError`；错误不得包含 manifest source、script body、环境值、底层异常、stack 或项目外路径。
- package manifest 符号链接目标必须包含在本次复核的规范项目根内；缺失映射为 `package-json-missing`，访问、类型和越界为可操作错误。
- UI 使用英文、系统字体与 `color-scheme: light dark`；候选显示 program、逐项 arguments、working directory 与 `package.json → scripts.<name>` 证据，编辑、删除、拒绝、预览、创建、错误回退均可键盘操作并有清晰焦点。
- 任意候选编辑或删除都使旧 preview 失效；preview 使用单调请求序号忽略陈旧响应，create 使用 in-flight guard 防重复提交。
- 不实现 Docker Compose、递归 workspace/monorepo、子包或 `node_modules` 扫描、lockfile 推断、手动重新检测、建议持久化、现有配置编辑、运行时预检、安装、启动或任何服务执行。
- 测试只验证公开 detector、Host Runtime、Control Center、Desktop API 与真实 Electron 可观察行为；不得断言私有实现、SQLite 表布局或脚本解释结果。
- 真实 Electron fixture 的 script body 必须在被执行时创建 marker；检测、拒绝、编辑、预览和确认全过程都必须断言 marker 不存在。
- 票据保持 `ready-for-agent`，直到本地 `pnpm check` 通过、精确 pushed SHA 对应的 `Verify (macos-14)` 与 `Verify (windows-2025)` 均成功；之后才可将票据 03 改为 `ready-for-human`，且状态提交本身也须通过 exact-SHA 双平台 CI。

---

## File Structure

- `src/shared/contracts.ts`：canonical 多服务草稿、检测证据/候选/建议/结果与窄 `DesktopApi` 类型。
- `src/control-center/project-configuration.ts`：唯一草稿校验与确定性 TOML 序列化边界；从一项迁移到多项，不加入检测知识。
- `src/control-center/package-json-detector.ts`：Electron-free、filesystem-free 的 manifest 数据解析、候选选择、package manager allowlist、ID 生成和固定错误。
- `src/control-center/errors.ts`：集中构造并绑定脱敏 package detection 错误。
- `src/control-center/host-runtime.ts`：声明固定目的 `inspectPackageJsonDetection(rootPath)` 契约。
- `src/control-center/node-host-runtime.ts`：只检查根 `.devcontrol.toml` 与 `package.json`，实现配置优先、manifest realpath containment、类型和 UTF-8 读取。
- `src/control-center/testing/test-host-runtime.ts`：记录固定检测检查并提供可控 outcome/error，不访问真实文件系统。
- `src/control-center/control-center.ts`：按 project ID 解析注册、复核规范根、调用 Host Runtime 和纯 detector，并给错误绑定 Registry 中的 ID。
- `src/main/register-detection-proposal-ipc.ts`：授权优先、严格 envelope、单固定通道的检测 IPC 适配器。
- `src/main/index.ts`、`src/preload/index.ts`：组装检测 IPC，并暴露唯一 `detectionProposals.detect(projectId)` 方法。
- `src/renderer/src/ServiceConfigurationForm.tsx`：可复用的单个 `DevelopmentServiceDraft` 字段编辑器，所有 DOM ID 与 field path 按服务 index 唯一化。
- `src/renderer/src/configuration-field-focus.ts`：手动页与建议页共享的完整 indexed fieldPath → control ID 固定映射，不解释任意表达式。
- `src/renderer/src/ProjectConfigurationView.tsx`：手动配置继续使用一元素 `services` 数组和既有 preview/create 状态机。
- `src/renderer/src/PackageJsonDetectionProposalView.tsx`：按 `candidateId` 保持候选身份，显示 evidence，支持编辑、删除、拒绝、预览和确认。
- `src/renderer/src/App.tsx`：项目注册成功后自动检测，处理 detecting/none/error/proposal、手动回退与陈旧结果。
- `e2e/package-json-project-fixture.ts`：为两个真实 Electron spec 共享 marker 项目与目录选择启动 helper，不进入产品 bundle。
- `e2e/package-json-detection.spec.ts`：通过真实 Main/Preload/Renderer、SQLite 和 Node Host Runtime 验证检测、拒绝、编辑、删除、预览、确认及 marker 永不执行。
- `.github/workflows/ci.yml`：保持 exact-SHA 的 macOS 14/Windows 2025 完整检查矩阵。
- `.scratch/developer-control-center-mvp/issues/03-package-json-detection.md`：只在所有本地与双平台门禁通过后勾选并转 `ready-for-human`。

---

### Task 1: 原子迁移 canonical 多服务项目配置草稿

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/control-center/project-configuration.ts`
- Modify: `src/control-center/project-configuration.test.ts`
- Modify: `src/control-center/control-center.test.ts`
- Modify: `src/main/register-project-configuration-ipc.test.ts`
- Create: `src/renderer/src/configuration-field-focus.ts`
- Create: `src/renderer/src/configuration-field-focus.test.ts`
- Modify: `src/renderer/src/ServiceConfigurationForm.tsx`
- Modify: `src/renderer/src/ProjectConfigurationView.tsx`
- Modify: `src/renderer/src/ProjectConfigurationView.test.tsx`
- Modify: `src/renderer/src/App.test.tsx`
- Modify: `e2e/project-configuration.spec.ts`
- Modify: `e2e/ui-viewport.spec.ts`

**Interfaces:**
- Consumes: 票据 02 的 `DevelopmentServiceDraft`、`buildProjectConfigurationPreview`、`parseProjectConfiguration`、`DesktopApi.projectConfigurations.preview/create` 与原子创建语义。
- Produces:
  - `ProjectConfigurationDraft { services: DevelopmentServiceDraft[] }`
  - `buildProjectConfigurationPreview(draft)` 至少一项、输入序校验、后项重复 ID 与确定性 service-ID 序列化。
  - `ServiceConfigurationForm({ service, serviceIndex, error, onChange })`，供手动和检测建议工作流复用。
  - `controlIdForConfigurationField(fieldPath: string | undefined): string | undefined`，供手动页和建议页复用完整 indexed error focus。
  - 手动配置初值 `{ services: [blankService] }`；不保留 `.service` 访问或 `$.service.*` 路径。

- [ ] **Step 1: 写多服务、空数组、重复 ID 与一元素兼容 RED 测试**

把 `minimalDraft` 改为 canonical 形状，并在 `project-configuration.test.ts` 增加：

```ts
const minimalDraft: ProjectConfigurationDraft = {
  services: [{
    id: 'web', program: '  pnpm  ', args: [], workingDirectory: '.',
    shell: false, envFiles: [], env: []
  }]
}

test('builds multiple services and serializes them by service id', () => {
  const draft: ProjectConfigurationDraft = {
    services: [
      { id: 'worker', program: 'node', args: ['worker.js'], workingDirectory: '.', shell: false, envFiles: [], env: [] },
      { id: 'api', program: 'npm', args: ['run', 'dev'], workingDirectory: 'apps/api', shell: false, envFiles: [], env: [] }
    ]
  }
  const preview = buildProjectConfigurationPreview(draft)
  expect(preview.source.indexOf('[services.api]')).toBeLessThan(preview.source.indexOf('[services.worker]'))
  expect(parseProjectConfiguration(preview.source).services).toEqual({
    api: { program: 'npm', args: ['run', 'dev'], workingDirectory: 'apps/api', shell: false, envFiles: [], env: {} },
    worker: { program: 'node', args: ['worker.js'], workingDirectory: '.', shell: false, envFiles: [], env: {} }
  })
})

test('requires at least one service in a draft', () => {
  expect(() => buildProjectConfigurationPreview({ services: [] })).toThrowError(
    expect.objectContaining({ detail: expect.objectContaining({
      code: 'CONFIG_SERVICES_REQUIRED', fieldPath: '$.services'
    }) })
  )
})

test('reports a duplicate id on the later service', () => {
  const duplicate = structuredClone(minimalDraft)
  duplicate.services.push({ ...structuredClone(duplicate.services[0]!), program: 'npm' })
  expect(() => buildProjectConfigurationPreview(duplicate)).toThrowError(
    expect.objectContaining({ detail: expect.objectContaining({
      code: 'CONFIG_SERVICE_ID_DUPLICATE', fieldPath: '$.services[1].id'
    }) })
  )
})

test('keeps manual configuration as a one-service draft', () => {
  const preview = buildProjectConfigurationPreview(minimalDraft)
  expect(parseProjectConfiguration(preview.source).services.web).toMatchObject({ program: 'pnpm' })
})
```

把现有恶意 draft 断言中的路径精确迁移为 `$.services[0].program`、`$.services[0].args[0]`、`$.services[0].env[1].key`；再加入 sparse `services` 与非对象服务：

```ts
test.each([
  [{ services: new Array(1) }, '$.services[0]'],
  [{ services: [null] }, '$.services[0]']
])('rejects an invalid service array entry', (draft, fieldPath) => {
  expect(() => buildProjectConfigurationPreview(draft as unknown as ProjectConfigurationDraft))
    .toThrowError(expect.objectContaining({ detail: expect.objectContaining({
      code: 'CONFIG_FIELD_TYPE_INVALID', fieldPath
    }) }))
})
```

- [ ] **Step 2: 写手动表单一元素数组和 indexed focus RED 测试**

在 `ProjectConfigurationView.test.tsx` 把公开调用断言改成：

```tsx
expect(preview).toHaveBeenCalledWith('project-1', {
  services: [expect.objectContaining({
    id: 'web', program: 'pnpm', args: ['dev'], workingDirectory: '.',
    shell: false, envFiles: [], env: []
  })]
})
```

字段错误改为 `$.services[0].env[1].key`，并断言焦点仍落在第二个环境 key；`control-center.test.ts` 与 Main IPC fixture 同样改用 `services: [...]`。运行：

创建 `configuration-field-focus.test.ts`，先固定全部映射：

```ts
test.each([
  ['$.services[0].id', 'service-0-id'],
  ['$.services[1].program', 'service-1-program'],
  ['$.services[2].workingDirectory', 'service-2-working-directory'],
  ['$.services[0].args[3]', 'service-0-argument-3'],
  ['$.services[1].envFiles[2]', 'service-1-env-file-2'],
  ['$.services[2].env[4].key', 'service-2-environment-key-4'],
  ['$.services[2].env[4].value', 'service-2-environment-value-4'],
  ['$.services[0].macos.program', 'service-0-macos-program'],
  ['$.services[0].macos.args[1]', 'service-0-macos-argument-1'],
  ['$.services[0].macos.env[2].key', 'service-0-macos-environment-key-2'],
  ['$.services[0].macos.env[2].value', 'service-0-macos-environment-value-2'],
  ['$.services[1].windows.program', 'service-1-windows-program'],
  ['$.services[1].windows.args[1]', 'service-1-windows-argument-1'],
  ['$.services[1].windows.env[2].key', 'service-1-windows-environment-key-2'],
  ['$.services[1].windows.env[2].value', 'service-1-windows-environment-value-2']
] as const)('maps %s to %s', (fieldPath, controlId) => {
  expect(controlIdForConfigurationField(fieldPath)).toBe(controlId)
})
test.each(['$.services', '$.services[4].args[0].unknown', '$.services.web.program', undefined])(
  'does not map unknown or unrendered path %s', (fieldPath) => {
    expect(controlIdForConfigurationField(fieldPath)).toBeUndefined()
  }
)
```

```bash
pnpm test -- src/control-center/project-configuration.test.ts src/control-center/control-center.test.ts src/main/register-project-configuration-ipc.test.ts src/renderer/src/configuration-field-focus.test.ts src/renderer/src/ProjectConfigurationView.test.tsx
```

Expected: FAIL；类型错误明确指出 `ProjectConfigurationDraft.service` 已不存在前测试仍未迁移，或运行时仍期待旧 `{ service }` 形状和 `$.service.*` 路径。

- [ ] **Step 3: 改为唯一 canonical 公共类型与多服务校验**

在 `contracts.ts` 替换旧接口：

```ts
export interface ProjectConfigurationDraft {
  services: DevelopmentServiceDraft[]
}
```

在 `project-configuration.ts` 将 draft 字段集合固定为 `services`，以输入 index 规范化，并在后项检测重复：

```ts
const draftFields = new Set(['services'])

function normalizeDraftService(value: unknown, index: number): [string, DevelopmentServiceConfiguration] {
  const base = `$.services[${index}]`
  if (!isRecord(value)) {
    fail('CONFIG_FIELD_TYPE_INVALID', base, 'The service draft has the wrong type.', 'Submit a structured service draft.')
  }
  rejectUnknown(value, draftServiceFields, base)
  if (typeof value.id !== 'string' || !isValidServiceId(value.id)) {
    fail('CONFIG_SERVICE_ID_INVALID', `${base}.id`, 'The service identifier is invalid.', 'Use 1-64 lowercase letters, numbers, and single hyphen-separated segments.')
  }
  if (typeof value.shell !== 'boolean') {
    fail('CONFIG_FIELD_TYPE_INVALID', `${base}.shell`, 'Shell must be a boolean.', 'Use true or false.')
  }
  return [value.id, {
    program: validateProgram(value.program, `${base}.program`),
    args: assertStringArray(value.args, `${base}.args`),
    workingDirectory: validatePortablePath(value.workingDirectory, `${base}.workingDirectory`, true),
    shell: value.shell,
    envFiles: normalizeEnvFiles(value.envFiles, `${base}.envFiles`),
    env: normalizeEnvironmentRows(value.env, `${base}.env`),
    ...(value.macos === undefined ? {} : { macos: normalizeDraftOverride(value.macos, `${base}.macos`)! }),
    ...(value.windows === undefined ? {} : { windows: normalizeDraftOverride(value.windows, `${base}.windows`)! })
  }]
}

function normalizeDraft(value: unknown): ProjectConfigurationV1 {
  if (!isRecord(value)) fail('CONFIG_FIELD_TYPE_INVALID', '$', 'The configuration draft has the wrong type.', 'Submit a structured configuration draft.')
  rejectUnknown(value, draftFields, '$')
  if (!Array.isArray(value.services) || value.services.length === 0) {
    fail('CONFIG_SERVICES_REQUIRED', '$.services', 'At least one service is required.', 'Keep or add at least one service.')
  }
  const entries: Array<[string, DevelopmentServiceConfiguration]> = []
  const seen = new Set<string>()
  for (let index = 0; index < value.services.length; index += 1) {
    if (!Object.hasOwn(value.services, index)) {
      fail('CONFIG_FIELD_TYPE_INVALID', `$.services[${index}]`, 'The service draft has the wrong type.', 'Submit a structured service draft.')
    }
    const entry = normalizeDraftService(value.services[index], index)
    if (seen.has(entry[0])) {
      fail('CONFIG_SERVICE_ID_DUPLICATE', `$.services[${index}].id`, 'The service identifier is duplicated.', 'Use a unique identifier for every service.')
    }
    seen.add(entry[0])
    entries.push(entry)
  }
  return { schemaVersion: 1, services: Object.fromEntries(entries) }
}
```

保留现有 `serialize()` 的 service-ID code-unit 排序；parser 的持久配置路径不改。删除所有旧 `draft.service`、`$.service` 与兼容联合分支。

- [ ] **Step 4: 把服务字段组件改为 index-aware 可复用接口**

`ServiceConfigurationForm.tsx` 改为只渲染一个服务的字段，不再持有外层 `<form>` 和工作流按钮：

```tsx
interface ServiceConfigurationFormProps {
  service: DevelopmentServiceDraft
  serviceIndex: number
  error: ActionableError | undefined
  onChange(service: DevelopmentServiceDraft): void
}

export function ServiceConfigurationForm(props: ServiceConfigurationFormProps) {
  const base = `$.services[${props.serviceIndex}]`
  const idPrefix = `service-${props.serviceIndex}`
  const change = (patch: Partial<DevelopmentServiceDraft>) => props.onChange({ ...props.service, ...patch })
  const changePlatform = (platform: PlatformName, override: PlatformOverrideDraft | undefined) => {
    const next = { ...props.service }
    if (override === undefined) delete next[platform]
    else next[platform] = override
    props.onChange(next)
  }
  return <div className="service-configuration-fields">
    <label htmlFor={`${idPrefix}-id`}>Service ID</label>
    <input id={`${idPrefix}-id`} value={props.service.id}
      aria-describedby={describedBy(props.error, `${base}.id`)}
      onChange={(event) => change({ id: event.target.value.trim() })} />
    <FieldIssue error={props.error} path={`${base}.id`} />
    <label htmlFor={`${idPrefix}-program`}>Program</label>
    <input id={`${idPrefix}-program`} value={props.service.program}
      aria-describedby={describedBy(props.error, `${base}.program`)}
      onChange={(event) => change({ program: event.target.value })} />
    <FieldIssue error={props.error} path={`${base}.program`} />
    <StringRows title="Arguments" itemName="Argument" addLabel="Add argument"
      idPrefix={`${idPrefix}-argument`} pathPrefix={`${base}.args`}
      values={props.service.args} error={props.error} onChange={(args) => change({ args })} />
    <label htmlFor={`${idPrefix}-working-directory`}>Working directory</label>
    <input id={`${idPrefix}-working-directory`} value={props.service.workingDirectory}
      aria-describedby={describedBy(props.error, `${base}.workingDirectory`)}
      onChange={(event) => change({ workingDirectory: event.target.value })} />
    <FieldIssue error={props.error} path={`${base}.workingDirectory`} />
    <EnvironmentRows title="Environment values" labelPrefix="" idPrefix={`${idPrefix}-environment`}
      pathPrefix={`${base}.env`} rows={props.service.env} error={props.error}
      onChange={(env) => change({ env })} />
    <StringRows title="Environment files" itemName="Environment file" addLabel="Add environment file"
      idPrefix={`${idPrefix}-env-file`} pathPrefix={`${base}.envFiles`}
      values={props.service.envFiles} error={props.error} onChange={(envFiles) => change({ envFiles })} />
    <label className="checkbox-field"><input type="checkbox" checked={props.service.shell}
      onChange={(event) => change({ shell: event.target.checked })} />Run through shell</label>
    <PlatformOverrideEditor platform="macos" serviceIndex={props.serviceIndex}
      override={props.service.macos} error={props.error}
      onChange={(macos) => changePlatform('macos', macos)} />
    <PlatformOverrideEditor platform="windows" serviceIndex={props.serviceIndex}
      override={props.service.windows} error={props.error}
      onChange={(windows) => changePlatform('windows', windows)} />
  </div>
}
```

`PlatformOverrideEditor` 的 base 改为 ``$.services[${serviceIndex}].${platform}``，DOM prefix 同样带 `service-${serviceIndex}`；`StringRows` 与 `EnvironmentRows` 继续使用稳定本地 row key。

创建 `configuration-field-focus.ts`，只解析固定语法，不执行 field path：

```ts
export function controlIdForConfigurationField(fieldPath: string | undefined): string | undefined {
  const direct = fieldPath?.match(/^\$\.services\[(\d+)]\.(id|program|workingDirectory)$/)
  if (direct) {
    const field = direct[2] === 'workingDirectory' ? 'working-directory' : direct[2]
    return `service-${direct[1]}-${field}`
  }
  const row = fieldPath?.match(/^\$\.services\[(\d+)]\.(args|envFiles)\[(\d+)]$/)
  if (row) {
    const field = row[2] === 'args' ? 'argument' : 'env-file'
    return `service-${row[1]}-${field}-${row[3]}`
  }
  const environment = fieldPath?.match(/^\$\.services\[(\d+)]\.env\[(\d+)]\.(key|value)$/)
  if (environment) return `service-${environment[1]}-environment-${environment[3]}-${environment[2]}`
  const platformDirect = fieldPath?.match(/^\$\.services\[(\d+)]\.(macos|windows)\.program$/)
  if (platformDirect) return `service-${platformDirect[1]}-${platformDirect[2]}-program`
  const platformArgument = fieldPath?.match(/^\$\.services\[(\d+)]\.(macos|windows)\.args\[(\d+)]$/)
  if (platformArgument) return `service-${platformArgument[1]}-${platformArgument[2]}-argument-${platformArgument[3]}`
  const platformEnvironment = fieldPath?.match(/^\$\.services\[(\d+)]\.(macos|windows)\.env\[(\d+)]\.(key|value)$/)
  return platformEnvironment
    ? `service-${platformEnvironment[1]}-${platformEnvironment[2]}-environment-${platformEnvironment[4]}-${platformEnvironment[3]}`
    : undefined
}
```

- [ ] **Step 5: 迁移手动工作流和所有现有 fixture**

`ProjectConfigurationView.tsx` 使用：

```tsx
const initialDraft: ProjectConfigurationDraft = { services: [{
  id: 'web', program: '', args: [], workingDirectory: '.',
  shell: false, envFiles: [], env: []
}] }

function updateService(draft: ProjectConfigurationDraft, index: number, service: DevelopmentServiceDraft): ProjectConfigurationDraft {
  return { services: draft.services.map((current, currentIndex) => currentIndex === index ? service : current) }
}

<form onSubmit={(event) => { event.preventDefault(); void previewConfiguration() }}>
  <ServiceConfigurationForm service={state.draft.services[0]!} serviceIndex={0}
    error={state.error} onChange={(service) => editDraft(updateService(state.draft, 0, service))} />
  <div className="configuration-actions">
    <button type="button" onClick={onBack}>Back to projects</button>
    <button type="submit" className="primary-action">Preview configuration</button>
  </div>
</form>
```

`ProjectConfigurationView` 删除本地 `controlIdFor`，导入 `controlIdForConfigurationField`，再用 `document.getElementById(mappedId)`；映射不到或控件未渲染时才聚焦页级 alert。把 Control Center/Main/Renderer fake 与现有 E2E 预期全部迁移到 `services[0]`；已有 Electron 手动配置行为必须保持不变。

- [ ] **Step 6: 运行 GREEN、扫描旧契约并提交**

```bash
pnpm test -- src/control-center/project-configuration.test.ts src/control-center/control-center.test.ts src/main/register-project-configuration-ipc.test.ts src/renderer/src/configuration-field-focus.test.ts src/renderer/src/ProjectConfigurationView.test.tsx src/renderer/src/App.test.tsx
pnpm typecheck
pnpm test:e2e -- e2e/project-configuration.spec.ts e2e/ui-viewport.spec.ts
rg -n "ProjectConfigurationDraft.*service|draft\.service|\.service\.(args|env|envFiles|program|workingDirectory)|\$\.service(?:\.|\[)" src e2e
git add src/shared/contracts.ts src/control-center/project-configuration.ts src/control-center/project-configuration.test.ts src/control-center/control-center.test.ts src/main/register-project-configuration-ipc.test.ts src/renderer/src/configuration-field-focus.ts src/renderer/src/configuration-field-focus.test.ts src/renderer/src/ServiceConfigurationForm.tsx src/renderer/src/ProjectConfigurationView.tsx src/renderer/src/ProjectConfigurationView.test.tsx src/renderer/src/App.test.tsx e2e/project-configuration.spec.ts e2e/ui-viewport.spec.ts
git commit -m "refactor: support multi-service configuration drafts"
```

Expected: 所列测试、typecheck 与现有真实 Electron 手动创建均 PASS；`rg` 无旧草稿/路径命中；手动 API 只发送一元素 `services` 数组。

---

### Task 2: 实现纯 package.json detector 与候选公共契约

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/control-center/errors.ts`
- Create: `src/control-center/package-json-detector.ts`
- Create: `src/control-center/package-json-detector.test.ts`

**Interfaces:**
- Consumes: `DevelopmentServiceDraft`、`ControlCenterError` 和固定配置字段默认值。
- Produces:
  - `PackageJsonDetectionEvidence { kind: 'package_json'; relativePath: 'package.json'; scriptName: string }`
  - `PackageJsonDetectionCandidate { candidateId; evidence; draft }`
  - `PackageJsonDetectionProposal { projectId; candidates }`
  - `DetectionProposalResult = proposal | none`
  - `detectPackageJsonCandidates(source: string): PackageJsonDetectionCandidate[]`
  - 固定错误 `PACKAGE_JSON_INVALID`、`PACKAGE_JSON_ROOT_INVALID`、`PACKAGE_JSON_SCRIPTS_INVALID`、`PACKAGE_JSON_SCRIPT_INVALID`，均不含 source/body。

- [ ] **Step 1: 写脚本选择、顺序、manager 与默认字段 RED 测试**

创建 `package-json-detector.test.ts`：

```ts
import { expect, test } from 'vitest'
import { detectPackageJsonCandidates } from './package-json-detector'

test('selects only exact long-running script names in code-unit order', () => {
  const source = JSON.stringify({ scripts: {
    test: 42, Dev: 'ignored', 'prestart': 'ignored', 'dev:': 'ignored',
    watch: 'opaque-watch-body', 'dev:web': 'opaque-web-body', dev: 'opaque-dev-body',
    serve: 'opaque-serve-body', start: 'opaque-start-body', build: 'ignored'
  } })
  const candidates = detectPackageJsonCandidates(source)
  expect(candidates.map((candidate) => candidate.evidence.scriptName)).toEqual([
    'dev', 'dev:web', 'serve', 'start', 'watch'
  ])
  expect(candidates.map((candidate) => candidate.draft.args)).toEqual([
    ['run', 'dev'], ['run', 'dev:web'], ['run', 'serve'], ['run', 'start'], ['run', 'watch']
  ])
  expect(candidates.every((candidate) => candidate.draft.shell === false)).toBe(true)
  expect(candidates.every((candidate) => candidate.draft.workingDirectory === '.')).toBe(true)
  expect(candidates.every((candidate) => candidate.draft.envFiles.length === 0 && candidate.draft.env.length === 0)).toBe(true)
  expect(JSON.stringify(candidates)).not.toContain('opaque-')
})

test('treats missing scripts as no candidates', () => {
  expect(detectPackageJsonCandidates('{"name":"plain-package"}')).toEqual([])
})

test.each([
  ['pnpm@10.17.1', 'pnpm'], ['npm@11.5.2', 'npm'],
  ['yarn@4.9.2', 'yarn'], ['bun@1.2.22', 'bun'],
  [undefined, 'npm'], [null, 'npm'], ['pnpm', 'npm'], ['pnpm@', 'npm'],
  ['pnpm@10 extra', 'npm'], ['unknown@1.0.0', 'npm'], ['@scope/tool@1', 'npm']
] as const)('maps packageManager %s to %s', (packageManager, program) => {
  const source = JSON.stringify({ packageManager, scripts: { dev: 'opaque' } })
  expect(detectPackageJsonCandidates(source)[0]!.draft.program).toBe(program)
})
```

- [ ] **Step 2: 写 ID、collision、错误和 script-body 脱敏 RED 测试**

```ts
test('normalizes ids, truncates to 64 and resolves collisions in candidate order', () => {
  const long = `dev:${'x'.repeat(80)}`
  const candidates = detectPackageJsonCandidates(JSON.stringify({ scripts: {
    'dev::web': 'first-body', 'dev:-web': 'second-body', [long]: 'long-body'
  } }))
  expect(candidates.map((candidate) => candidate.draft.id)).toEqual([
    'dev-web', 'dev-web-2', `dev-${'x'.repeat(60)}`
  ])
  expect(new Set(candidates.map((candidate) => candidate.candidateId)).size).toBe(3)
  expect(candidates.every((candidate) => candidate.candidateId.startsWith('package-json:'))).toBe(true)
})

test.each([
  ['{"scripts":', 'PACKAGE_JSON_INVALID', '$'],
  ['[]', 'PACKAGE_JSON_ROOT_INVALID', '$'],
  ['{"scripts":[]}', 'PACKAGE_JSON_SCRIPTS_INVALID', '$.scripts'],
  ['{"scripts":{"dev":42}}', 'PACKAGE_JSON_SCRIPT_INVALID', '$.scripts["dev"]'],
  ['{"scripts":{"dev:web":null}}', 'PACKAGE_JSON_SCRIPT_INVALID', '$.scripts["dev:web"]']
] as const)('returns a fixed error for malformed manifest data', (source, code, fieldPath) => {
  let thrown: unknown
  try { detectPackageJsonCandidates(source) } catch (error) { thrown = error }
  expect(thrown).toMatchObject({ detail: { code, fieldPath, resource: { kind: 'project' } } })
  expect(JSON.stringify(thrown)).not.toContain(source)
})

test('never returns or leaks a selected script body', () => {
  const body = 'mutation-script-body-8f4e'
  const result = detectPackageJsonCandidates(JSON.stringify({ scripts: { dev: body } }))
  expect(JSON.stringify(result)).not.toContain(body)
})
```

Run: `pnpm test -- src/control-center/package-json-detector.test.ts`

Expected: FAIL，模块和检测契约尚不存在。

- [ ] **Step 3: 增加精确共享类型与脱敏错误工厂**

在 `contracts.ts` 增加绑定规格的原样形状：

```ts
export interface PackageJsonDetectionEvidence {
  kind: 'package_json'
  relativePath: 'package.json'
  scriptName: string
}
export interface PackageJsonDetectionCandidate {
  candidateId: string
  evidence: PackageJsonDetectionEvidence
  draft: DevelopmentServiceDraft
}
export interface PackageJsonDetectionProposal {
  projectId: string
  candidates: PackageJsonDetectionCandidate[]
}
export type DetectionProposalResult =
  | { kind: 'proposal'; proposal: PackageJsonDetectionProposal }
  | { kind: 'none'; reason: 'configuration-exists' | 'package-json-missing' | 'no-candidates' }
```

在 `errors.ts` 增加：

```ts
export function packageJsonDetectionError(
  code: string,
  fieldPath: string | undefined,
  message: string,
  nextAction: string,
  projectId?: string
): ControlCenterError {
  return new ControlCenterError({
    code,
    resource: projectId ? { kind: 'project', id: projectId } : { kind: 'project' },
    ...(fieldPath === undefined ? {} : { fieldPath }),
    message,
    nextAction
  })
}
```

- [ ] **Step 4: 实现纯 detector 完整最小代码**

创建 `package-json-detector.ts`：

```ts
import type { PackageJsonDetectionCandidate } from '../shared/contracts'
import { packageJsonDetectionError } from './errors'

type UnknownRecord = Record<string, unknown>
const exactScripts = new Set(['dev', 'start', 'serve', 'watch'])
const packageManagers = new Set(['pnpm', 'npm', 'yarn', 'bun'])

function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
function fail(code: string, fieldPath: string, message: string, nextAction: string): never {
  throw packageJsonDetectionError(code, fieldPath, message, nextAction)
}
function selectedScript(name: string): boolean {
  return exactScripts.has(name) || (name.startsWith('dev:') && name.length > 4)
}
function packageManagerFrom(value: unknown): string {
  if (typeof value !== 'string') return 'npm'
  const match = value.match(/^([^@\s]+)@([^@\s]+)$/)
  return match && packageManagers.has(match[1]!) ? match[1]! : 'npm'
}
function baseServiceId(scriptName: string): string {
  let value = scriptName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (value.length === 0 || !/^[a-z]/.test(value)) value = `service-${value}`.replace(/-+$/, '')
  return value.slice(0, 64).replace(/-+$/, '')
}
function uniqueServiceId(scriptName: string, used: Set<string>): string {
  const base = baseServiceId(scriptName)
  let candidate = base
  for (let occurrence = 2; used.has(candidate); occurrence += 1) {
    const suffix = `-${occurrence}`
    candidate = `${base.slice(0, 64 - suffix.length).replace(/-+$/, '')}${suffix}`
  }
  used.add(candidate)
  return candidate
}

export function detectPackageJsonCandidates(source: string): PackageJsonDetectionCandidate[] {
  let document: unknown
  try { document = JSON.parse(source) } catch {
    fail('PACKAGE_JSON_INVALID', '$', 'The package manifest is not valid JSON.', 'Correct package.json or configure the project manually.')
  }
  if (!isRecord(document)) {
    fail('PACKAGE_JSON_ROOT_INVALID', '$', 'The package manifest root must be an object.', 'Correct package.json or configure the project manually.')
  }
  if (document.scripts === undefined) return []
  if (!isRecord(document.scripts)) {
    fail('PACKAGE_JSON_SCRIPTS_INVALID', '$.scripts', 'The package scripts field must be an object.', 'Correct package.json or configure the project manually.')
  }
  const scriptNames = Object.keys(document.scripts).filter(selectedScript).sort(compareCodeUnits)
  for (const scriptName of scriptNames) {
    if (typeof document.scripts[scriptName] !== 'string') {
      fail('PACKAGE_JSON_SCRIPT_INVALID', `$.scripts[${JSON.stringify(scriptName)}]`, 'The selected package script must be a string.', 'Correct package.json or configure the project manually.')
    }
  }
  const program = packageManagerFrom(document.packageManager)
  const usedIds = new Set<string>()
  return scriptNames.map((scriptName, index) => ({
    candidateId: `package-json:${index}:${scriptName}`,
    evidence: { kind: 'package_json', relativePath: 'package.json', scriptName },
    draft: {
      id: uniqueServiceId(scriptName, usedIds),
      program,
      args: ['run', scriptName],
      workingDirectory: '.',
      shell: false,
      envFiles: [],
      env: []
    }
  }))
}
```

- [ ] **Step 5: 运行 GREEN、安全扫描并提交**

```bash
pnpm test -- src/control-center/package-json-detector.test.ts
pnpm typecheck
rg -n "child_process|spawn|exec|eval|Function|require\(|import\(" src/control-center/package-json-detector.ts
git add src/shared/contracts.ts src/control-center/errors.ts src/control-center/package-json-detector.ts src/control-center/package-json-detector.test.ts
git commit -m "feat: detect package json service candidates"
```

Expected: detector 测试与 typecheck PASS；安全扫描无命中；结果和序列化错误均不含 script body。

---

### Task 3: 增加 Host Runtime 固定路径检查与 containment

**Files:**
- Modify: `src/control-center/host-runtime.ts`
- Modify: `src/control-center/node-host-runtime.ts`
- Modify: `src/control-center/node-host-runtime.test.ts`
- Modify: `src/control-center/errors.ts`
- Modify: `src/control-center/testing/test-host-runtime.ts`
- Modify: `src/control-center/control-center.test.ts`

**Interfaces:**
- Consumes: 本次由 Control Center 复核的 canonical root path；固定 basename `.devcontrol.toml` 与 `package.json`。
- Produces:
  - `PackageJsonDetectionInspection = configuration-exists | package-json-missing | package-json/source`
  - `HostRuntime.inspectPackageJsonDetection(rootPath: string): Promise<PackageJsonDetectionInspection>`
  - Test Host 的 `packageJsonDetectionInspections` 调用记录与可控 outcome/error。
  - 固定 `PACKAGE_JSON_READ_FAILED` 与 `PACKAGE_JSON_OUTSIDE_PROJECT` 错误，不回显 source 或 outside path。

- [ ] **Step 1: 调整 fs imports/mock 并写配置优先、缺失、读取与 fixed-path RED 测试**

在 `node-host-runtime.test.ts` 的 fs import 明确加入 `lstat`、`readFile`、`stat`、`symlink`、`unlink`；mock 保持未覆盖调用落到真实 Node API：

```ts
import {
  link, lstat, mkdtemp, mkdir, open, readFile, readdir, realpath, rm,
  stat, symlink, unlink, writeFile
} from 'node:fs/promises'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    realpath: vi.fn(actual.realpath), lstat: vi.fn(actual.lstat),
    stat: vi.fn(actual.stat), readFile: vi.fn(actual.readFile),
    symlink: vi.fn(actual.symlink), unlink: vi.fn(actual.unlink),
    open: vi.fn(actual.open), link: vi.fn(actual.link), rm: vi.fn(actual.rm)
  }
})
```

随后加入：

```ts
test('returns configuration-exists without reading package.json', async () => {
  const rootPath = join(temporaryRoot, 'configured-project')
  await mkdir(rootPath)
  await writeFile(join(rootPath, '.devcontrol.toml'), 'existing', 'utf8')
  await writeFile(join(rootPath, 'package.json'), '{"scripts":{"dev":"opaque"}}', 'utf8')
  vi.mocked(readFile).mockClear()
  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath))
    .resolves.toEqual({ kind: 'configuration-exists' })
  expect(readFile).not.toHaveBeenCalled()
})

test('returns package-json-missing for an absent fixed manifest', async () => {
  const rootPath = join(temporaryRoot, 'empty-project')
  await mkdir(rootPath)
  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath))
    .resolves.toEqual({ kind: 'package-json-missing' })
})

test('reads only the root package.json as UTF-8', async () => {
  const rootPath = join(temporaryRoot, 'node-project')
  const source = '{"scripts":{"dev":"opaque"}}'
  await mkdir(join(rootPath, 'packages', 'nested'), { recursive: true })
  await writeFile(join(rootPath, 'package.json'), source, 'utf8')
  await writeFile(join(rootPath, 'packages', 'nested', 'package.json'), 'nested-marker', 'utf8')
  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath))
    .resolves.toEqual({ kind: 'package-json', source })
  expect(vi.mocked(readFile)).toHaveBeenCalledOnce()
  expect(vi.mocked(readFile).mock.calls[0]![0]).toBe(join(rootPath, 'package.json'))
})
```

- [ ] **Step 2: 写符号链接越界、类型、访问错误与脱敏 RED 测试**

```ts
test.skipIf(process.platform === 'win32')('rejects a package.json symlink outside the canonical root', async () => {
  const rootPath = join(temporaryRoot, 'project')
  const outsidePath = join(temporaryRoot, 'outside-package.json')
  await mkdir(rootPath)
  await writeFile(outsidePath, '{"scripts":{"dev":"outside-body"}}', 'utf8')
  await symlink(outsidePath, join(rootPath, 'package.json'))
  const error = await new NodeHostRuntime().inspectPackageJsonDetection(rootPath).then(
    () => { throw new Error('Expected containment rejection.') },
    (value: unknown) => value
  )
  expect(error).toMatchObject({ detail: { code: 'PACKAGE_JSON_OUTSIDE_PROJECT' } })
  expect(JSON.stringify(error)).not.toContain(outsidePath)
  expect(JSON.stringify(error)).not.toContain('outside-body')
})

test.skipIf(process.platform === 'win32')('reads an internal package.json symlink through its contained resolved target', async () => {
  const rootPath = join(temporaryRoot, 'project')
  const internalTarget = join(rootPath, 'manifests', 'package-source.json')
  const packagePath = join(rootPath, 'package.json')
  const source = '{"scripts":{"dev":"internal-body"}}'
  await mkdir(join(rootPath, 'manifests'), { recursive: true })
  await writeFile(internalTarget, source, 'utf8')
  await symlink(internalTarget, packagePath)
  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath))
    .resolves.toEqual({ kind: 'package-json', source })
  expect(readFile).toHaveBeenCalledWith(await realpath(internalTarget), 'utf8')
})

test.skipIf(process.platform === 'win32')('does not follow a packagePath swap after realpath containment', async () => {
  const rootPath = join(temporaryRoot, 'project')
  const packagePath = join(rootPath, 'package.json')
  const internalTarget = join(rootPath, 'internal-package.json')
  const outsideTarget = join(temporaryRoot, 'outside-package.json')
  await mkdir(rootPath)
  await writeFile(internalTarget, '{"scripts":{"dev":"internal-body"}}', 'utf8')
  await writeFile(outsideTarget, '{"scripts":{"dev":"outside-body"}}', 'utf8')
  await symlink(internalTarget, packagePath)
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(stat).mockImplementationOnce(async (target) => {
    const details = await actual.stat(target)
    await unlink(packagePath)
    await symlink(outsideTarget, packagePath)
    return details
  })
  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath)).resolves.toEqual({
    kind: 'package-json', source: '{"scripts":{"dev":"internal-body"}}'
  })
  expect(readFile).toHaveBeenCalledWith(await realpath(internalTarget), 'utf8')
})

test('rejects a directory at package.json without reading it', async () => {
  const rootPath = join(temporaryRoot, 'project')
  await mkdir(join(rootPath, 'package.json'), { recursive: true })
  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath)).rejects.toMatchObject({
    detail: { code: 'PACKAGE_JSON_READ_FAILED', resource: { kind: 'project' } }
  })
  expect(readFile).not.toHaveBeenCalled()
})

test.each(['EACCES', 'EPERM'])('maps package manifest access error %s without raw details', async (code) => {
  vi.mocked(readFile).mockRejectedValueOnce(Object.assign(new Error('/outside/raw-path'), { code }))
  const rootPath = join(temporaryRoot, 'project')
  await mkdir(rootPath)
  await writeFile(join(rootPath, 'package.json'), '{}', 'utf8')
  const error = await new NodeHostRuntime().inspectPackageJsonDetection(rootPath).catch((value) => value)
  expect(error).toMatchObject({ detail: { code: 'PACKAGE_JSON_READ_FAILED' } })
  expect(JSON.stringify(error)).not.toContain('/outside/raw-path')
})
```

Run: `pnpm test -- src/control-center/node-host-runtime.test.ts`

Expected: FAIL，`HostRuntime` 尚无固定检测操作。

- [ ] **Step 3: 扩展 Host Runtime 契约与固定错误**

`host-runtime.ts` 增加：

```ts
export type PackageJsonDetectionInspection =
  | { kind: 'configuration-exists' }
  | { kind: 'package-json-missing' }
  | { kind: 'package-json'; source: string }

export interface HostRuntime {
  inspectProjectDirectory(rootPath: string): Promise<ProjectDirectory>
  inspectPackageJsonDetection(rootPath: string): Promise<PackageJsonDetectionInspection>
  createProjectConfiguration(rootPath: string, source: string): Promise<void>
}
```

`errors.ts` 增加固定工厂：

```ts
export function packageJsonReadFailed(): ControlCenterError {
  return packageJsonDetectionError('PACKAGE_JSON_READ_FAILED', undefined,
    'The package manifest could not be read safely.',
    'Check the root package.json file or configure the project manually.')
}
export function packageJsonOutsideProject(): ControlCenterError {
  return packageJsonDetectionError('PACKAGE_JSON_OUTSIDE_PROJECT', undefined,
    'The package manifest resolves outside the development project.',
    'Replace the link with a package.json file inside the project or configure the project manually.')
}
```

- [ ] **Step 4: 实现固定文件顺序和 realpath containment**

在 `node-host-runtime.ts` 增加以下公开方法与本地 helpers；只把第一次 `lstat(packagePath)` 的 `ENOENT` 视为 manifest 缺失：

```ts
function isMissing(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}
function isContained(rootPath: string, targetPath: string): boolean {
  const candidate = relative(rootPath, targetPath)
  return candidate !== '..' && !candidate.startsWith(`..${sep}`) && !isAbsolute(candidate)
}

async inspectPackageJsonDetection(rootPath: string): Promise<PackageJsonDetectionInspection> {
  const configurationPath = join(rootPath, '.devcontrol.toml')
  try {
    await lstat(configurationPath)
    return { kind: 'configuration-exists' }
  } catch (error) {
    if (!isMissing(error)) throw packageJsonReadFailed()
  }

  const packagePath = join(rootPath, 'package.json')
  try {
    await lstat(packagePath)
  } catch (error) {
    if (isMissing(error)) return { kind: 'package-json-missing' }
    throw packageJsonReadFailed()
  }

  let resolvedPath: string
  try { resolvedPath = await realpath(packagePath) } catch { throw packageJsonReadFailed() }
  if (!isContained(rootPath, resolvedPath)) throw packageJsonOutsideProject()
  try {
    const details = await stat(resolvedPath)
    if (!details.isFile()) throw packageJsonReadFailed()
    return { kind: 'package-json', source: await readFile(resolvedPath, 'utf8') }
  } catch (error) {
    if (error instanceof ControlCenterError) throw error
    throw packageJsonReadFailed()
  }
}
```

生产 imports 增加 `lstat/readFile` 与 `isAbsolute/relative/sep`。最终读取必须使用已通过 containment 的 `resolvedPath`，不能再次解引用可被替换的 `packagePath`。

威胁边界保持绑定设计要求的静态 symlink containment：该顺序拒绝检查时已经指向项目外的链接，并防止 `packagePath` 在 `realpath` 后被替换而重定向最终 read。它不声称抵御另一个本地 actor 在 `stat(resolvedPath)` 后替换 `resolvedPath` 自身目录项；跨平台 fd-bound/no-follow 读取需要新的 Host Runtime 契约与平台策略，不在本票据引入。无论发生何种读取错误，公开结果仍只返回固定脱敏错误。

- [ ] **Step 5: 扩展 Test Host 并运行 GREEN**

`TestHostRuntime` 增加保持现有构造调用兼容的可选 maps：

```ts
readonly packageJsonDetectionInspections: string[] = []
constructor(
  private readonly directories: ReadonlyMap<string, ProjectDirectory>,
  private readonly detections: ReadonlyMap<string, PackageJsonDetectionInspection> = new Map(),
  private readonly detectionErrors: ReadonlyMap<string, unknown> = new Map()
) {}
async inspectPackageJsonDetection(rootPath: string): Promise<PackageJsonDetectionInspection> {
  this.packageJsonDetectionInspections.push(rootPath)
  if (this.detectionErrors.has(rootPath)) throw this.detectionErrors.get(rootPath)
  return this.detections.get(rootPath) ?? { kind: 'package-json-missing' }
}
```

所有现有手写 `HostRuntime` fake 增加返回 `package-json-missing` 的方法。然后：

```bash
pnpm test -- src/control-center/node-host-runtime.test.ts src/control-center/control-center.test.ts
pnpm typecheck
rg -n "\.devcontrol\.toml|package\.json|readFile|readdir|lock" src/control-center/node-host-runtime.ts
git add src/control-center/host-runtime.ts src/control-center/node-host-runtime.ts src/control-center/node-host-runtime.test.ts src/control-center/errors.ts src/control-center/testing/test-host-runtime.ts src/control-center/control-center.test.ts
git commit -m "feat: inspect root package json safely"
```

Expected: tests/typecheck PASS；扫描只显示两个固定 basename 和一次固定 manifest 读取，不出现目录遍历或 lockfile。

---

### Task 4: 通过 Control Center 编排检测结果与项目绑定错误

**Files:**
- Modify: `src/control-center/control-center.ts`
- Modify: `src/control-center/control-center.test.ts`
- Modify: `src/control-center/errors.ts`

**Interfaces:**
- Consumes: `ProjectRegistry.get`、`HostRuntime.inspectProjectDirectory`、`HostRuntime.inspectPackageJsonDetection`、`detectPackageJsonCandidates`。
- Produces:
  - `ControlCenter.detectProjectConfiguration(projectId: string): Promise<DetectionProposalResult>`
  - package detection errors 只绑定 Registry 返回的 `project.id`。
  - `configuration-exists`、`package-json-missing`、`no-candidates` 与 proposal 的公开结果。

- [ ] **Step 1: 写三种 none、proposal 与可信根 RED 测试**

在 `control-center.test.ts` 增加 fixture helper 与用例：

```ts
function detectionCenter(inspection: PackageJsonDetectionInspection) {
  const registry = new TestProjectRegistry([
    { id: 'stored-project-id', name: 'sample-project', rootPath: '/stored/project' }
  ])
  const host = new TestHostRuntime(
    new Map([['/stored/project', { canonicalPath: '/canonical/project', name: 'sample-project' }]]),
    new Map([['/canonical/project', inspection]])
  )
  return { center: new ControlCenter(registry, host), host, registry }
}

test.each([
  [{ kind: 'configuration-exists' }, { kind: 'none', reason: 'configuration-exists' }],
  [{ kind: 'package-json-missing' }, { kind: 'none', reason: 'package-json-missing' }],
  [{ kind: 'package-json', source: '{"scripts":{"test":"opaque"}}' }, { kind: 'none', reason: 'no-candidates' }]
] as const)('maps host inspection to a none result', async (inspection, expected) => {
  const { center } = detectionCenter(inspection)
  await expect(center.detectProjectConfiguration('stored-project-id')).resolves.toEqual(expected)
})

test('returns a project-bound proposal from the canonical registered root', async () => {
  const { center, host } = detectionCenter({
    kind: 'package-json', source: '{"packageManager":"pnpm@10.17.1","scripts":{"dev":"opaque","dev:api":"opaque-api"}}'
  })
  await expect(center.detectProjectConfiguration('stored-project-id')).resolves.toMatchObject({
    kind: 'proposal',
    proposal: {
      projectId: 'stored-project-id',
      candidates: [
        { evidence: { scriptName: 'dev' }, draft: { id: 'dev', program: 'pnpm', args: ['run', 'dev'] } },
        { evidence: { scriptName: 'dev:api' }, draft: { id: 'dev-api', program: 'pnpm', args: ['run', 'dev:api'] } }
      ]
    }
  })
  expect(host.packageJsonDetectionInspections).toEqual(['/canonical/project'])
})
```

- [ ] **Step 2: 写身份顺序、错误绑定与注册存活 RED 测试**

```ts
test('rejects invalid and unknown project ids before host detection', async () => {
  const registry = new TestProjectRegistry()
  const host = new TestHostRuntime(new Map())
  const center = new ControlCenter(registry, host)
  await expect(center.detectProjectConfiguration(' ')).rejects.toMatchObject({ detail: { code: 'INVALID_PROJECT_ID' } })
  await expect(center.detectProjectConfiguration('missing')).rejects.toMatchObject({
    detail: { code: 'PROJECT_NOT_FOUND', resource: { kind: 'project', id: 'missing' } }
  })
  expect(host.packageJsonDetectionInspections).toEqual([])
})

test('binds detector errors to the stored project id without manifest source', async () => {
  const source = '{"scripts":{"dev":"secret-script-body","dev:api":7}}'
  const { center } = detectionCenter({ kind: 'package-json', source })
  const error = await center.detectProjectConfiguration('stored-project-id').catch((value) => value)
  expect(error).toMatchObject({ detail: {
    code: 'PACKAGE_JSON_SCRIPT_INVALID',
    resource: { kind: 'project', id: 'stored-project-id' },
    fieldPath: '$.scripts["dev:api"]'
  } })
  expect(JSON.stringify(error)).not.toContain(source)
  expect(JSON.stringify(error)).not.toContain('secret-script-body')
})

test('keeps registration after detection failure', async () => {
  const { center } = detectionCenter({ kind: 'package-json', source: '{invalid' })
  await expect(center.detectProjectConfiguration('stored-project-id')).rejects.toMatchObject({
    detail: { code: 'PACKAGE_JSON_INVALID' }
  })
  await expect(center.listProjects()).resolves.toEqual([expect.objectContaining({
    id: 'stored-project-id', availability: 'available'
  })])
})
```

Run: `pnpm test -- src/control-center/control-center.test.ts`

Expected: FAIL，Control Center 尚未暴露检测意图。

- [ ] **Step 3: 增加仅绑定 package detection error 的工厂**

避免改变现有 `INVALID_PROJECT_ID`、`PROJECT_NOT_FOUND` 保留语义：

```ts
const packageJsonDetectionCodes = new Set([
  'PACKAGE_JSON_READ_FAILED', 'PACKAGE_JSON_OUTSIDE_PROJECT', 'PACKAGE_JSON_INVALID',
  'PACKAGE_JSON_ROOT_INVALID', 'PACKAGE_JSON_SCRIPTS_INVALID', 'PACKAGE_JSON_SCRIPT_INVALID'
])
export function withPackageJsonDetectionProjectId(
  error: ControlCenterError,
  projectId: string
): ControlCenterError {
  if (error.detail.resource.kind !== 'project' || !packageJsonDetectionCodes.has(error.detail.code)) return error
  return new ControlCenterError({ ...error.detail, resource: { kind: 'project', id: projectId } })
}
```

- [ ] **Step 4: 实现检测编排并保持注册事务分离**

在 `ControlCenter` 增加：

```ts
async detectProjectConfiguration(projectId: string): Promise<DetectionProposalResult> {
  if (typeof projectId !== 'string' || projectId.trim().length === 0) throw invalidProjectId()
  const project = this.projectRegistry.get(projectId)
  if (project === null) throw projectNotFound(projectId)
  let directory: ProjectDirectory
  try {
    directory = await this.hostRuntime.inspectProjectDirectory(project.rootPath)
  } catch (error) {
    if (error instanceof ControlCenterError) throw withProjectId(error, project.id)
    throw error
  }
  try {
    const inspection = await this.hostRuntime.inspectPackageJsonDetection(directory.canonicalPath)
    if (inspection.kind === 'configuration-exists') return { kind: 'none', reason: 'configuration-exists' }
    if (inspection.kind === 'package-json-missing') return { kind: 'none', reason: 'package-json-missing' }
    const candidates = detectPackageJsonCandidates(inspection.source)
    return candidates.length === 0
      ? { kind: 'none', reason: 'no-candidates' }
      : { kind: 'proposal', proposal: { projectId: project.id, candidates } }
  } catch (error) {
    if (error instanceof ControlCenterError) {
      throw withPackageJsonDetectionProjectId(error, project.id)
    }
    throw error
  }
}
```

`registerProject()` 不调用 detector；自动检测只在后续 Renderer 意图发生。

- [ ] **Step 5: 运行 GREEN、公开边界扫描并提交**

```bash
pnpm test -- src/control-center/control-center.test.ts src/control-center/package-json-detector.test.ts src/control-center/node-host-runtime.test.ts
pnpm typecheck
rg -n "detectProjectConfiguration|inspectPackageJsonDetection|detectPackageJsonCandidates" src/control-center
git add src/control-center/control-center.ts src/control-center/control-center.test.ts src/control-center/errors.ts
git commit -m "feat: orchestrate package json detection"
```

Expected: tests/typecheck PASS；调用链严格为 Registry → directory reinspection → fixed Host Runtime inspection → pure detector，错误资源使用 stored ID。

---

### Task 5: 接通单一检测 IPC 与安全 Preload

**Files:**
- Create: `src/main/register-detection-proposal-ipc.ts`
- Create: `src/main/register-detection-proposal-ipc.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/renderer/src/App.test.tsx`
- Modify: `src/renderer/src/ProjectConfigurationView.test.tsx`
- Modify: `e2e/app-shell.spec.ts`

**Interfaces:**
- Consumes: `ControlCenter.detectProjectConfiguration(projectId)` 与现有 `authorizedResult(..., 'project', action)`。
- Produces:
  - IPC channel `detection-proposals:detect`
  - `registerDetectionProposalIpc(ipc, controlCenter, isTrustedSender): void`
  - `DesktopApi.detectionProposals.detect(projectId): Promise<ActionResult<DetectionProposalResult>>`
  - envelope 只允许 plain own property `projectId`。

- [ ] **Step 1: 写授权顺序、固定通道、strict envelope 与 clone-safe RED 测试**

创建 `register-detection-proposal-ipc.test.ts`：

```ts
type Handler = (event: IpcMainInvokeEvent, input: unknown) => unknown
const detectProjectConfiguration = vi.fn<ControlCenter['detectProjectConfiguration']>()
const controlCenter = { detectProjectConfiguration } as unknown as ControlCenter

function captureHandlers() {
  const handlers = new Map<string, Handler>()
  const ipc = { handle(channel: string, handler: Handler) { handlers.set(channel, handler) } } as Pick<IpcMain, 'handle'>
  return { handlers, ipc }
}

test('registers one fixed channel and forwards only projectId', async () => {
  const { handlers, ipc } = captureHandlers()
  detectProjectConfiguration.mockResolvedValue({ kind: 'none', reason: 'no-candidates' })
  registerDetectionProposalIpc(ipc, controlCenter, () => true)
  expect([...handlers.keys()]).toEqual(['detection-proposals:detect'])
  await expect(handlers.get('detection-proposals:detect')!({} as IpcMainInvokeEvent, { projectId: 'project-1' }))
    .resolves.toEqual({ ok: true, value: { kind: 'none', reason: 'no-candidates' } })
  expect(detectProjectConfiguration).toHaveBeenCalledWith('project-1')
})

test('rejects an untrusted sender before envelope inspection', async () => {
  const { handlers, ipc } = captureHandlers()
  registerDetectionProposalIpc(ipc, controlCenter, () => false)
  const hostile = Object.create({ projectId: 'inherited-project' })
  await expect(handlers.get('detection-proposals:detect')!({} as IpcMainInvokeEvent, hostile))
    .resolves.toMatchObject({ ok: false, error: { code: 'UNTRUSTED_IPC_SENDER' } })
  expect(detectProjectConfiguration).not.toHaveBeenCalled()
})

test('rejects a projectId inherited from Object.prototype', async () => {
  const { handlers, ipc } = captureHandlers()
  registerDetectionProposalIpc(ipc, controlCenter, () => true)
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'projectId')
  Object.defineProperty(Object.prototype, 'projectId', {
    configurable: true, value: 'inherited-project-id'
  })
  try {
    await expect(handlers.get('detection-proposals:detect')!({} as IpcMainInvokeEvent, {}))
      .resolves.toMatchObject({ ok: false, error: { code: 'INVALID_PROJECT_ID' } })
    expect(detectProjectConfiguration).not.toHaveBeenCalled()
  } finally {
    if (previous) Object.defineProperty(Object.prototype, 'projectId', previous)
    else delete (Object.prototype as { projectId?: string }).projectId
  }
})

test.each([
  [null, 'DETECTION_REQUEST_INVALID', '$'],
  [[], 'DETECTION_REQUEST_INVALID', '$'],
  [Object.create({ projectId: 'project-1' }), 'DETECTION_REQUEST_INVALID', '$'],
  [{}, 'INVALID_PROJECT_ID', undefined],
  [{ projectId: '' }, 'INVALID_PROJECT_ID', undefined],
  [{ projectId: 'project-1', rootPath: '/private' }, 'DETECTION_REQUEST_UNKNOWN_FIELD', '$.rootPath'],
  [{ projectId: 'project-1', command: 'npm run dev' }, 'DETECTION_REQUEST_UNKNOWN_FIELD', '$.command']
] as const)('rejects malformed detection envelope', async (input, code, fieldPath) => {
  const { handlers, ipc } = captureHandlers()
  registerDetectionProposalIpc(ipc, controlCenter, () => true)
  const result = await handlers.get('detection-proposals:detect')!({} as IpcMainInvokeEvent, input)
  expect(result).toMatchObject({ ok: false, error: { code } })
  if (fieldPath) expect(result).toHaveProperty('error.fieldPath', fieldPath)
  expect(detectProjectConfiguration).not.toHaveBeenCalled()
})
```

另加 proposal 成功结果 `structuredClone(result)` 不抛错、错误无 stack/source/body 的断言。

- [ ] **Step 2: 扩展能力白名单 RED 测试**

`e2e/app-shell.spec.ts` 的页面能力快照增加 `detectionProposalKeys`，期待：

```ts
expect(capabilities).toEqual({
  hasRequire: false,
  hasProcess: false,
  desktopKeys: ['detectionProposals', 'projectConfigurations', 'projects'],
  projectKeys: ['add', 'list', 'remove'],
  configurationKeys: ['create', 'preview'],
  detectionProposalKeys: ['detect']
})
```

Run:

```bash
pnpm test -- src/main/register-detection-proposal-ipc.test.ts
pnpm test:e2e -- e2e/app-shell.spec.ts
```

Expected: FAIL，注册函数和 Preload namespace 尚不存在。

- [ ] **Step 3: 实现授权优先的 strict envelope handler**

```ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { ControlCenter } from '../control-center/control-center'
import { invalidProjectId, packageJsonDetectionError } from '../control-center/errors'
import { authorizedResult } from './ipc-result'

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function requestFrom(value: unknown): { projectId: string } {
  if (!isRecord(value)) {
    throw packageJsonDetectionError('DETECTION_REQUEST_INVALID', '$',
      'The detection request has the wrong type.', 'Submit a project detection request from this application.')
  }
  if (!Object.hasOwn(value, 'projectId')) throw invalidProjectId()
  const unknown = Object.keys(value).find((key) => key !== 'projectId')
  if (unknown !== undefined) {
    throw packageJsonDetectionError('DETECTION_REQUEST_UNKNOWN_FIELD', `$.${unknown}`,
      'The detection request contains an unknown field.', 'Remove the unsupported request field.')
  }
  if (typeof value.projectId !== 'string' || value.projectId.trim().length === 0) {
    throw invalidProjectId()
  }
  return { projectId: value.projectId }
}
export function registerDetectionProposalIpc(
  ipc: Pick<IpcMain, 'handle'>,
  controlCenter: ControlCenter,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
): void {
  ipc.handle('detection-proposals:detect', (event, input: unknown) =>
    authorizedResult(event, isTrustedSender, 'project', async () => {
      const request = requestFrom(input)
      return controlCenter.detectProjectConfiguration(request.projectId)
    })
  )
}
```

- [ ] **Step 4: 扩展 DesktopApi、Preload、Main 组装与现有 fakes**

`DesktopApi` 增加：

```ts
detectionProposals: {
  detect(projectId: string): Promise<ActionResult<DetectionProposalResult>>
}
```

Preload 同级 namespace：

```ts
detectionProposals: {
  detect: (projectId: string) =>
    ipcRenderer.invoke('detection-proposals:detect', { projectId }) as
      ReturnType<DesktopApi['detectionProposals']['detect']>
}
```

`main/index.ts` 使用现有同一 `isTrustedSender` 注册 `registerDetectionProposalIpc`。所有 `DesktopApi` test fake 增加：

```ts
detectionProposals: {
  detect: async () => ({ ok: true, value: { kind: 'none', reason: 'no-candidates' } })
}
```

- [ ] **Step 5: 运行 GREEN、安全扫描并提交**

```bash
pnpm test -- src/main/register-detection-proposal-ipc.test.ts src/main/register-project-configuration-ipc.test.ts src/main/register-project-ipc.test.ts src/renderer/src/App.test.tsx src/renderer/src/ProjectConfigurationView.test.tsx
pnpm typecheck
pnpm test:e2e -- e2e/app-shell.spec.ts
rg -n "ipcRenderer|detection-proposals:|rootPath|readFile|command|execute" src/preload/index.ts src/main/register-detection-proposal-ipc.ts
git add src/main/register-detection-proposal-ipc.ts src/main/register-detection-proposal-ipc.test.ts src/main/index.ts src/preload/index.ts src/shared/contracts.ts src/renderer/src/App.test.tsx src/renderer/src/ProjectConfigurationView.test.tsx e2e/app-shell.spec.ts
git commit -m "feat: expose package detection intent"
```

Expected: tests/typecheck/E2E PASS；Preload 只有固定 detect/preview/create/list/add/remove 方法，没有 path/read/execute 或通用 invoke。

---

### Task 6: 构建可编辑、可删除、可拒绝的检测建议审核组件

**Files:**
- Create: `src/renderer/src/PackageJsonDetectionProposalView.tsx`
- Create: `src/renderer/src/PackageJsonDetectionProposalView.test.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: `PackageJsonDetectionProposal`、可复用 `ServiceConfigurationForm`、`controlIdForConfigurationField`、`DesktopApi.projectConfigurations.preview/create`、`ProjectConfigurationPreviewPanel`、`ConfigurationSuccess`。
- Produces: `PackageJsonDetectionProposalView({ desktop, project, proposal, onReject, onBack })`；candidate identity 始终用 `candidateId`，evidence 不可编辑，draft 可编辑/删除。

- [ ] **Step 1: 写证据、编辑、删除、拒绝无 mutation RED 测试**

测试文件先定义完整 fixture；候选顺序与纯 detector 的 code-unit 顺序一致：

```tsx
const project = {
  id: 'project-1', name: 'sample-project', rootPath: '/projects/sample-project', availability: 'available'
} satisfies Extract<ProjectSnapshot, { availability: 'available' }>
const proposal: PackageJsonDetectionProposal = { projectId: project.id, candidates: [
  { candidateId: 'package-json:0:dev', evidence: { kind: 'package_json', relativePath: 'package.json', scriptName: 'dev' },
    draft: { id: 'dev', program: 'npm', args: ['run', 'dev'], workingDirectory: '.', shell: false, envFiles: [], env: [] } },
  { candidateId: 'package-json:1:dev:api', evidence: { kind: 'package_json', relativePath: 'package.json', scriptName: 'dev:api' },
    draft: { id: 'dev-api', program: 'npm', args: ['run', 'dev:api'], workingDirectory: '.', shell: false, envFiles: [], env: [] } },
  { candidateId: 'package-json:2:watch', evidence: { kind: 'package_json', relativePath: 'package.json', scriptName: 'watch' },
    draft: { id: 'watch', program: 'npm', args: ['run', 'watch'], workingDirectory: '.', shell: false, envFiles: [], env: [] } }
] }
const preview = vi.fn<DesktopApi['projectConfigurations']['preview']>()
const create = vi.fn<DesktopApi['projectConfigurations']['create']>()
const detect = vi.fn<DesktopApi['detectionProposals']['detect']>()
const onReject = vi.fn()
const onBack = vi.fn()
const desktop: DesktopApi = {
  projects: { list: async () => ({ ok: true, value: [project] }), add: async () => ({ ok: true, value: null }), remove: async () => ({ ok: true, value: null }) },
  projectConfigurations: { preview, create }, detectionProposals: { detect }
}
function renderView() {
  return render(<PackageJsonDetectionProposalView desktop={desktop} project={project}
    proposal={proposal} onReject={onReject} onBack={onBack} />)
}

test('shows source evidence and keeps it attached after editing the service id', async () => {
  const user = userEvent.setup()
  render(<PackageJsonDetectionProposalView desktop={desktop} project={project}
    proposal={proposal} onReject={onReject} onBack={onBack} />)
  const devCard = screen.getByTestId('candidate-package-json:0:dev')
  expect(within(devCard).getByText('package.json → scripts.dev')).toBeVisible()
  expect(within(devCard).getByLabelText('Program')).toHaveValue('npm')
  expect(within(devCard).getByLabelText('Argument 1')).toHaveValue('run')
  expect(within(devCard).getByLabelText('Argument 2')).toHaveValue('dev')
  expect(within(devCard).getByLabelText('Working directory')).toHaveValue('.')
  await user.clear(within(devCard).getByLabelText('Service ID'))
  await user.type(within(devCard).getByLabelText('Service ID'), 'frontend')
  expect(within(devCard).getByText('package.json → scripts.dev')).toBeVisible()
})

test('removes one candidate, previews edited remaining services and invalidates the preview', async () => {
  preview.mockResolvedValue({ ok: true, value: { source: 'multi-service-preview' } })
  const user = userEvent.setup()
  renderView()
  await user.click(screen.getByRole('button', { name: 'Remove suggested service dev:api' }))
  const watchCard = screen.getByTestId('candidate-package-json:2:watch')
  await user.clear(within(watchCard).getByLabelText('Working directory'))
  await user.type(within(watchCard).getByLabelText('Working directory'), 'apps/web')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(preview).toHaveBeenCalledWith('project-1', { services: [
    expect.objectContaining({ id: 'dev' }),
    expect.objectContaining({ id: 'watch', workingDirectory: 'apps/web' })
  ] })
  await user.click(screen.getByRole('button', { name: 'Back to editing' }))
  const editedWatchCard = screen.getByTestId('candidate-package-json:2:watch')
  await user.type(within(editedWatchCard).getByLabelText('Program'), '-changed')
  expect(screen.queryByRole('button', { name: 'Create configuration' })).not.toBeInTheDocument()
})

test('rejects locally without previewing, creating or persisting a proposal', async () => {
  const user = userEvent.setup()
  renderView()
  await user.click(screen.getByRole('button', { name: 'Reject suggestions' }))
  expect(onReject).toHaveBeenCalledOnce()
  expect(preview).not.toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
  expect(detect).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 写空候选校验、竞态、防重复创建与错误焦点 RED 测试**

加入以下可观察测试；错误 fixture 都使用 `resource: { kind: 'project_configuration', projectId: 'project-1' }`：

```tsx
test('submits an empty services array to the shared validation boundary', async () => {
  preview.mockResolvedValue({ ok: false, error: {
    code: 'CONFIG_SERVICES_REQUIRED', resource: { kind: 'project_configuration', projectId: 'project-1' },
    fieldPath: '$.services', message: 'At least one service is required.', nextAction: 'Keep or add at least one service.'
  } })
  const user = userEvent.setup()
  renderView()
  for (const name of ['dev', 'dev:api', 'watch']) {
    await user.click(screen.getByRole('button', { name: `Remove suggested service ${name}` }))
  }
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(preview).toHaveBeenCalledWith('project-1', { services: [] })
  expect(await screen.findByRole('alert')).toHaveTextContent('At least one service is required.')
})

test('ignores an older preview and prevents duplicate creation', async () => {
  let resolveFirst!: (value: Awaited<ReturnType<typeof preview>>) => void
  preview.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
  preview.mockResolvedValueOnce({ ok: true, value: { source: 'new preview' } })
  let resolveCreate!: (value: Awaited<ReturnType<typeof create>>) => void
  create.mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve }))
  const user = userEvent.setup()
  renderView()
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  const firstProgram = within(screen.getByTestId('candidate-package-json:0:dev')).getByLabelText('Program')
  await user.type(firstProgram, '-new')
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(await screen.findByText('new preview')).toBeVisible()
  resolveFirst({ ok: true, value: { source: 'old preview' } })
  expect(screen.queryByText('old preview')).not.toBeInTheDocument()
  const createButton = screen.getByRole('button', { name: 'Create configuration' })
  await user.dblClick(createButton)
  expect(create).toHaveBeenCalledTimes(1)
  expect(createButton).toBeDisabled()
  resolveCreate({ ok: true, value: { relativePath: '.devcontrol.toml' } })
  expect(await screen.findByText('.devcontrol.toml created')).toBeVisible()
})

test('focuses an indexed service error and keeps a create failure in preview', async () => {
  preview.mockResolvedValue({ ok: false, error: {
    code: 'CONFIG_PROGRAM_REQUIRED', resource: { kind: 'project_configuration', projectId: 'project-1' },
    fieldPath: '$.services[1].program', message: 'A program is required.', nextAction: 'Enter a program.'
  } })
  const user = userEvent.setup()
  renderView()
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(within(screen.getByTestId('candidate-package-json:1:dev:api')).getByLabelText('Program')).toBeFocused()
  preview.mockResolvedValueOnce({ ok: true, value: { source: 'preview source' } })
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  create.mockResolvedValueOnce({ ok: false, error: {
    code: 'PROJECT_CONFIGURATION_ALREADY_EXISTS', resource: { kind: 'project_configuration', projectId: 'project-1' },
    message: 'The project configuration already exists and was not changed.', nextAction: 'Open it externally.'
  } })
  await user.click(screen.getByRole('button', { name: 'Create configuration' }))
  expect(await screen.findByRole('alert')).toBeFocused()
  expect(screen.getByText('preview source')).toBeVisible()
})

test.each([
  {
    fieldPath: '$.services[1].env[0].key',
    code: 'CONFIG_ENVIRONMENT_KEY_INVALID',
    patch: { env: [{ key: 'PORT', value: '' }] },
    label: 'Environment key 1'
  },
  {
    fieldPath: '$.services[1].macos.program',
    code: 'CONFIG_PROGRAM_REQUIRED',
    patch: { macos: { program: '', args: [], env: [] } },
    label: 'macOS Program'
  }
] as const)('focuses $fieldPath in the proposal form', async ({ fieldPath, code, patch, label }) => {
  preview.mockResolvedValue({ ok: false, error: {
    code, resource: { kind: 'project_configuration', projectId: 'project-1' },
    fieldPath, message: 'Fix this field.', nextAction: 'Correct the highlighted field.'
  } })
  const withIndexedField = structuredClone(proposal)
  Object.assign(withIndexedField.candidates[1]!.draft, patch)
  const user = userEvent.setup()
  render(<PackageJsonDetectionProposalView desktop={desktop} project={project}
    proposal={withIndexedField} onReject={onReject} onBack={onBack} />)
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(within(screen.getByTestId('candidate-package-json:1:dev:api')).getByLabelText(label)).toBeFocused()
})

test('falls back to the alert only when the field is unknown or not rendered', async () => {
  preview.mockResolvedValue({ ok: false, error: {
    code: 'CONFIG_PROGRAM_REQUIRED', resource: { kind: 'project_configuration', projectId: 'project-1' },
    fieldPath: '$.services[7].program', message: 'Fix this field.', nextAction: 'Correct the highlighted field.'
  } })
  const user = userEvent.setup()
  renderView()
  await user.click(screen.getByRole('button', { name: 'Preview configuration' }))
  expect(await screen.findByRole('alert')).toBeFocused()
})
```

Run: `pnpm test -- src/renderer/src/PackageJsonDetectionProposalView.test.tsx`

Expected: FAIL，审核组件尚不存在。

- [ ] **Step 3: 实现建议审核状态机和 candidate identity**

创建组件，核心状态与更新如下：

```tsx
type ProposalState =
  | { kind: 'editing'; candidates: PackageJsonDetectionCandidate[]; error?: ActionableError }
  | { kind: 'previewing'; candidates: PackageJsonDetectionCandidate[]; preview: ProjectConfigurationPreview; error?: ActionableError }
  | { kind: 'creating'; candidates: PackageJsonDetectionCandidate[]; preview: ProjectConfigurationPreview }
  | { kind: 'created'; result: ProjectConfigurationCreated }

const [state, setState] = useState<ProposalState>(() => ({
  kind: 'editing', candidates: structuredClone(proposal.candidates)
}))
const previewSequence = useRef(0)
const createInFlight = useRef(false)

function editCandidates(candidates: PackageJsonDetectionCandidate[]): void {
  previewSequence.current += 1
  setState({ kind: 'editing', candidates })
}
function editCandidate(candidateId: string, draft: DevelopmentServiceDraft): void {
  editCandidates(state.kind === 'created' ? [] : state.candidates.map((candidate) =>
    candidate.candidateId === candidateId ? { ...candidate, draft } : candidate
  ))
}
function removeCandidate(candidateId: string): void {
  if (state.kind === 'created') return
  editCandidates(state.candidates.filter((candidate) => candidate.candidateId !== candidateId))
}
async function previewConfiguration(): Promise<void> {
  if (state.kind !== 'editing') return
  const sequence = ++previewSequence.current
  const candidates = structuredClone(state.candidates)
  const result = await desktop.projectConfigurations.preview(project.id, {
    services: candidates.map((candidate) => candidate.draft)
  })
  if (sequence !== previewSequence.current) return
  setState(result.ok
    ? { kind: 'previewing', candidates, preview: result.value }
    : { kind: 'editing', candidates, error: result.error })
}
async function createConfiguration(): Promise<void> {
  if (state.kind !== 'previewing' || createInFlight.current) return
  createInFlight.current = true
  const snapshot = state
  setState({ kind: 'creating', candidates: snapshot.candidates, preview: snapshot.preview })
  try {
    const result = await desktop.projectConfigurations.create(project.id, {
      services: snapshot.candidates.map((candidate) => candidate.draft)
    })
    setState(result.ok ? { kind: 'created', result: result.value }
      : { ...snapshot, error: result.error })
  } finally { createInFlight.current = false }
}
```

editing render 必须以 `candidate.candidateId` 为 React key，并显示固定 evidence：

```tsx
<main className="app-shell configuration-page proposal-page">
<header className="app-header"><div><p className="eyebrow">Detection proposal</p>
  <h1>Review detected services</h1><p>{project.name}</p></div></header>
<form onSubmit={(event) => { event.preventDefault(); void previewConfiguration() }}>
  {state.candidates.map((candidate, index) => <article key={candidate.candidateId}
    data-testid={`candidate-${candidate.candidateId}`} className="proposal-candidate">
    <header>
      <h2>Suggested service {candidate.evidence.scriptName}</h2>
      <p>{candidate.evidence.relativePath} → scripts.{candidate.evidence.scriptName}</p>
      <button type="button" aria-label={`Remove suggested service ${candidate.evidence.scriptName}`}
        onClick={() => removeCandidate(candidate.candidateId)}>Remove suggestion</button>
    </header>
    <ServiceConfigurationForm service={candidate.draft} serviceIndex={index}
      error={state.error} onChange={(draft) => editCandidate(candidate.candidateId, draft)} />
  </article>)}
  <div className="configuration-actions">
    <button type="button" onClick={onReject}>Reject suggestions</button>
    <button type="submit" className="primary-action">Preview configuration</button>
  </div>
</form>
</main>
```

preview/create 复用 `ProjectConfigurationPreviewPanel`；created 复用 `ConfigurationSuccess` 并提供 `Back to projects`。手动页与建议页共用 Task 1 的完整 indexed fieldPath 映射，不执行路径表达式；只有映射未知或对应 control 未渲染时才聚焦 alert：

```tsx
import { controlIdForConfigurationField } from './configuration-field-focus'

function proposalControlFor(fieldPath: string | undefined): HTMLElement | null {
  const controlId = controlIdForConfigurationField(fieldPath)
  return controlId === undefined ? null : document.getElementById(controlId)
}
useEffect(() => {
  if (!stateError) return
  ;(proposalControlFor(stateError.fieldPath) ?? alertRef.current)?.focus()
}, [stateError])
```

- [ ] **Step 4: 增加审核列表响应式与可访问样式**

在 `styles.css` 增加候选边界和窄屏规则；按钮顺序为 Reject → Preview，删除按钮有候选 script name 的可访问名称：

```css
.proposal-list { display: grid; gap: 1.25rem; }
.proposal-candidate {
  min-width: 0;
  padding: 1rem;
  border: 1px solid light-dark(#dfe2e7, #343841);
  border-radius: 0.625rem;
}
.proposal-candidate > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.proposal-candidate header p { overflow-wrap: anywhere; }
@media (max-width: 48rem) {
  .proposal-candidate > header { flex-direction: column; }
}
```

- [ ] **Step 5: 运行 GREEN 并提交**

```bash
pnpm test -- src/renderer/src/PackageJsonDetectionProposalView.test.tsx src/renderer/src/ProjectConfigurationView.test.tsx
pnpm typecheck
git add src/renderer/src/PackageJsonDetectionProposalView.tsx src/renderer/src/PackageJsonDetectionProposalView.test.tsx src/renderer/src/styles.css
git commit -m "feat: review package detection proposals"
```

Expected: 组件测试/typecheck PASS；candidate evidence 在 ID 编辑后不漂移，拒绝没有 backend mutation，编辑/删除均使 preview 失效。

---

### Task 7: 注册后自动检测并处理 none、失败回退与陈旧结果

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.test.tsx`
- Modify: `src/renderer/src/ProjectListView.tsx`
- Modify: `src/renderer/src/styles.css`
- Create: `e2e/package-json-project-fixture.ts`
- Create: `e2e/package-json-detection.spec.ts`
- Modify: `e2e/ui-viewport.spec.ts`

**Interfaces:**
- Consumes: `DesktopApi.projects.add`、`DesktopApi.detectionProposals.detect`、`PackageJsonDetectionProposalView`、手动 `ProjectConfigurationView`。
- Produces: App 顶层 `list | detecting | detection-error | proposal | manual-configuration` 状态；成功注册立即按 ID 检测，none 回列表，错误保留注册并可手动配置；真实 Electron 对检测、拒绝、编辑、删除、确认和 script marker 不执行的验收。

- [ ] **Step 1: 写注册触发、三种 none 与 proposal 路由 RED 测试**

在 `App.test.tsx` 把 helper 扩展为注入 detection method，并复用 Task 6 的 `proposal` 数据：

```tsx
function createDesktopApi(
  project: ProjectSnapshot,
  initialProjects: ProjectSnapshot[] = [],
  detect: DesktopApi['detectionProposals']['detect'] = async () => ({
    ok: true, value: { kind: 'none', reason: 'no-candidates' }
  })
): DesktopApi {
  let projects = initialProjects
  return {
    projects: {
      list: async () => ({ ok: true, value: projects }),
      add: async () => { projects = [project]; return { ok: true, value: project } },
      remove: async () => { projects = []; return { ok: true, value: null } }
    },
    projectConfigurations: {
      preview: async () => ({ ok: true, value: { source: 'schema_version = 1\n' } }),
      create: async () => ({ ok: true, value: { relativePath: '.devcontrol.toml' } })
    },
    detectionProposals: { detect }
  }
}

test('detects immediately after registration and opens the proposal', async () => {
  let resolveDetect!: (value: Awaited<ReturnType<DesktopApi['detectionProposals']['detect']>>) => void
  const detect = vi.fn<DesktopApi['detectionProposals']['detect']>()
    .mockReturnValue(new Promise((resolve) => { resolveDetect = resolve }))
  const desktop = createDesktopApi(project, [], detect)
  const user = userEvent.setup()
  render(<App desktop={desktop} />)
  await user.click(screen.getByRole('button', { name: 'Add project' }))
  expect(await screen.findByText('Detecting project configuration…')).toBeVisible()
  expect(detect).toHaveBeenCalledWith(project.id)
  resolveDetect({ ok: true, value: { kind: 'proposal', proposal } })
  expect(await screen.findByRole('heading', { name: 'Review detected services' })).toBeVisible()
})

test.each(['configuration-exists', 'package-json-missing', 'no-candidates'] as const)(
  'returns to the registered project list for %s', async (reason) => {
    const detect = vi.fn().mockResolvedValue({ ok: true, value: { kind: 'none', reason } })
    const user = userEvent.setup()
    render(<App desktop={createDesktopApi(project, [], detect)} />)
    await user.click(screen.getByRole('button', { name: 'Add project' }))
    expect(await screen.findByRole('heading', { name: project.name })).toBeVisible()
    expect(screen.queryByText('Detecting project configuration…')).not.toBeInTheDocument()
  }
)
```

- [ ] **Step 2: 写检测失败保留注册、手动回退、拒绝与 race RED 测试**

```tsx
test('keeps registration and offers manual configuration after detection failure', async () => {
  const detect = vi.fn().mockResolvedValue({ ok: false, error: detectionError })
  const user = userEvent.setup()
  render(<App desktop={createDesktopApi(project, [], detect)} />)
  await user.click(screen.getByRole('button', { name: 'Add project' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(detectionError.message)
  expect(screen.getByText(project.name)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Configure manually' }))
  expect(await screen.findByText('Project configuration')).toBeVisible()
  expect(screen.getAllByLabelText('Service ID')).toHaveLength(1)
})

test('returns to the list when proposal is rejected without detecting again', async () => {
  const detect = vi.fn().mockResolvedValue({ ok: true, value: { kind: 'proposal', proposal } })
  const user = userEvent.setup()
  render(<App desktop={createDesktopApi(project, [], detect)} />)
  await user.click(screen.getByRole('button', { name: 'Add project' }))
  await user.click(await screen.findByRole('button', { name: 'Reject suggestions' }))
  expect(await screen.findByRole('heading', { name: project.name })).toBeVisible()
  expect(detect).toHaveBeenCalledTimes(1)
})

test('ignores detection completion after leaving the detecting view', async () => {
  let resolveDetect!: (value: Awaited<ReturnType<DesktopApi['detectionProposals']['detect']>>) => void
  const detect = vi.fn().mockReturnValue(new Promise((resolve) => { resolveDetect = resolve }))
  const user = userEvent.setup()
  render(<App desktop={createDesktopApi(project, [], detect)} />)
  await user.click(screen.getByRole('button', { name: 'Add project' }))
  await user.click(screen.getByRole('button', { name: 'Back to projects' }))
  resolveDetect({ ok: true, value: { kind: 'proposal', proposal } })
  expect(await screen.findByRole('heading', { name: project.name })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Review detected services' })).not.toBeInTheDocument()
})
```

Run: `pnpm test -- src/renderer/src/App.test.tsx`

Expected: FAIL，App 仍只把注册结果加入列表。

- [ ] **Step 3: 在产品接线前写最小真实 Electron RED 骨架**

先创建可复用 fixture `e2e/package-json-project-fixture.ts`：

```ts
import { _electron as electron, expect, type ElectronApplication, type TestInfo } from '@playwright/test'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function launchApp(userData: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['out/main/index.js'], env: { ...process.env, DCC_E2E_USER_DATA: userData }
  })
}
export async function launchSelectedProject(userData: string, projectRoot: string): Promise<ElectronApplication> {
  const app = await launchApp(userData)
  await app.evaluate(({ dialog }, selectedPath) => {
    Object.defineProperty(dialog, 'showOpenDialog', {
      configurable: true,
      value: async () => ({ canceled: false, filePaths: [selectedPath] })
    })
  }, projectRoot)
  return app
}
export async function createNodeProject(testInfo: TestInfo, name: string) {
  const projectRoot = testInfo.outputPath(name)
  const markers = [join(projectRoot, 'dev-executed.marker'), join(projectRoot, 'api-executed.marker'), join(projectRoot, 'watch-executed.marker')]
  await mkdir(projectRoot, { recursive: true })
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({
    packageManager: 'pnpm@10.17.1',
    scripts: {
      dev: `node -e "require('node:fs').writeFileSync('dev-executed.marker','ran')"`,
      'dev:api': `node -e "require('node:fs').writeFileSync('api-executed.marker','ran')"`,
      watch: `node -e "require('node:fs').writeFileSync('watch-executed.marker','ran')"`,
      test: 'ignored-body'
    }
  }), 'utf8')
  return { projectRoot, markers }
}
export async function expectMarkersAbsent(markers: readonly string[]): Promise<void> {
  for (const marker of markers) await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' })
}
```

同时创建一个实际可收集、会执行到产品缺口的 `e2e/package-json-detection.spec.ts`：

```ts
import { test, expect } from '@playwright/test'
import { createNodeProject, expectMarkersAbsent, launchSelectedProject } from './package-json-project-fixture'

test('opens a package proposal after registration without executing scripts', async ({}, testInfo) => {
  const { projectRoot, markers } = await createNodeProject(testInfo, 'red-project')
  const app = await launchSelectedProject(testInfo.outputPath('red-user-data'), projectRoot)
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Add project' }).click()
    await expectMarkersAbsent(markers)
    await expect(page.getByRole('heading', { name: 'Review detected services' })).toBeVisible()
    const dev = page.getByTestId('candidate-package-json:0:dev')
    await expect(dev.getByLabel('Program')).toHaveValue('pnpm')
    await expect(dev.getByLabel('Argument 1')).toHaveValue('run')
    await expect(dev.getByLabel('Argument 2')).toHaveValue('dev')
    await expect(dev.getByLabel('Working directory')).toHaveValue('.')
    await expect(dev.getByText('package.json → scripts.dev')).toBeVisible()
    await expectMarkersAbsent(markers)
  } finally { await app.close() }
})
```

Run:

```bash
pnpm build
pnpm test:e2e -- e2e/package-json-detection.spec.ts
```

Expected: Playwright 收集并运行 1 个真实测试，marker 断言 PASS，但 `Review detected services` 因 App 尚未接入自动检测而 FAIL；失败不得来自文件缺失、零测试、跳过或 grep 门禁。

- [ ] **Step 4: 实现顶层 view 联合与单调 detection sequence**

```tsx
type AvailableProject = Extract<ProjectSnapshot, { availability: 'available' }>
type AppView =
  | { kind: 'list' }
  | { kind: 'detecting'; project: AvailableProject; sequence: number }
  | { kind: 'detection-error'; project: AvailableProject; error: ActionableError }
  | { kind: 'proposal'; project: AvailableProject; proposal: PackageJsonDetectionProposal }
  | { kind: 'manual-configuration'; project: AvailableProject }

const [view, setView] = useState<AppView>({ kind: 'list' })
const detectionSequence = useRef(0)

function showProjectList(): void {
  detectionSequence.current += 1
  setView({ kind: 'list' })
}
async function detectAfterRegistration(project: AvailableProject): Promise<void> {
  const sequence = ++detectionSequence.current
  setView({ kind: 'detecting', project, sequence })
  const result = await desktop.detectionProposals.detect(project.id)
  if (sequence !== detectionSequence.current) return
  if (!result.ok) {
    setView({ kind: 'detection-error', project, error: result.error })
    return
  }
  setView(result.value.kind === 'proposal'
    ? { kind: 'proposal', project, proposal: result.value.proposal }
    : { kind: 'list' })
}
```

`addProject()` 先将成功注册 snapshot 放入 `projects`，清空项目 action error，再仅对 available snapshot 调用 `detectAfterRegistration`。它不撤销 Registry，也不自动打开手动配置。

- [ ] **Step 5: 渲染 detecting/error/proposal/manual 并保持 Configure 入口**

```tsx
if (view.kind === 'detecting') return <main className="app-shell detection-status">
  <h1>{view.project.name}</h1>
  <p role="status">Detecting project configuration…</p>
  <button type="button" onClick={showProjectList}>Back to projects</button>
</main>
if (view.kind === 'detection-error') return <main className="app-shell detection-status">
  <h1>{view.project.name}</h1>
  <section role="alert" tabIndex={-1}><strong>{view.error.message}</strong><span>{view.error.nextAction}</span></section>
  <div className="configuration-actions">
    <button type="button" onClick={showProjectList}>Back to projects</button>
    <button type="button" onClick={() => setView({ kind: 'manual-configuration', project: view.project })}>Configure manually</button>
  </div>
</main>
if (view.kind === 'proposal') return <PackageJsonDetectionProposalView
  desktop={desktop} project={view.project} proposal={view.proposal}
  onReject={showProjectList} onBack={showProjectList} />
if (view.kind === 'manual-configuration') return <ProjectConfigurationView
  desktop={desktop} project={view.project} onBack={showProjectList} />
```

`ProjectListView.onConfigure` 继续设置 `manual-configuration`，不得触发 detect；没有 manual redetect 按钮。detection error alert 在 render 后聚焦，`role=status` 不重复播报。

- [ ] **Step 6: 运行组件与最小 Electron GREEN 检查点**

```bash
pnpm test -- src/renderer/src/App.test.tsx src/renderer/src/PackageJsonDetectionProposalView.test.tsx src/renderer/src/ProjectConfigurationView.test.tsx src/renderer/src/ProjectListView.test.tsx
pnpm typecheck
pnpm build
pnpm test:e2e -- e2e/package-json-detection.spec.ts
```

Expected: Renderer tests/typecheck 与最小真实 Electron 测试 PASS；检测失败时项目仍在列表数据中，manual Configure 不重检，拒绝不重检，离开 detecting 后迟到结果不改变页面。此时不提交，继续完成同一可审查工作流的真实拒绝/确认/viewport 验收。

#### 完成 Task 7 的真实验收矩阵

`package-json-detection.spec.ts` 在 Step 3 的真实 RED 测试基础上继续导入 `launchApp`、`readFile`、`access`、`join` 与公开 `parseProjectConfiguration`；`ui-viewport.spec.ts` 只导入 `createNodeProject` 和 `launchSelectedProject`。目录选择仍由真实主进程 dialog seam 完成，不添加测试 IPC。

- [ ] **Step 7: 写真实检测与拒绝不写入/不执行验收**

```ts
test('detects and rejects package suggestions without writing or executing scripts', async ({}, testInfo) => {
  const { projectRoot, markers } = await createNodeProject(testInfo, 'reject-project')
  const userData = testInfo.outputPath('reject-user-data')
  let app = await launchSelectedProject(userData, projectRoot)
  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: 'Add project' }).click()
    await expect(page.getByRole('heading', { name: 'Review detected services' })).toBeVisible()
    await expect(page.getByText('package.json → scripts.dev')).toBeVisible()
    await expect(page.getByText('package.json → scripts.dev:api')).toBeVisible()
    await expect(page.getByText('package.json → scripts.watch')).toBeVisible()
    await expectMarkersAbsent(markers)
    await page.getByRole('button', { name: 'Reject suggestions' }).click()
    await expect(page.getByRole('heading', { name: 'reject-project' })).toBeVisible()
    await expect(access(join(projectRoot, '.devcontrol.toml'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expectMarkersAbsent(markers)
    await app.close()
    app = await launchApp(userData)
    page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'reject-project' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Review detected services' })).toBeHidden()
    await expectMarkersAbsent(markers)
  } finally { await app.close().catch(() => undefined) }
})
```

- [ ] **Step 8: 写真实编辑、删除、多服务预览与确认验收**

```ts
test('edits and confirms a parseable multi-service proposal without executing scripts', async ({}, testInfo) => {
  const { projectRoot, markers } = await createNodeProject(testInfo, 'confirm-project')
  const app = await launchSelectedProject(testInfo.outputPath('confirm-user-data'), projectRoot)
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Add project' }).click()
    const dev = page.getByTestId('candidate-package-json:0:dev')
    await dev.getByLabel('Service ID').fill('frontend')
    await dev.getByLabel('Working directory').fill('apps/web')
    await page.getByRole('button', { name: 'Remove suggested service dev:api' }).click()
    await page.getByRole('button', { name: 'Preview configuration' }).click()
    const preview = page.getByLabel('Project configuration preview')
    await expect(preview).toContainText('[services.frontend]')
    await expect(preview).toContainText('[services.watch]')
    await expect(preview).not.toContainText('[services.dev-api]')
    await expectMarkersAbsent(markers)
    await page.getByRole('button', { name: 'Create configuration' }).click()
    await expect(page.getByText('.devcontrol.toml created')).toBeVisible()
    const source = await readFile(join(projectRoot, '.devcontrol.toml'), 'utf8')
    expect(parseProjectConfiguration(source)).toEqual({ schemaVersion: 1, services: {
      frontend: { program: 'pnpm', args: ['run', 'dev'], workingDirectory: 'apps/web', shell: false, envFiles: [], env: {} },
      watch: { program: 'pnpm', args: ['run', 'watch'], workingDirectory: '.', shell: false, envFiles: [], env: {} }
    } })
    await expectMarkersAbsent(markers)
  } finally { await app.close() }
})
```

- [ ] **Step 9: 验证 760×520 键盘路径、dark theme 与无横向页面滚动**

在 `ui-viewport.spec.ts` 复用既有 `tabTo`、`contrastRatio`，加入实际场景：

```ts
for (const size of [{ width: 1100, height: 720 }, { width: 760, height: 520 }]) {
  test(`keeps package proposal keyboard-usable at ${size.width}x${size.height}`, async ({}, testInfo) => {
    const { projectRoot } = await createNodeProject(testInfo, `viewport-${size.width}`)
    const app = await launchSelectedProject(testInfo.outputPath(`user-data-${size.width}`), projectRoot)
    try {
      const page = await app.firstWindow()
      await app.evaluate(({ BrowserWindow }, viewport) => {
        BrowserWindow.getAllWindows()[0]!.setContentSize(viewport.width, viewport.height)
      }, size)
      const add = page.getByRole('button', { name: 'Add project' })
      await tabTo(page, add)
      await page.keyboard.press('Enter')
      const serviceId = page.getByTestId('candidate-package-json:0:dev').getByLabel('Service ID')
      await tabTo(page, serviceId)
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.type('frontend')
      const remove = page.getByRole('button', { name: 'Remove suggested service dev:api' })
      await tabTo(page, remove)
      await page.keyboard.press('Enter')
      const previewButton = page.getByRole('button', { name: 'Preview configuration' })
      await tabTo(page, previewButton)
      await page.keyboard.press('Enter')
      const previewPanel = page.getByLabel('Project configuration preview')
      await expect(previewPanel).toContainText('[services.frontend]')
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.emulateMedia({ colorScheme: 'dark' })
      const previewColors = await previewPanel.evaluate((element) => {
        const style = getComputedStyle(element)
        return { foreground: style.color, background: style.backgroundColor }
      })
      expect(contrastRatio(previewColors.foreground, previewColors.background)).toBeGreaterThanOrEqual(4.5)
      const createButton = page.getByRole('button', { name: 'Create configuration' })
      await tabTo(page, createButton)
      await expect(createButton).toBeFocused()
      expect(await createButton.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
      expect(await createButton.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none')
      await page.screenshot({ path: testInfo.outputPath(`package-proposal-${size.width}x${size.height}.png`) })
      await page.keyboard.press('Enter')
      await expect(page.getByText('.devcontrol.toml created')).toBeVisible()
    } finally { await app.close() }
  })
}
```

进入 preview 后旧的 `previewButton` 已卸载，所有断言都重新定位仍存在的 preview panel 与 create button；`contrastRatio` 实际接收 dark theme 的计算前景/背景色。截图只写 `testInfo.outputPath()`，逐张使用本地图片查看工具目视确认无遮挡、dark theme 可读且无横向页面滚动，不提交截图。

- [ ] **Step 10: 运行 GREEN 真实验收、全回归并提交 Task 7**

```bash
pnpm test:e2e -- e2e/package-json-detection.spec.ts e2e/app-shell.spec.ts e2e/ui-viewport.spec.ts
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
rg -n "child_process|spawn|execFile|exec\(|npm run|pnpm run|yarn run|bun run" src/control-center/package-json-detector.ts src/control-center/control-center.ts src/control-center/node-host-runtime.ts src/main/register-detection-proposal-ipc.ts src/preload/index.ts
git add src/renderer/src/App.tsx src/renderer/src/App.test.tsx src/renderer/src/ProjectListView.tsx src/renderer/src/styles.css e2e/package-json-project-fixture.ts e2e/package-json-detection.spec.ts e2e/ui-viewport.spec.ts
git commit -m "feat: complete package detection workflow"
```

Expected: 全部 PASS；marker 在每个观察点均不存在；静态扫描不显示检测链执行候选命令；真实配置含编辑后的两个服务且 parser 可读取。

---

### Task 8: 执行 exact-SHA 双平台 CI 与票据状态门禁

**Files:**
- Verify: `.github/workflows/ci.yml`
- Modify only after all gates pass: `.scratch/developer-control-center-mvp/issues/03-package-json-detection.md`

**Interfaces:**
- Consumes: Task 1–7 的所有提交、本地完整检查、GitHub Actions push run。
- Produces: exact implementation SHA 和 exact ticket-status SHA 的 `Verify (macos-14)`/`Verify (windows-2025)` 成功证据；票据 03 `ready-for-human`。

- [ ] **Step 1: 确认状态门禁仍为 RED**

```bash
set -euo pipefail
test "$(sed -n 's/^\*\*Status:\*\* //p' .scratch/developer-control-center-mvp/issues/03-package-json-detection.md)" = 'ready-for-agent'
test "$(rg -c '^- \[ \]' .scratch/developer-control-center-mvp/issues/03-package-json-detection.md)" = '7'
```

Expected: 命令 PASS，证明票据仍处于 RED 门禁：七项验收未勾选且没有提前转为 `ready-for-human`。若状态已经变化，停止并核对是否存在未经本计划验证的外部修改。

- [ ] **Step 2: 在推送前执行完整本地门禁与差异自检**

```bash
set -euo pipefail
pnpm check
git diff --check
git status --short
rg -n 'macos-14|windows-2025|pnpm install --frozen-lockfile|pnpm typecheck|pnpm test|pnpm build|pnpm test:e2e' .github/workflows/ci.yml
```

Expected: `pnpm check` 和 `git diff --check` PASS；CI 七项命中；没有未提交的产品改动、marker、Playwright screenshot、临时项目或 userData。

- [ ] **Step 3: 推送 implementation HEAD 并只接受 exact SHA 的双平台 run**

```bash
set -euo pipefail
dcc_detection_sha=$(git rev-parse HEAD)
dcc_detection_branch=$(git branch --show-current)
git push origin HEAD
dcc_detection_run=''
for dcc_detection_attempt in {1..30}; do
  dcc_detection_run=$(gh run list --branch "$dcc_detection_branch" --commit "$dcc_detection_sha" --event push --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  test -n "$dcc_detection_run" && break
  sleep 2
done
test -n "$dcc_detection_run"
test "$(gh run view "$dcc_detection_run" --json headSha --jq '.headSha')" = "$dcc_detection_sha"
gh run watch "$dcc_detection_run" --exit-status
test "$(gh run view "$dcc_detection_run" --json jobs --jq '[.jobs[] | select(.name == "Verify (macos-14)" and .conclusion == "success")] | length')" = '1'
test "$(gh run view "$dcc_detection_run" --json jobs --jq '[.jobs[] | select(.name == "Verify (windows-2025)" and .conclusion == "success")] | length')" = '1'
test "$(gh run view "$dcc_detection_run" --json jobs --jq '[.jobs[] | select(.conclusion != "success")] | length')" = '0'
```

Expected: run `headSha` 精确等于 implementation HEAD，两个固定 Job 各恰好成功一次。失败时保持票据 `ready-for-agent`，根据该 run 输出修复、重新执行 Task 7 全门禁并用新 SHA 重试。

- [ ] **Step 4: 仅在门禁成功后更新票据并单独提交**

勾选票据 03 的七项验收并把 `Status: ready-for-agent` 改为 `Status: ready-for-human`；不修改 spec、设计或其他票据：

```bash
git diff -- .scratch/developer-control-center-mvp/issues/03-package-json-detection.md
git add .scratch/developer-control-center-mvp/issues/03-package-json-detection.md
git commit -m "docs: mark package detection ready for review"
```

Expected: 该提交只包含票据 03 的七个 checkbox 与一个 Status 字段。

- [ ] **Step 5: 验证状态提交自己的 exact-SHA 双平台 CI 并转 GREEN**

```bash
set -euo pipefail
dcc_detection_status_sha=$(git rev-parse HEAD)
dcc_detection_branch=$(git branch --show-current)
git push origin HEAD
dcc_detection_status_run=''
for dcc_detection_status_attempt in {1..30}; do
  dcc_detection_status_run=$(gh run list --branch "$dcc_detection_branch" --commit "$dcc_detection_status_sha" --event push --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  test -n "$dcc_detection_status_run" && break
  sleep 2
done
test -n "$dcc_detection_status_run"
test "$(gh run view "$dcc_detection_status_run" --json headSha --jq '.headSha')" = "$dcc_detection_status_sha"
gh run watch "$dcc_detection_status_run" --exit-status
test "$(gh run view "$dcc_detection_status_run" --json jobs --jq '[.jobs[] | select(.name == "Verify (macos-14)" and .conclusion == "success")] | length')" = '1'
test "$(gh run view "$dcc_detection_status_run" --json jobs --jq '[.jobs[] | select(.name == "Verify (windows-2025)" and .conclusion == "success")] | length')" = '1'
pnpm check
git diff --check
git status --short
```

Expected: 状态 SHA 自身的两个 Job 成功，本地复验 PASS，工作树干净；票据 03 此时等待人工审查。

---

## Plan Self-Review Result

- [x] **Spec coverage:** Task 1 覆盖 canonical multi-service、手动一元素数组与共享完整错误焦点映射；Task 2 覆盖纯 detector、候选规则、manager、ID 与 script-body 边界；Task 3 覆盖 fixed path/config-first/contained resolved-target 读取及静态 symlink 威胁边界；Task 4 覆盖 Control Center/错误/注册存活；Task 5 覆盖 own-property 固定 IPC/Preload；Task 6 覆盖审核、初值展示、拒绝和完整错误聚焦；Task 7 覆盖失败回退、竞态、真实 Electron marker 与 viewport；Task 8 覆盖 exact-SHA CI/状态门禁。未发现规格缺口。
- [x] **Placeholder scan:** 已按 writing-plans 的禁止占位表达检查全文，结果为零命中。
- [x] **Type consistency:** `ProjectConfigurationDraft.services`、`PackageJsonDetection*`、`DetectionProposalResult`、`inspectPackageJsonDetection`、`detectProjectConfiguration`、`detectionProposals.detect` 与 `detection-proposals:detect` 在全部任务中拼写和返回类型一致。
- [x] **Field/error consistency:** 草稿只用 `$.services[index].*`；parser 保留 `$.services.<id>.*`；manifest 使用 `$`/`$.scripts`/`$.scripts["name"]`；固定错误 code 不在后续任务改名。
- [x] **Shared-file sequencing:** `contracts.ts` 依次由 Task 1 canonical draft、Task 2 proposal types、Task 5 Desktop API 修改；`errors.ts` 依次由 Task 2 detector errors、Task 3 I/O errors、Task 4 binding 修改；`configuration-field-focus.ts` 与 `ServiceConfigurationForm.tsx` 由 Task 1 建立后由手动页和 Task 6 建议页共同消费；`control-center.test.ts` 在 Task 1 迁移 fixture、Task 3 调整 Host Runtime mock、Task 4 验证 orchestration；`App.test.tsx`/`ProjectConfigurationView.test.tsx` 按 Task 1 draft → Task 5 Desktop fake → Task 7 workflow 顺序演进；`styles.css` 与 `ui-viewport.spec.ts` 先保住 Task 1 手动流，再由 Task 6/7 添加建议流。全部共享文件按任务依赖串行，没有要求并行落地的相冲突接口。
- [x] **Scope scan:** Docker Compose、monorepo、manual redetect、proposal persistence 与 runtime execution 只出现在明确禁止项或安全断言，没有实现步骤。
- [x] **Patch hygiene:** 计划提交前只暂存本计划文件，并以 `git diff --cached --check` 验证 Markdown patch。
