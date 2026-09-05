import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { ControlCenter } from '../control-center/control-center'
import { ControlCenterError, invalidProjectId } from '../control-center/errors'
import type { ActionableError, ActionResult } from '../shared/contracts'
import type { ProjectDirectoryPicker } from './project-directory-picker'

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

  ipc.handle('projects:list', (event) =>
    authorized(event, () => controlCenter.listProjects())
  )
  ipc.handle('projects:add', (event) =>
    authorized(event, async () => {
      const rootPath = await picker.chooseProjectDirectory()
      return rootPath === null ? null : controlCenter.registerProject(rootPath)
    })
  )
  ipc.handle('projects:remove', (event, projectId: unknown) =>
    authorized(event, async () => {
      if (typeof projectId !== 'string' || projectId.length === 0) {
        throw invalidProjectId()
      }
      await controlCenter.unregisterProject(projectId)
      return null
    })
  )
}
