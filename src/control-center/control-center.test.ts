import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { ControlCenter } from './control-center'
import type { HostRuntime } from './host-runtime'
import { NodeHostRuntime } from './node-host-runtime'
import { SqliteProjectRegistry } from './sqlite-project-registry'
import { TestHostRuntime } from './testing/test-host-runtime'

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
    }
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
