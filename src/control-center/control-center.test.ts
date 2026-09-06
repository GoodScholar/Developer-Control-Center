import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { ControlCenter } from './control-center'
import {
  invalidProjectId,
  projectConfigurationAlreadyExists,
  projectDirectoryUnavailable,
  projectNotFound
} from './errors'
import type { HostRuntime, PackageJsonDetectionInspection } from './host-runtime'
import { NodeHostRuntime } from './node-host-runtime'
import type { ProjectRegistry } from './project-registry'
import { SqliteProjectRegistry } from './sqlite-project-registry'
import { TestHostRuntime } from './testing/test-host-runtime'
import { TestProjectRegistry } from './testing/test-project-registry'
import type { ProjectConfigurationDraft } from '../shared/contracts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function createTestControlCenter(
  databasePath: string,
  hostRuntime: HostRuntime,
  nextId: () => string = () => 'project-1'
): ControlCenter {
  return new ControlCenter(
    new SqliteProjectRegistry(databasePath),
    hostRuntime,
    nextId
  )
}

const configurationDraft: ProjectConfigurationDraft = {
  services: [{
    id: 'web',
    program: 'pnpm',
    args: ['dev'],
    workingDirectory: '.',
    shell: false,
    envFiles: ['.env'],
    env: [{ key: 'NODE_ENV', value: 'development' }]
  }]
}

function configuredProjectControlCenter(): { center: ControlCenter; host: TestHostRuntime } {
  const registry = new TestProjectRegistry([
    { id: 'project-1', name: 'sample-project', rootPath: '/stored/project' }
  ])
  const host = new TestHostRuntime(new Map([
    ['/stored/project', { canonicalPath: '/canonical/project', name: 'sample-project' }]
  ]))
  return { center: new ControlCenter(registry, host), host }
}

function trustedProjectControlCenter(hostRuntime: HostRuntime): ControlCenter {
  const project = {
    id: 'stored-project-id',
    name: 'sample-project',
    rootPath: '/stored/project'
  }
  const registry = { get: () => project } as unknown as ProjectRegistry
  return new ControlCenter(registry, hostRuntime)
}

function detectionCenter(inspection: PackageJsonDetectionInspection): {
  center: ControlCenter
  host: TestHostRuntime
  registry: TestProjectRegistry
} {
  const registry = new TestProjectRegistry([
    { id: 'stored-project-id', name: 'sample-project', rootPath: '/stored/project' }
  ])
  const host = new TestHostRuntime(
    new Map([['/stored/project', { canonicalPath: '/canonical/project', name: 'sample-project' }]]),
    new Map([['/canonical/project', inspection]])
  )
  return { center: new ControlCenter(registry, host), host, registry }
}

test('registers a project and restores it from local metadata', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'developer-control-center-'))
  temporaryRoots.push(temporaryRoot)
  const projectRoot = join(temporaryRoot, 'sample-project')
  const databasePath = join(temporaryRoot, 'projects.sqlite')
  const hostRuntime = new TestHostRuntime(new Map([
    [projectRoot, { canonicalPath: projectRoot, name: 'sample-project' }]
  ]))
  const first = createTestControlCenter(databasePath, hostRuntime)

  const registered = await first.registerProject(projectRoot)

  expect(registered).toEqual({
    id: 'project-1',
    name: 'sample-project',
    rootPath: projectRoot,
    availability: 'available'
  })
  first.close()

  const reopened = createTestControlCenter(databasePath, hostRuntime)
  await expect(reopened.listProjects()).resolves.toEqual([registered])
  reopened.close()
})

test('keeps a registration when its directory is missing', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'developer-control-center-'))
  temporaryRoots.push(temporaryRoot)
  const projectDirectory = join(temporaryRoot, 'sample-project')
  const databasePath = join(temporaryRoot, 'projects.sqlite')
  await mkdir(projectDirectory)
  const projectRoot = await realpath(projectDirectory)
  const controlCenter = createTestControlCenter(databasePath, new NodeHostRuntime())
  const registered = await controlCenter.registerProject(projectRoot)

  await rm(projectRoot, { recursive: true })

  await expect(controlCenter.listProjects()).resolves.toEqual([
    {
      ...registered,
      availability: 'missing',
      problem: {
        code: 'PROJECT_DIRECTORY_UNAVAILABLE',
        resource: { kind: 'project', id: registered.id },
        message: `The project directory is unavailable: ${projectRoot}`,
        nextAction: 'Reconnect the drive or choose an accessible project directory.'
      }
    }
  ])
  controlCenter.close()
})

