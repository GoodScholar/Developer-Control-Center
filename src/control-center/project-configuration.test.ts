import { expect, test } from 'vitest'
import type { ProjectConfigurationDraft } from '../shared/contracts'
import {
  buildProjectConfigurationPreview,
  parseProjectConfiguration
} from './project-configuration'

const minimalDraft: ProjectConfigurationDraft = {
  service: {
    id: 'web',
    program: '  pnpm  ',
    args: [],
    workingDirectory: '.',
    shell: false,
    envFiles: [],
    env: []
  }
}

test('builds a deterministic schema v1 preview with explicit safe defaults', () => {
  const first = buildProjectConfigurationPreview(minimalDraft)
  const second = buildProjectConfigurationPreview(minimalDraft)
  expect(first).toEqual(second)
  expect(first.source).toMatch(/^schema_version = 1\n/)
  expect(first.source).toContain('[services.web]')
  expect(first.source).toContain('program = "pnpm"')
  expect(first.source).toContain('args = []')
  expect(first.source).toContain('working_directory = "."')
  expect(first.source).toContain('shell = false')
  expect(first.source).toContain('env_files = []')
  expect(first.source.endsWith('\n')).toBe(true)
  expect(first.source.endsWith('\n\n')).toBe(false)
})

test('orders shared fields, environment keys and platform overrides deterministically', () => {
  const draft: ProjectConfigurationDraft = {
    service: {
      id: 'web',
      program: 'pnpm',
      args: ['dev', '--host', '127.0.0.1'],
      workingDirectory: 'apps/web',
      shell: true,
      envFiles: ['.env', 'apps/web/.env.local'],
      env: [
        { key: 'PORT', value: '3000' },
        { key: 'z_lower', value: 'last' },
        { key: 'NODE_ENV', value: 'development' },
        { key: '_FIRST', value: 'first' }
      ],
      macos: {
        args: ['dev', '--watch'],
        env: [{ key: 'WATCH_MODE', value: 'native' }]
      },
      windows: {
        program: 'pnpm.cmd',
        args: ['dev', '--watch'],
        env: [{ key: 'WATCH_MODE', value: 'poll' }]
      }
    }
  }
  const { source } = buildProjectConfigurationPreview(draft)
  expect(source.indexOf('schema_version')).toBeLessThan(source.indexOf('[services.web]'))
  expect(source.indexOf('program = "pnpm"')).toBeLessThan(source.indexOf('args = ['))
  expect(source.indexOf('args = [')).toBeLessThan(source.indexOf('working_directory = '))
  expect(source.indexOf('working_directory = ')).toBeLessThan(source.indexOf('shell = '))
  expect(source.indexOf('shell = ')).toBeLessThan(source.indexOf('env_files = '))
  expect(source.indexOf('env_files = ')).toBeLessThan(source.indexOf('[services.web.env]'))
  expect(source.indexOf('[services.web.env]')).toBeLessThan(source.indexOf('[services.web.macos]'))
  expect(source.indexOf('NODE_ENV')).toBeLessThan(source.indexOf('PORT'))
  expect(source.indexOf('PORT')).toBeLessThan(source.indexOf('_FIRST'))
  expect(source.indexOf('_FIRST')).toBeLessThan(source.indexOf('z_lower'))
  expect(source.indexOf('[services.web.macos]')).toBeLessThan(
    source.indexOf('[services.web.windows]')
  )
  expect(source).toContain('shell = true')
})

test('parses the complete schema and exposes platform replacement and env merge semantics', () => {
  const source = `schema_version = 1
[services.web]
program = "pnpm"
args = ["dev", "--host", "127.0.0.1"]
working_directory = "apps/web"
shell = false
env_files = [".env", "apps/web/.env.local"]
[services.web.env]
NODE_ENV = "development"
PORT = "3000"
[services.web.macos]
args = ["dev", "--watch"]
[services.web.macos.env]
WATCH_MODE = "native"
[services.web.windows]
program = "pnpm.cmd"
args = []
[services.web.windows.env]
PORT = "4000"
`
  const configuration = parseProjectConfiguration(source)
  expect(configuration).toEqual({
    schemaVersion: 1,
    services: {
      web: {
        program: 'pnpm',
        args: ['dev', '--host', '127.0.0.1'],
        workingDirectory: 'apps/web',
        shell: false,
        envFiles: ['.env', 'apps/web/.env.local'],
        env: { NODE_ENV: 'development', PORT: '3000' },
        macos: { args: ['dev', '--watch'], env: { WATCH_MODE: 'native' } },
        windows: { program: 'pnpm.cmd', args: [], env: { PORT: '4000' } }
      }
    }
  })
  const service = configuration.services.web!
  expect({
    ...service,
    program: service.windows?.program ?? service.program,
    args: service.windows?.args ?? service.args,
    env: { ...service.env, ...service.windows?.env }
  }).toMatchObject({
    program: 'pnpm.cmd',
    args: [],
    env: { NODE_ENV: 'development', PORT: '4000' },
    workingDirectory: 'apps/web',
    shell: false,
    envFiles: ['.env', 'apps/web/.env.local']
  })
})

