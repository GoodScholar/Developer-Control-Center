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