test('preserves an unexpected host runtime error when listing projects', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'developer-control-center-'))
  temporaryRoots.push(temporaryRoot)
  const projectRoot = join(temporaryRoot, 'sample-project')
  const databasePath = join(temporaryRoot, 'projects.sqlite')
  const first = createTestControlCenter(databasePath, new TestHostRuntime(new Map([
    [projectRoot, { canonicalPath: projectRoot, name: 'sample-project' }]
  ])))
  await first.registerProject(projectRoot)
  first.close()
  const sentinel = new Error('unexpected host runtime failure')
  const hostRuntime: HostRuntime = {
    async inspectProjectDirectory() {
      throw sentinel
    },
    async inspectPackageJsonDetection() {
      return { kind: 'package-json-missing' }
    },
    async createProjectConfiguration() {}
  }
  const reopened = createTestControlCenter(databasePath, hostRuntime)

  await expect(reopened.listProjects()).rejects.toBe(sentinel)
  reopened.close()
})

test('unregisters without deleting project files', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'developer-control-center-'))
  temporaryRoots.push(temporaryRoot)
  const projectRoot = join(temporaryRoot, 'sample-project')
  const databasePath = join(temporaryRoot, 'projects.sqlite')
  const marker = join(projectRoot, 'keep-me.txt')
  await mkdir(projectRoot)
  await writeFile(marker, 'preserve')
  const controlCenter = createTestControlCenter(databasePath, new NodeHostRuntime())
  const registered = await controlCenter.registerProject(projectRoot)

  await controlCenter.unregisterProject(registered.id)

  await expect(readFile(marker, 'utf8')).resolves.toBe('preserve')
  await expect(controlCenter.listProjects()).resolves.toEqual([])
  controlCenter.close()

  const reopened = createTestControlCenter(databasePath, new NodeHostRuntime())
  await expect(reopened.listProjects()).resolves.toEqual([])
  reopened.close()
})

test('rejects an empty project identifier', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'developer-control-center-'))
  temporaryRoots.push(temporaryRoot)
  const databasePath = join(temporaryRoot, 'projects.sqlite')
  const controlCenter = createTestControlCenter(databasePath, new NodeHostRuntime())

  await expect(controlCenter.unregisterProject('')).rejects.toMatchObject({
    detail: {
      code: 'INVALID_PROJECT_ID',
      resource: { kind: 'project' },
      message: 'The project identifier is invalid.',
      nextAction: 'Refresh the project list and try again.'
    }
  })
  controlCenter.close()
})

test('previews a registered project without creating a file', async () => {
  const { center, host } = configuredProjectControlCenter()

  const preview = await center.previewProjectConfiguration('project-1', configurationDraft)

  expect(preview.source).toContain('schema_version = 1')
  expect(preview.source).toContain('NODE_ENV = "development"')
  expect(host.createdProjectConfigurations).toEqual([])
})

test('revalidates and creates in the canonical registered project root', async () => {
  const { center, host } = configuredProjectControlCenter()
  await center.previewProjectConfiguration('project-1', configurationDraft)

  const result = await center.createProjectConfiguration('project-1', configurationDraft)

  expect(result).toEqual({ relativePath: '.devcontrol.toml' })
  expect(host.createdProjectConfigurations).toEqual([
    {
      rootPath: '/canonical/project',
      source: expect.stringContaining('[services.web]')
    }
  ])
})

test('rejects a changed invalid draft at create time without writing', async () => {
  const { center, host } = configuredProjectControlCenter()
  await center.previewProjectConfiguration('project-1', configurationDraft)
  const changed = structuredClone(configurationDraft)
  changed.services[0]!.workingDirectory = '../outside'

  await expect(center.createProjectConfiguration('project-1', changed)).rejects.toMatchObject({
    detail: {
      code: 'CONFIG_PATH_OUTSIDE_PROJECT',
      resource: { kind: 'project_configuration', projectId: 'project-1' },
      fieldPath: '$.services[0].workingDirectory'
    }
  })
  expect(host.createdProjectConfigurations).toEqual([])
})

test.each(['', '   '])('rejects an invalid project id before registry access', async (projectId) => {
  const registry = { get: vi.fn() } as unknown as ProjectRegistry
  const center = new ControlCenter(registry, {} as HostRuntime)

  await expect(center.previewProjectConfiguration(projectId, configurationDraft)).rejects.toMatchObject({
    detail: { code: 'INVALID_PROJECT_ID', resource: { kind: 'project' } }
  })
  expect(registry.get).not.toHaveBeenCalled()
})