test('fills all optional service defaults and only boolean true enables shell', () => {
  expect(parseProjectConfiguration(`schema_version = 1\n[services.web]\nprogram = "pnpm"\n`))
    .toEqual({
      schemaVersion: 1,
      services: {
        web: {
          program: 'pnpm',
          args: [],
          workingDirectory: '.',
          shell: false,
          envFiles: [],
          env: {}
        }
      }
    })
  expect(() => parseProjectConfiguration(
    `schema_version = 1\n[services.web]\nprogram = "pnpm"\nshell = "true"\n`
  )).toThrowError(expect.objectContaining({
    detail: expect.objectContaining({
      code: 'CONFIG_FIELD_TYPE_INVALID',
      fieldPath: '$.services.web.shell'
    })
  }))
})

test.each([
  ['leading LF', '\npnpm'],
  ['trailing LF', 'pnpm\n'],
  ['leading CR', '\rpnpm'],
  ['trailing CR', 'pnpm\r']
])('rejects program control characters before draft normalization: %s', (_name, program) => {
  const draft = structuredClone(minimalDraft)
  draft.service.program = program
  expect(() => buildProjectConfigurationPreview(draft)).toThrowError(expect.objectContaining({
    detail: expect.objectContaining({
      code: 'CONFIG_STRING_CONTAINS_CONTROL_CHARACTER',
      fieldPath: '$.service.program'
    })
  }))
})

test.each([
  ['leading LF', '\\npnpm'],
  ['trailing LF', 'pnpm\\n'],
  ['leading CR', '\\rpnpm'],
  ['trailing CR', 'pnpm\\r']
])('rejects program control characters parsed from TOML: %s', (_name, encodedProgram) => {
  expect(() => parseProjectConfiguration(
    `schema_version = 1\n[services.web]\nprogram = "${encodedProgram}"\n`
  )).toThrowError(expect.objectContaining({
    detail: expect.objectContaining({
      code: 'CONFIG_STRING_CONTAINS_CONTROL_CHARACTER',
      fieldPath: '$.services.web.program'
    })
  }))
})

const oversizedServiceId = 'a'.repeat(65)

test.each([
  ['Web', '$.services["Web"]'],
  ['web_api', '$.services["web_api"]'],
  [oversizedServiceId, `$.services["${oversizedServiceId}"]`]
])('uses bracket notation for invalid service identifier field paths: %s', (serviceId, fieldPath) => {
  expect(() => parseProjectConfiguration(
    `schema_version = 1\n[services."${serviceId}"]\nprogram = "pnpm"\n`
  )).toThrowError(expect.objectContaining({
    detail: expect.objectContaining({ code: 'CONFIG_SERVICE_ID_INVALID', fieldPath })
  }))
})

