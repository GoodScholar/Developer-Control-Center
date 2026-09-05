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
