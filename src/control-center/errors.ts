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

export function projectNotFound(projectId: string): ControlCenterError {
  return new ControlCenterError({
    code: 'PROJECT_NOT_FOUND',
    resource: { kind: 'project', id: projectId },
    message: 'The registered project could not be found.',
    nextAction: 'Return to the project list and refresh it.'
  })
}

export function configurationError(
  code: string,
  fieldPath: string | undefined,
  message: string,
  nextAction: string,
  projectId?: string
): ControlCenterError {
  return new ControlCenterError({
    code,
    resource: projectId
      ? { kind: 'project_configuration', projectId }
      : { kind: 'project_configuration' },
    ...(fieldPath === undefined ? {} : { fieldPath }),
    message,
    nextAction
  })
}

export function projectConfigurationAlreadyExists(projectId?: string): ControlCenterError {
  return configurationError(
    'PROJECT_CONFIGURATION_ALREADY_EXISTS',
    undefined,
    'The project configuration already exists and was not changed.',
    'Open .devcontrol.toml in an external editor to review or change it.',
    projectId
  )
}

export function withProjectId(error: ControlCenterError, projectId: string): ControlCenterError {
  if (error.detail.resource.kind === 'project_configuration') {
    return new ControlCenterError({
      ...error.detail,
      resource: { kind: 'project_configuration', projectId }
    })
  }
  if (error.detail.code === 'PROJECT_DIRECTORY_UNAVAILABLE') {
    return new ControlCenterError({
      ...error.detail,
      resource: { kind: 'project', id: projectId }
    })
  }
  return error
}