test.each([
  ['broken = "unterminated', 'CONFIG_TOML_INVALID', '$'],
  ['[services.web]\nprogram = "pnpm"', 'CONFIG_SCHEMA_VERSION_REQUIRED', '$.schema_version'],
  ['schema_version = 1.0\n[services.web]\nprogram = "pnpm"', 'CONFIG_SCHEMA_VERSION_UNSUPPORTED', '$.schema_version'],
  ['schema_version = 2\n[services.web]\nprogram = "pnpm"', 'CONFIG_SCHEMA_VERSION_UNSUPPORTED', '$.schema_version'],
  ['schema_version = 1\nextra = true\n[services.web]\nprogram = "pnpm"', 'CONFIG_UNKNOWN_FIELD', '$.extra'],
  ['schema_version = 1', 'CONFIG_SERVICES_REQUIRED', '$.services'],
  ['schema_version = 1\n[services."web.api"]\nprogram = "pnpm"', 'CONFIG_SERVICE_ID_INVALID', '$.services["web.api"]'],
  ['schema_version = 1\n[services.web]', 'CONFIG_PROGRAM_REQUIRED', '$.services.web.program'],
  ['schema_version = 1\n[services.web]\nprogram = "   "', 'CONFIG_PROGRAM_REQUIRED', '$.services.web.program'],
  ['schema_version = 1\n[services.web]\nprogram = "/usr/bin/node"', 'CONFIG_PATH_ABSOLUTE', '$.services.web.program'],
  ['schema_version = 1\n[services.web]\nprogram = "C:tools/node.exe"', 'CONFIG_PATH_ABSOLUTE', '$.services.web.program'],
  ['schema_version = 1\n[services.web]\nprogram = "../bin/server"', 'CONFIG_PATH_OUTSIDE_PROJECT', '$.services.web.program'],
  ['schema_version = 1\n[services.web]\nprogram = "pnpm"\nworking_directory = "C:/repo"', 'CONFIG_PATH_ABSOLUTE', '$.services.web.working_directory'],
  ['schema_version = 1\n[services.web]\nprogram = "pnpm"\nworking_directory = "apps/../web"', 'CONFIG_PATH_OUTSIDE_PROJECT', '$.services.web.working_directory'],
  ['schema_version = 1\n[services.web]\nprogram = "pnpm"\nenv_files = [".env", ".env"]', 'CONFIG_ENV_FILE_DUPLICATE', '$.services.web.env_files[1]'],
  ['schema_version = 1\n[services.web]\nprogram = "pnpm"\n[services.web.macos]', 'CONFIG_PLATFORM_OVERRIDE_EMPTY', '$.services.web.macos'],
  ['schema_version = 1\n[services.web]\nprogram = "pnpm"\n[services.web.windows]\nshell = true', 'CONFIG_PLATFORM_OVERRIDE_FIELD_INVALID', '$.services.web.windows.shell']
] as const)('rejects invalid schema without leaking source: %s', (source, code, fieldPath) => {
  let thrown: unknown
  try {
    parseProjectConfiguration(source)
  } catch (error) {
    thrown = error
  }
  expect(thrown).toMatchObject({ detail: { code, fieldPath } })
  expect(JSON.stringify(thrown)).not.toContain(source)
})

test.each([
  '/absolute/path',
  'C:/workspace/app',
  'C:workspace/app',
  '//server/share/file',
  '\\\\server\\share\\file',
  '~/secret',
  'https://example.com/.env',
  'apps\\web',
  'apps//web',
  'apps/./web',
  'apps/web/',
  ''
])('rejects a non-portable env file path: %s', (value) => {
  const draft = structuredClone(minimalDraft)
  draft.service.envFiles = [value]
  expect(() => buildProjectConfigurationPreview(draft)).toThrowError(
    expect.objectContaining({ detail: expect.objectContaining({ code: expect.stringMatching(/^CONFIG_PATH_/) }) })
  )
})

test('never includes an environment value in configuration failures', () => {
  const secretValue = 'mutation-secret-value-7391'
  const draft = structuredClone(minimalDraft)
  draft.service.env = [
    { key: 'SAFE_KEY', value: secretValue },
    { key: 'SAFE_KEY', value: secretValue }
  ]
  let thrown: unknown
  try {
    buildProjectConfigurationPreview(draft)
  } catch (error) {
    thrown = error
  }
  expect(thrown).toMatchObject({
    detail: {
      code: 'CONFIG_ENVIRONMENT_KEY_DUPLICATE',
      fieldPath: '$.service.env[1].key'
    }
  })
  expect(JSON.stringify(thrown)).not.toContain(secretValue)
})

