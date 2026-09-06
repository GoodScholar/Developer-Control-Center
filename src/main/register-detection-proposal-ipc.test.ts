import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ControlCenter } from '../control-center/control-center'
import { registerDetectionProposalIpc } from './register-detection-proposal-ipc'

type Handler = (event: IpcMainInvokeEvent, input: unknown) => unknown

const detectProjectConfiguration = vi.fn<ControlCenter['detectProjectConfiguration']>()
const controlCenter = { detectProjectConfiguration } as unknown as ControlCenter

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

test('returns clone-safe proposals', async () => {
  const { handlers, ipc } = captureHandlers()
  detectProjectConfiguration.mockResolvedValue({
    kind: 'proposal',
    proposal: {
      projectId: 'project-1',
      candidates: [{
        candidateId: 'script:dev',
        evidence: { kind: 'package_json', relativePath: 'package.json', scriptName: 'dev' },
        draft: { id: 'dev', program: 'pnpm', args: ['dev'], workingDirectory: '.', shell: false, envFiles: [], env: [] }
      }]
    }
  })
  registerDetectionProposalIpc(ipc, controlCenter, () => true)

  const result = await handlers.get('detection-proposals:detect')!({} as IpcMainInvokeEvent, { projectId: 'project-1' })
  expect(() => structuredClone(result)).not.toThrow()
})

test('redacts unknown errors without stack, source, or body', async () => {
  const { handlers, ipc } = captureHandlers()
  detectProjectConfiguration.mockRejectedValue(new Error('secret source body /private/project'))
  registerDetectionProposalIpc(ipc, controlCenter, () => true)

  const result = await handlers.get('detection-proposals:detect')!({} as IpcMainInvokeEvent, { projectId: 'project-1' })
  expect(result).toEqual({
    ok: false,
    error: {
      code: 'UNEXPECTED_ERROR',
      resource: { kind: 'project' },
      message: 'The project action could not be completed.',
      nextAction: 'Try again. If the problem continues, restart the application.'
    }
  })
  expect(result).not.toHaveProperty('error.stack')
  expect(result).not.toHaveProperty('error.source')
  expect(result).not.toHaveProperty('error.body')
  expect(JSON.stringify(result)).not.toMatch(/secret|private/)
})
