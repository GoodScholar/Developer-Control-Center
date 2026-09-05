import { parse as parseToml, stringify } from 'smol-toml'
import type {
  DevelopmentServiceConfiguration, PlatformOverride, ProjectConfigurationDraft,
  ProjectConfigurationPreview, ProjectConfigurationV1
} from '../shared/contracts'
import { configurationError } from './errors'

type UnknownRecord = Record<string, unknown>

const serviceIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const environmentKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/
const topLevelFields = new Set(['schema_version', 'services'])
const serviceFields = new Set(['program', 'args', 'working_directory', 'shell', 'env_files', 'env', 'macos', 'windows'])
const overrideFields = new Set(['program', 'args', 'env'])
const draftFields = new Set(['service'])
const draftServiceFields = new Set(['id', 'program', 'args', 'workingDirectory', 'shell', 'envFiles', 'env', 'macos', 'windows'])
const environmentRowFields = new Set(['key', 'value'])
const absolutePathPatterns = [/^\//, /^[A-Za-z]:/, /^\\\\/, /^\/\//, /^~/, /^[A-Za-z][A-Za-z0-9+.-]*:\/\//]

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
function fail(code: string, fieldPath: string, message: string, nextAction: string): never {
  throw configurationError(code, fieldPath, message, nextAction)
}
function isRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function field(base: string, key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`
}
function isValidServiceId(id: string): boolean {
  return id.length <= 64 && serviceIdPattern.test(id)
}
function serviceFieldPath(id: string): string {
  return isValidServiceId(id) ? `$.services.${id}` : `$.services[${JSON.stringify(id)}]`
}
function rejectUnknown(record: UnknownRecord, allowed: ReadonlySet<string>, base: string): void {
  const unknown = Object.keys(record).find((key) => !allowed.has(key))
  if (unknown !== undefined) fail('CONFIG_UNKNOWN_FIELD', field(base, unknown), 'The project configuration contains an unknown field.', 'Remove the field or correct its spelling.')
}
function assertString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string') fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The field has the wrong type.', 'Enter a string value.')
  return value
}
function assertStringArray(value: unknown, fieldPath: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The field has the wrong type.', 'Enter a list of strings.')
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail('CONFIG_FIELD_TYPE_INVALID', `${fieldPath}[${index}]`, 'The field has the wrong type.', 'Enter a list of strings.')
  }
  value.forEach((item, index) => {
    if (item.includes('\0')) fail('CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', `${fieldPath}[${index}]`, 'The string contains a disallowed control character.', 'Remove the control character and try again.')
  })
  return [...value]
}
function validatePortablePath(value: unknown, fieldPath: string, allowDot: boolean): string {
  const path = assertString(value, fieldPath)
  if (absolutePathPatterns.some((pattern) => pattern.test(path))) fail('CONFIG_PATH_ABSOLUTE', fieldPath, 'The path must be project-relative.', 'Use a path relative to the project root.')
  if (path.split('/').includes('..')) fail('CONFIG_PATH_OUTSIDE_PROJECT', fieldPath, 'The path leaves the project root.', 'Choose a path inside the project root.')
  if (path.includes('\\') || path.includes('\0') || path.includes('\r') || path.includes('\n') || path.length === 0 || path.startsWith('/') || path.endsWith('/') || path.includes('//') || (!allowDot && path === '.') || path.split('/').some((segment) => segment === '' || segment === '.')) {
    if (allowDot && path === '.') return path
    fail('CONFIG_PATH_INVALID', fieldPath, 'The path is not portable.', 'Use a normalized project-relative path with / separators.')
  }
  return path
}
function validateProgram(value: unknown, fieldPath: string): string {
  if (value === undefined) fail('CONFIG_PROGRAM_REQUIRED', fieldPath, 'A program is required.', 'Enter an executable name or project-relative program path.')
  const rawProgram = assertString(value, fieldPath)
  if (/[\0\r\n]/.test(rawProgram)) fail('CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', fieldPath, 'The program contains a disallowed control character.', 'Remove the control character and try again.')
  const program = rawProgram.trim()
  if (program.length === 0) fail('CONFIG_PROGRAM_REQUIRED', fieldPath, 'A program is required.', 'Enter an executable name or project-relative program path.')
  return program.includes('/') || program.includes('\\') || absolutePathPatterns.some((pattern) => pattern.test(program))
    ? validatePortablePath(program, fieldPath, false) : program
}
function normalizeEnvironmentRecord(value: unknown, fieldPath: string): Readonly<Record<string, string>> {
  if (value === undefined) return {}
  if (!isRecord(value)) fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The environment table has the wrong type.', 'Use string environment values.')
  const normalized: Array<[string, string]> = []
  for (const key of Object.keys(value).sort()) {
    if (!environmentKeyPattern.test(key)) fail('CONFIG_ENVIRONMENT_KEY_INVALID', field(fieldPath, key), 'The environment variable name is invalid.', 'Use a portable environment variable name.')
    const environmentValue = value[key]
    if (typeof environmentValue !== 'string') fail('CONFIG_FIELD_TYPE_INVALID', field(fieldPath, key), 'The environment value has the wrong type.', 'Use a string environment value.')
    if (environmentValue.includes('\0')) fail('CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', field(fieldPath, key), 'The environment value contains a disallowed control character.', 'Remove the control character and try again.')
    normalized.push([key, environmentValue])
  }
  return Object.fromEntries(normalized)
}
function normalizeEnvFiles(value: unknown, fieldPath: string): readonly string[] {
  if (value === undefined) return []
  const files = assertStringArray(value, fieldPath).map((item, index) => validatePortablePath(item, `${fieldPath}[${index}]`, false))
  const seen = new Set<string>()
  files.forEach((item, index) => {
    if (seen.has(item)) fail('CONFIG_ENV_FILE_DUPLICATE', `${fieldPath}[${index}]`, 'The environment file is duplicated.', 'Remove the duplicate environment file.')
    seen.add(item)
  })
  return files
}
function normalizeParsedOverride(value: unknown, fieldPath: string): PlatformOverride | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The platform override has the wrong type.', 'Use a platform override table.')
  const invalid = Object.keys(value).find((key) => !overrideFields.has(key))
  if (invalid !== undefined) fail('CONFIG_PLATFORM_OVERRIDE_FIELD_INVALID', field(fieldPath, invalid), 'The platform override field is not allowed.', 'Move the field to the shared service table.')
  if (Object.keys(value).length === 0) fail('CONFIG_PLATFORM_OVERRIDE_EMPTY', fieldPath, 'The platform override is empty.', 'Remove the override or enter a platform-specific difference.')
  return {
    ...(value.program === undefined ? {} : { program: validateProgram(value.program, `${fieldPath}.program`) }),
    ...(value.args === undefined ? {} : { args: assertStringArray(value.args, `${fieldPath}.args`) }),
    ...(value.env === undefined ? {} : { env: normalizeEnvironmentRecord(value.env, `${fieldPath}.env`) })
  }
}
function normalizeParsedService(record: UnknownRecord, servicePath: string): DevelopmentServiceConfiguration {
  rejectUnknown(record, serviceFields, servicePath)
  return {
    program: validateProgram(record.program, `${servicePath}.program`),
    args: record.args === undefined ? [] : assertStringArray(record.args, `${servicePath}.args`),
    workingDirectory: record.working_directory === undefined ? '.' : validatePortablePath(record.working_directory, `${servicePath}.working_directory`, true),
    shell: record.shell === undefined ? false : typeof record.shell === 'boolean' ? record.shell : fail('CONFIG_FIELD_TYPE_INVALID', `${servicePath}.shell`, 'Shell must be a boolean.', 'Use true or false.'),
    envFiles: normalizeEnvFiles(record.env_files, `${servicePath}.env_files`),
    env: normalizeEnvironmentRecord(record.env, `${servicePath}.env`),
    ...(record.macos === undefined ? {} : { macos: normalizeParsedOverride(record.macos, `${servicePath}.macos`)! }),
    ...(record.windows === undefined ? {} : { windows: normalizeParsedOverride(record.windows, `${servicePath}.windows`)! })
  }
}
function normalizeEnvironmentRows(value: unknown, fieldPath: string): Readonly<Record<string, string>> {
  if (!Array.isArray(value)) fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The environment rows have the wrong type.', 'Enter environment key and value rows.')
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail('CONFIG_FIELD_TYPE_INVALID', `${fieldPath}[${index}]`, 'The environment row has the wrong type.', 'Enter an environment key and value.')
  }
  const entries = new Map<string, string>()
  value.forEach((candidate, index) => {
    const rowPath = `${fieldPath}[${index}]`
    if (!isRecord(candidate)) fail('CONFIG_FIELD_TYPE_INVALID', rowPath, 'The environment row has the wrong type.', 'Enter an environment key and value.')
    rejectUnknown(candidate, environmentRowFields, rowPath)
    const key = assertString(candidate.key, `${rowPath}.key`)
    const environmentValue = assertString(candidate.value, `${rowPath}.value`)
    if (!environmentKeyPattern.test(key)) fail('CONFIG_ENVIRONMENT_KEY_INVALID', `${rowPath}.key`, 'The environment variable name is invalid.', 'Use a portable environment variable name.')
    if (environmentValue.includes('\0')) fail('CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', `${rowPath}.value`, 'The environment value contains a disallowed control character.', 'Remove the control character and try again.')
    if (entries.has(key)) fail('CONFIG_ENVIRONMENT_KEY_DUPLICATE', `${rowPath}.key`, 'The environment variable name is duplicated.', 'Keep one row for this environment variable.')
    entries.set(key, environmentValue)
  })
  return Object.fromEntries([...entries].sort(([left], [right]) => compareCodeUnits(left, right)))
}
function normalizeDraftOverride(value: unknown, fieldPath: string): PlatformOverride | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) fail('CONFIG_FIELD_TYPE_INVALID', fieldPath, 'The platform override has the wrong type.', 'Use a platform override object.')
  const invalid = Object.keys(value).find((key) => !overrideFields.has(key))
  if (invalid !== undefined) fail('CONFIG_PLATFORM_OVERRIDE_FIELD_INVALID', field(fieldPath, invalid), 'The platform override field is not allowed.', 'Move the field to the shared service settings.')
  if (Object.keys(value).length === 0) fail('CONFIG_PLATFORM_OVERRIDE_EMPTY', fieldPath, 'The platform override is empty.', 'Remove the override or enter a platform-specific difference.')
  return {
    ...(Object.hasOwn(value, 'program') ? { program: validateProgram(value.program, `${fieldPath}.program`) } : {}),
    ...(Object.hasOwn(value, 'args') ? { args: assertStringArray(value.args, `${fieldPath}.args`) } : {}),
    ...(Object.hasOwn(value, 'env') ? { env: normalizeEnvironmentRows(value.env, `${fieldPath}.env`) } : {})
  }
}
function normalizeDraft(value: unknown): ProjectConfigurationV1 {
  if (!isRecord(value)) fail('CONFIG_FIELD_TYPE_INVALID', '$', 'The configuration draft has the wrong type.', 'Submit a structured configuration draft.')
  rejectUnknown(value, draftFields, '$')
  if (!isRecord(value.service)) fail('CONFIG_FIELD_TYPE_INVALID', '$.service', 'The service draft has the wrong type.', 'Submit one structured service draft.')
  const service = value.service
  rejectUnknown(service, draftServiceFields, '$.service')
  if (typeof service.id !== 'string' || !isValidServiceId(service.id)) fail('CONFIG_SERVICE_ID_INVALID', '$.service.id', 'The service identifier is invalid.', 'Use 1-64 lowercase letters, numbers, and single hyphen-separated segments.')
  if (typeof service.shell !== 'boolean') fail('CONFIG_FIELD_TYPE_INVALID', '$.service.shell', 'Shell must be a boolean.', 'Use true or false.')
  return { schemaVersion: 1, services: { [service.id]: {
    program: validateProgram(service.program, '$.service.program'),
    args: assertStringArray(service.args, '$.service.args'),
    workingDirectory: validatePortablePath(service.workingDirectory, '$.service.workingDirectory', true),
    shell: service.shell,
    envFiles: normalizeEnvFiles(service.envFiles, '$.service.envFiles'),
    env: normalizeEnvironmentRows(service.env, '$.service.env'),
    ...(service.macos === undefined ? {} : { macos: normalizeDraftOverride(service.macos, '$.service.macos')! }),
    ...(service.windows === undefined ? {} : { windows: normalizeDraftOverride(service.windows, '$.service.windows')! })
  } } }
}
function platformDocument(override: PlatformOverride): Record<string, unknown> {
  return { ...(override.program === undefined ? {} : { program: override.program }), ...(override.args === undefined ? {} : { args: [...override.args] }), ...(override.env === undefined ? {} : { env: override.env }) }
}
function serviceDocument(service: DevelopmentServiceConfiguration): Record<string, unknown> {
  return { program: service.program, args: [...service.args], working_directory: service.workingDirectory, shell: service.shell, env_files: [...service.envFiles], env: service.env, ...(service.macos === undefined ? {} : { macos: platformDocument(service.macos) }), ...(service.windows === undefined ? {} : { windows: platformDocument(service.windows) }) }
}
function serialize(configuration: ProjectConfigurationV1): string {
  const services = Object.fromEntries(Object.entries(configuration.services).sort(([left], [right]) => compareCodeUnits(left, right)).map(([id, service]) => [id, serviceDocument(service)]))
  return `${stringify({ schema_version: 1n, services }).replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`
}
export function buildProjectConfigurationPreview(draft: ProjectConfigurationDraft): ProjectConfigurationPreview {
  return { source: serialize(normalizeDraft(draft as unknown)) }
}
export function parseProjectConfiguration(source: string): ProjectConfigurationV1 {
  let document: unknown
  try { document = parseToml(source, { integersAsBigInt: true }) } catch {
    fail('CONFIG_TOML_INVALID', '$', 'The project configuration is not valid TOML.', 'Check the TOML syntax and try again.')
  }
  if (!isRecord(document)) fail('CONFIG_TOML_INVALID', '$', 'The project configuration is not valid TOML.', 'Check the TOML syntax and try again.')
  rejectUnknown(document, topLevelFields, '$')
  if (!Object.hasOwn(document, 'schema_version')) fail('CONFIG_SCHEMA_VERSION_REQUIRED', '$.schema_version', 'The schema version is missing.', 'Set schema_version to 1.')
  if (document.schema_version !== 1n) fail('CONFIG_SCHEMA_VERSION_UNSUPPORTED', '$.schema_version', 'The schema version is not supported.', 'Use schema_version = 1.')
  if (!isRecord(document.services) || Object.keys(document.services).length === 0) fail('CONFIG_SERVICES_REQUIRED', '$.services', 'At least one service is required.', 'Define at least one service table.')
  const services: Array<[string, DevelopmentServiceConfiguration]> = []
  for (const id of Object.keys(document.services).sort()) {
    const servicePath = serviceFieldPath(id)
    if (!isValidServiceId(id)) fail('CONFIG_SERVICE_ID_INVALID', servicePath, 'The service identifier is invalid.', 'Use 1-64 lowercase letters, numbers, and single hyphen-separated segments.')
    const value = document.services[id]
    if (!isRecord(value)) fail('CONFIG_FIELD_TYPE_INVALID', servicePath, 'The service has the wrong type.', 'Use a service table.')
    services.push([id, normalizeParsedService(value, servicePath)])
  }
  return { schemaVersion: 1, services: Object.fromEntries(services) }
}