test.each([
  ['unknown service field', { ...minimalDraft, service: { ...minimalDraft.service, surprise: true } }, 'CONFIG_UNKNOWN_FIELD', '$.service.surprise'],
  ['non-array args', { ...minimalDraft, service: { ...minimalDraft.service, args: 'dev' } }, 'CONFIG_FIELD_TYPE_INVALID', '$.service.args'],
  ['NUL program', { ...minimalDraft, service: { ...minimalDraft.service, program: 'pnpm\0' } }, 'CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', '$.service.program'],
  ['NUL argument', { ...minimalDraft, service: { ...minimalDraft.service, args: ['dev\0'] } }, 'CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', '$.service.args[0]'],
  ['NUL environment value', { ...minimalDraft, service: { ...minimalDraft.service, env: [{ key: 'SAFE', value: 'value\0' }] } }, 'CONFIG_STRING_CONTAINS_CONTROL_CHARACTER', '$.service.env[0].value'],
  ['invalid environment key', { ...minimalDraft, service: { ...minimalDraft.service, env: [{ key: 'NOT-PORTABLE', value: 'value' }] } }, 'CONFIG_ENVIRONMENT_KEY_INVALID', '$.service.env[0].key'],
  ['empty platform override', { ...minimalDraft, service: { ...minimalDraft.service, macos: {} } }, 'CONFIG_PLATFORM_OVERRIDE_EMPTY', '$.service.macos']
] as const)('rejects malicious draft shape: %s', (_name, value, code, fieldPath) => {
  expect(() => buildProjectConfigurationPreview(value as unknown as ProjectConfigurationDraft))
    .toThrowError(expect.objectContaining({ detail: expect.objectContaining({ code, fieldPath }) }))
})

test.each([
  ['args', (draft: ProjectConfigurationDraft) => { draft.service.args = new Array(1) }, '$.service.args[0]'],
  ['environment rows', (draft: ProjectConfigurationDraft) => { draft.service.env = new Array(1) }, '$.service.env[0]']
])('rejects sparse %s from an IPC draft', (_name, mutate, fieldPath) => {
  const draft = structuredClone(minimalDraft)
  mutate(draft)
  expect(() => buildProjectConfigurationPreview(draft)).toThrowError(
    expect.objectContaining({
      detail: expect.objectContaining({
        code: 'CONFIG_FIELD_TYPE_INVALID',
        fieldPath
      })
    })
  )
})

test.each(['pnpm.cmd', 'scripts/dev-server'])('accepts a portable program form: %s', (program) => {
  const draft = structuredClone(minimalDraft)
  draft.service.program = program
  draft.service.args = ['https://example.com', '/tool-specific/value']
  expect(() => buildProjectConfigurationPreview(draft)).not.toThrow()
})

test('round-trips __proto__ as an own environment key', () => {
  const draft = structuredClone(minimalDraft)
  draft.service.env = [{ key: '__proto__', value: 'safe-value' }]
  const parsed = parseProjectConfiguration(buildProjectConfigurationPreview(draft).source)
  expect(Object.hasOwn(parsed.services.web!.env, '__proto__')).toBe(true)
  expect(parsed.services.web!.env.__proto__).toBe('safe-value')
})

test('round-trips a generated preview through the public parser', () => {
  const preview = buildProjectConfigurationPreview(minimalDraft)
  expect(parseProjectConfiguration(preview.source)).toEqual({
    schemaVersion: 1,
    services: {
      web: {
        program: 'pnpm',
        args: [],
        workingDirectory: '.',
        shell: false,
        envFiles: [],
        env: {}
      }
    }
  })
})

test('round-trips every shared and platform field from a complete draft', () => {
  const draft = structuredClone(minimalDraft)
  Object.assign(draft.service, {
    args: ['dev', '--host', '127.0.0.1'],
    workingDirectory: 'apps/web',
    shell: true,
    envFiles: ['.env', 'apps/web/.env.local'],
    env: [{ key: 'NODE_ENV', value: 'development' }, { key: 'PORT', value: '3000' }],
    macos: { args: ['dev', '--watch'], env: [{ key: 'WATCH_MODE', value: 'native' }] },
    windows: {
      program: 'pnpm.cmd',
      args: [],
      env: [{ key: 'PORT', value: '4000' }, { key: 'WATCH_MODE', value: 'poll' }]
    }
  })
  expect(parseProjectConfiguration(buildProjectConfigurationPreview(draft).source)).toEqual({
    schemaVersion: 1,
    services: {
      web: {
        program: 'pnpm',
        args: ['dev', '--host', '127.0.0.1'],
        workingDirectory: 'apps/web',
        shell: true,
        envFiles: ['.env', 'apps/web/.env.local'],
        env: { NODE_ENV: 'development', PORT: '3000' },
        macos: { args: ['dev', '--watch'], env: { WATCH_MODE: 'native' } },
        windows: { program: 'pnpm.cmd', args: [], env: { PORT: '4000', WATCH_MODE: 'poll' } }
      }
    }
  })
})
