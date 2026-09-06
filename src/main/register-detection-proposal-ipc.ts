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
    throw packageJsonDetectionError(
      'DETECTION_REQUEST_INVALID',
      '$',
      'The detection request has the wrong type.',
      'Submit a project detection request from this application.'
    )
  }
  if (!Object.hasOwn(value, 'projectId')) throw invalidProjectId()
  const unknown = Object.keys(value).find((key) => key !== 'projectId')
  if (unknown !== undefined) {
    throw packageJsonDetectionError(
      'DETECTION_REQUEST_UNKNOWN_FIELD',
      `$.${unknown}`,
      'The detection request contains an unknown field.',
      'Remove the unsupported request field.'
    )
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
