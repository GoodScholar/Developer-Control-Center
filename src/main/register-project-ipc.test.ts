import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ControlCenter } from '../control-center/control-center'
import { projectDirectoryUnavailable } from '../control-center/errors'
import type { ProjectSnapshot } from '../shared/contracts'
import type { ProjectDirectoryPicker } from './project-directory-picker'
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
const chooseProjectDirectory = vi.fn<ProjectDirectoryPicker['chooseProjectDirectory']>()
const picker: ProjectDirectoryPicker = { chooseProjectDirectory }
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
  chooseProjectDirectory.mockResolvedValue(null)

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

test('registers the directory chosen by the main process', async () => {
  const project: ProjectSnapshot = {
    id: 'project-1',
    name: 'sample-project',
    rootPath: '/projects/sample-project',
    availability: 'available'
  }
  const { handlers, ipc } = captureHandlers()
  chooseProjectDirectory.mockResolvedValue('/projects/sample-project')
  registerProject.mockResolvedValue(project)

  registerProjectIpc(ipc, controlCenter, picker, () => true)

  await expect(handlers.get('projects:add')!(trustedEvent)).resolves.toEqual({
    ok: true,
    value: project
  })
  expect(registerProject).toHaveBeenCalledWith('/projects/sample-project')
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

test.each([
  ['projects:list', []],
  ['projects:add', []],
  ['projects:remove', ['project-1']]
] as const)('preserves the legacy untrusted sender result for %s', async (channel, args) => {
  const { handlers, ipc } = captureHandlers()
  registerProjectIpc(ipc, controlCenter, picker, () => false)

  await expect(handlers.get(channel)!(untrustedEvent, ...args)).resolves.toEqual({
    ok: false,
    error: {
      code: 'UNTRUSTED_IPC_SENDER',
      resource: { kind: 'application' },
      message: 'The project request was rejected.',
      nextAction: 'Use the Developer Control Center window and try again.'
    }
  })
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

test('serializes unexpected errors without internal details', async () => {
  const { handlers, ipc } = captureHandlers()
  listProjects.mockRejectedValue(new Error('database path and stack must stay private'))

  registerProjectIpc(ipc, controlCenter, picker, () => true)
  const result = await handlers.get('projects:list')!(trustedEvent)

  expect(result).toEqual({
    ok: false,
    error: {
      code: 'UNEXPECTED_ERROR',
      resource: { kind: 'project' },
      message: 'The project action could not be completed.',
      nextAction: 'Try again. If the problem continues, restart the application.'
    }
  })
  expect(JSON.stringify(result)).not.toContain('database path')
  expect(JSON.stringify(result)).not.toContain('stack')
})

test('rejects an empty project id without unregistering', async () => {
  const { handlers, ipc } = captureHandlers()

  registerProjectIpc(ipc, controlCenter, picker, () => true)

  await expect(handlers.get('projects:remove')!(trustedEvent, '')).resolves.toMatchObject({
    ok: false,
    error: { code: 'INVALID_PROJECT_ID' }
  })
  expect(unregisterProject).not.toHaveBeenCalled()
})
