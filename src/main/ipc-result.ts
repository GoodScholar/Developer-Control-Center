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

function untrustedIpcSender(resourceKind: ResourceKind): ActionableError {
  return {
    code: 'UNTRUSTED_IPC_SENDER',
    resource: { kind: 'application' },
    message: resourceKind === 'project'
      ? 'The project request was rejected.'
      : 'The request was rejected.',
    nextAction: 'Use the Developer Control Center window and try again.'
  }
}

export async function authorizedResult<T>(
  event: IpcMainInvokeEvent,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  resourceKind: ResourceKind,
  action: () => Promise<T>
): Promise<ActionResult<T>> {
  if (!isTrustedSender(event)) return { ok: false, error: untrustedIpcSender(resourceKind) }
  try {
    return { ok: true, value: await action() }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ControlCenterError ? error.detail : unexpectedError(resourceKind)
    }
  }
}