test('distinguishes an unknown registration from a missing directory', async () => {
  const host = new TestHostRuntime(new Map())
  const inspect = vi.spyOn(host, 'inspectProjectDirectory')
  const unknown = new ControlCenter(new TestProjectRegistry(), host)

  await expect(unknown.previewProjectConfiguration('project-404', configurationDraft)).rejects.toMatchObject({
    detail: { code: 'PROJECT_NOT_FOUND', resource: { kind: 'project', id: 'project-404' } }
  })
  expect(inspect).not.toHaveBeenCalled()

  const missing = new ControlCenter(
    new TestProjectRegistry([{ id: 'project-1', name: 'missing', rootPath: '/missing' }]),
    new TestHostRuntime(new Map())
  )
  await expect(missing.previewProjectConfiguration('project-1', configurationDraft)).rejects.toMatchObject({
    detail: { code: 'PROJECT_DIRECTORY_UNAVAILABLE', resource: { kind: 'project', id: 'project-1' } }
  })
})

test('adds the trusted project id to an already-exists create failure', async () => {
  const { center, host } = configuredProjectControlCenter()
  vi.spyOn(host, 'createProjectConfiguration').mockRejectedValueOnce(projectConfigurationAlreadyExists())

  await expect(center.createProjectConfiguration('project-1', configurationDraft)).rejects.toMatchObject({
    detail: {
      code: 'PROJECT_CONFIGURATION_ALREADY_EXISTS',
      resource: { kind: 'project_configuration', projectId: 'project-1' }
    }
  })
})

test('queries the registration and directory again for every create', async () => {
  const registry = new TestProjectRegistry([
    { id: 'project-1', name: 'sample-project', rootPath: '/stored/project' }
  ])
  const host = new TestHostRuntime(new Map([
    ['/stored/project', { canonicalPath: '/canonical/project', name: 'sample-project' }]
  ]))
  const get = vi.spyOn(registry, 'get')
  const inspect = vi.spyOn(host, 'inspectProjectDirectory')
  const center = new ControlCenter(registry, host)

  await center.createProjectConfiguration('project-1', configurationDraft)
  await center.createProjectConfiguration('project-1', configurationDraft)

  expect(get).toHaveBeenCalledTimes(2)
  expect(inspect).toHaveBeenCalledTimes(2)
  expect(host.createdProjectConfigurations).toHaveLength(2)
})

test('binds a directory error to the registered project id', async () => {
  const center = trustedProjectControlCenter({
    async inspectProjectDirectory() {
      throw projectDirectoryUnavailable('/stored/project')
    },
    async inspectPackageJsonDetection() {
      return { kind: 'package-json-missing' }
    },
    async createProjectConfiguration() {}
  })

  await expect(center.previewProjectConfiguration('renderer-project-id', configurationDraft)).rejects.toMatchObject({
    detail: {
      code: 'PROJECT_DIRECTORY_UNAVAILABLE',
      resource: { kind: 'project', id: 'stored-project-id' }
    }
  })
})

test('binds a configuration error to the registered project id without leaking draft data', async () => {
  const center = trustedProjectControlCenter(new TestHostRuntime(new Map([
    ['/stored/project', { canonicalPath: '/canonical/project', name: 'sample-project' }]
  ])))
  const invalidDraft = structuredClone(configurationDraft)
  invalidDraft.services[0]!.workingDirectory = '../outside'

  const error = await center.previewProjectConfiguration('renderer-project-id', invalidDraft).then(
    () => { throw new Error('Expected configuration preview to reject.') },
    (error: unknown) => error
  )

  expect((error as { detail: unknown }).detail).toEqual({
    code: 'CONFIG_PATH_OUTSIDE_PROJECT',
    resource: { kind: 'project_configuration', projectId: 'stored-project-id' },
    fieldPath: '$.services[0].workingDirectory',
    message: 'The path leaves the project root.',
    nextAction: 'Choose a path inside the project root.'
  })
})

test('binds a creation error to the registered project id', async () => {
  const center = trustedProjectControlCenter({
    async inspectProjectDirectory() {
      return { canonicalPath: '/canonical/project', name: 'sample-project' }
    },
    async inspectPackageJsonDetection() {
      return { kind: 'package-json-missing' }
    },
    async createProjectConfiguration() {
      throw projectConfigurationAlreadyExists()
    }
  })

  await expect(center.createProjectConfiguration('renderer-project-id', configurationDraft)).rejects.toMatchObject({
    detail: {
      code: 'PROJECT_CONFIGURATION_ALREADY_EXISTS',
      resource: { kind: 'project_configuration', projectId: 'stored-project-id' }
    }
  })
})

