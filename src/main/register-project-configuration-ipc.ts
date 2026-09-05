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
    throw configurationError(
      'CONFIG_FIELD_TYPE_INVALID',
      '$',
      'The configuration request has the wrong type.',
      'Submit a structured configuration request.'
    )
  }
  const unknown = Object.keys(value).find((key) => key !== 'projectId' && key !== 'draft')
  if (unknown !== undefined) {
    throw configurationError(
      'CONFIG_UNKNOWN_FIELD',
      `$.${unknown}`,
      'The configuration request contains an unknown field.',
      'Remove the unsupported request field.'
    )
  }
  if (typeof value.projectId !== 'string' || value.projectId.trim().length === 0) {
    throw invalidProjectId()
  }
  if (!isRecord(value.draft)) {
    throw configurationError(
      'CONFIG_FIELD_TYPE_INVALID',
      '$.draft',
      'The configuration draft has the wrong type.',
      'Submit a structured configuration draft.'
    )
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
