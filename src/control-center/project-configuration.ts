import { stringify } from 'smol-toml'
import type {
  DevelopmentServiceConfiguration,
  EnvironmentVariableDraft,
  PlatformOverride,
  PlatformOverrideDraft,
  ProjectConfigurationDraft,
  ProjectConfigurationPreview,
  ProjectConfigurationV1
} from '../shared/contracts'
import { configurationError } from './errors'

const serviceIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const environmentKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function fail(code: string, fieldPath: string, message: string, nextAction: string): never {
  throw configurationError(code, fieldPath, message, nextAction)
}

function environmentFromRows(
  rows: readonly EnvironmentVariableDraft[],
  fieldPath: string
): Readonly<Record<string, string>> {
  const values = new Map<string, string>()
  rows.forEach((row, index) => {
    if (!environmentKeyPattern.test(row.key)) {
      fail(
        'CONFIG_ENVIRONMENT_KEY_INVALID',
        `${fieldPath}[${index}].key`,
        'The environment variable name is invalid.',
        'Use letters, numbers, and underscores, beginning with a letter or underscore.'
      )
    }
    if (values.has(row.key)) {
      fail(
        'CONFIG_ENVIRONMENT_KEY_DUPLICATE',
        `${fieldPath}[${index}].key`,
        'The environment variable name is duplicated.',
        'Keep one row for this environment variable.'
      )
    }
    values.set(row.key, row.value)
  })
  return Object.fromEntries(
    [...values].sort(([left], [right]) => compareCodeUnits(left, right))
  )
}

function overrideFromDraft(
  draft: PlatformOverrideDraft | undefined,
  fieldPath: string
): PlatformOverride | undefined {
  if (draft === undefined) return undefined
  const result: PlatformOverride = {
    ...(draft.program === undefined ? {} : { program: draft.program.trim() }),
    ...(draft.args === undefined ? {} : { args: [...draft.args] }),
    ...(draft.env === undefined
      ? {}
      : { env: environmentFromRows(draft.env, `${fieldPath}.env`) })
  }
  if (Object.keys(result).length === 0) {
    fail(
      'CONFIG_PLATFORM_OVERRIDE_EMPTY',
      fieldPath,
      'The platform override is empty.',
      'Remove the override or enter a platform-specific difference.'
    )
  }
  return result
}

function configurationFromDraft(draft: ProjectConfigurationDraft): ProjectConfigurationV1 {
  const { service } = draft
  if (!serviceIdPattern.test(service.id) || service.id.length > 64) {
    fail(
      'CONFIG_SERVICE_ID_INVALID',
      '$.service.id',
      'The service identifier is invalid.',
      'Use 1-64 lowercase letters, numbers, and single hyphen-separated segments.'
    )
  }
  const program = service.program.trim()
  if (program.length === 0) {
    fail(
      'CONFIG_PROGRAM_REQUIRED',
      '$.service.program',
      'A program is required.',
      'Enter an executable name or project-relative program path.'
    )
  }
  const normalized: DevelopmentServiceConfiguration = {
    program,
    args: [...service.args],
    workingDirectory: service.workingDirectory,
    shell: service.shell,
    envFiles: [...service.envFiles],
    env: environmentFromRows(service.env, '$.service.env'),
    ...(service.macos === undefined
      ? {}
      : { macos: overrideFromDraft(service.macos, '$.service.macos')! }),
    ...(service.windows === undefined
      ? {}
      : { windows: overrideFromDraft(service.windows, '$.service.windows')! })
  }
  return { schemaVersion: 1, services: { [service.id]: normalized } }
}

function platformDocument(override: PlatformOverride): Record<string, unknown> {
  return {
    ...(override.program === undefined ? {} : { program: override.program }),
    ...(override.args === undefined ? {} : { args: [...override.args] }),
    ...(override.env === undefined ? {} : { env: override.env })
  }
}

function serviceDocument(service: DevelopmentServiceConfiguration): Record<string, unknown> {
  return {
    program: service.program,
    args: [...service.args],
    working_directory: service.workingDirectory,
    shell: service.shell,
    env_files: [...service.envFiles],
    env: service.env,
    ...(service.macos === undefined ? {} : { macos: platformDocument(service.macos) }),
    ...(service.windows === undefined
      ? {}
      : { windows: platformDocument(service.windows) })
  }
}

function serialize(configuration: ProjectConfigurationV1): string {
  const services = Object.fromEntries(
    Object.entries(configuration.services)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([id, service]) => [id, serviceDocument(service)])
  )
  return `${stringify({ schema_version: 1n, services })
    .replace(/\r\n/g, '\n')
    .replace(/\n+$/, '')}\n`
}

export function buildProjectConfigurationPreview(
  draft: ProjectConfigurationDraft
): ProjectConfigurationPreview {
  return { source: serialize(configurationFromDraft(draft)) }
}