test('preserves an invalid project id returned by the host runtime', async () => {
  const expected = invalidProjectId()
  const center = trustedProjectControlCenter({
    async inspectProjectDirectory() {
      throw expected
    },
    async inspectPackageJsonDetection() {
      return { kind: 'package-json-missing' }
    },
    async createProjectConfiguration() {}
  })

  await expect(center.previewProjectConfiguration('renderer-project-id', configurationDraft)).rejects.toBe(expected)
})

test('preserves a project-not-found error returned by the host runtime', async () => {
  const expected = projectNotFound('different-project-id')
  const center = trustedProjectControlCenter({
    async inspectProjectDirectory() {
      throw expected
    },
    async inspectPackageJsonDetection() {
      return { kind: 'package-json-missing' }
    },
    async createProjectConfiguration() {}
  })

  await expect(center.previewProjectConfiguration('renderer-project-id', configurationDraft)).rejects.toBe(expected)
})

test.each([
  [{ kind: 'configuration-exists' }, { kind: 'none', reason: 'configuration-exists' }],
  [{ kind: 'package-json-missing' }, { kind: 'none', reason: 'package-json-missing' }],
  [{ kind: 'package-json', source: '{"scripts":{"test":"opaque"}}' }, { kind: 'none', reason: 'no-candidates' }]
] as const)('maps host inspection to a none result', async (inspection, expected) => {
  const { center } = detectionCenter(inspection)

  await expect(center.detectProjectConfiguration('stored-project-id')).resolves.toEqual(expected)
})

test('returns a project-bound proposal from the canonical registered root', async () => {
  const { center, host } = detectionCenter({
    kind: 'package-json',
    source: '{"packageManager":"pnpm@10.17.1","scripts":{"dev":"opaque","dev:api":"opaque-api"}}'
  })

  await expect(center.detectProjectConfiguration('stored-project-id')).resolves.toMatchObject({
    kind: 'proposal',
    proposal: {
      projectId: 'stored-project-id',
      candidates: [
        { evidence: { scriptName: 'dev' }, draft: { id: 'dev', program: 'pnpm', args: ['run', 'dev'] } },
        { evidence: { scriptName: 'dev:api' }, draft: { id: 'dev-api', program: 'pnpm', args: ['run', 'dev:api'] } }
      ]
    }
  })
  expect(host.packageJsonDetectionInspections).toEqual(['/canonical/project'])
})

test('rejects invalid and unknown project ids before host detection', async () => {
  const registry = new TestProjectRegistry()
  const host = new TestHostRuntime(new Map())
  const center = new ControlCenter(registry, host)

  await expect(center.detectProjectConfiguration(' ')).rejects.toMatchObject({
    detail: { code: 'INVALID_PROJECT_ID' }
  })
  await expect(center.detectProjectConfiguration('missing')).rejects.toMatchObject({
    detail: { code: 'PROJECT_NOT_FOUND', resource: { kind: 'project', id: 'missing' } }
  })
  expect(host.packageJsonDetectionInspections).toEqual([])
})

test('binds detector errors to the stored project id without manifest source', async () => {
  const source = '{"scripts":{"dev":"secret-script-body","dev:api":7}}'
  const { center } = detectionCenter({ kind: 'package-json', source })

  const error = await center.detectProjectConfiguration('stored-project-id').catch((value) => value)

  expect(error).toMatchObject({ detail: {
    code: 'PACKAGE_JSON_SCRIPT_INVALID',
    resource: { kind: 'project', id: 'stored-project-id' },
    fieldPath: '$.scripts["dev:api"]'
  } })
  expect(JSON.stringify(error)).not.toContain(source)
  expect(JSON.stringify(error)).not.toContain('secret-script-body')
})

test('keeps registration after detection failure', async () => {
  const { center } = detectionCenter({ kind: 'package-json', source: '{invalid' })

  await expect(center.detectProjectConfiguration('stored-project-id')).rejects.toMatchObject({
    detail: { code: 'PACKAGE_JSON_INVALID' }
  })
  await expect(center.listProjects()).resolves.toEqual([expect.objectContaining({
    id: 'stored-project-id', availability: 'available'
  })])
})
