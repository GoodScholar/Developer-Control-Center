import {
  link,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NodeHostRuntime } from './node-host-runtime'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    realpath: vi.fn(actual.realpath),
    lstat: vi.fn(actual.lstat),
    stat: vi.fn(actual.stat),
    readFile: vi.fn(actual.readFile),
    symlink: vi.fn(actual.symlink),
    unlink: vi.fn(actual.unlink),
    open: vi.fn(actual.open),
    link: vi.fn(actual.link),
    rm: vi.fn(actual.rm)
  }
})

let temporaryRoot: string

beforeEach(async () => {
  vi.clearAllMocks()
  temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'developer-control-center-')))
})

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true })
})

test('canonicalizes an accessible project directory', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  await mkdir(rootPath)

  await expect(new NodeHostRuntime().inspectProjectDirectory(rootPath)).resolves.toEqual({
    canonicalPath: await realpath(rootPath),
    name: 'sample-project'
  })
})

test('returns an actionable error for a missing directory', async () => {
  const rootPath = join(temporaryRoot, 'missing-project')

  await expect(new NodeHostRuntime().inspectProjectDirectory(rootPath)).rejects.toMatchObject({
    detail: {
      code: 'PROJECT_DIRECTORY_UNAVAILABLE',
      message: `The project directory is unavailable: ${rootPath}`,
      nextAction: 'Reconnect the drive or choose an accessible project directory.'
    }
  })
})

test('returns an actionable error when the path is not a directory', async () => {
  const rootPath = join(temporaryRoot, 'not-a-directory')
  await writeFile(rootPath, 'file contents')

  await expect(new NodeHostRuntime().inspectProjectDirectory(rootPath)).rejects.toMatchObject({
    detail: {
      code: 'PROJECT_DIRECTORY_UNAVAILABLE',
      message: `The project directory is unavailable: ${rootPath}`,
      nextAction: 'Reconnect the drive or choose an accessible project directory.'
    }
  })
})

test('preserves an unexpected filesystem error', async () => {
  const sentinel = new Error('unexpected filesystem failure')
  vi.mocked(realpath).mockRejectedValueOnce(sentinel)

  await expect(
    new NodeHostRuntime().inspectProjectDirectory(join(temporaryRoot, 'sample-project'))
  ).rejects.toBe(sentinel)
})

test('returns configuration-exists without reading package.json', async () => {
  const rootPath = join(temporaryRoot, 'configured-project')
  await mkdir(rootPath)
  await writeFile(join(rootPath, '.devcontrol.toml'), 'existing', 'utf8')
  await writeFile(join(rootPath, 'package.json'), '{"scripts":{"dev":"opaque"}}', 'utf8')
  vi.mocked(readFile).mockClear()

  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath))
    .resolves.toEqual({ kind: 'configuration-exists' })
  expect(readFile).not.toHaveBeenCalled()
})

test('returns package-json-missing for an absent fixed manifest', async () => {
  const rootPath = join(temporaryRoot, 'empty-project')
  await mkdir(rootPath)

  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath))
    .resolves.toEqual({ kind: 'package-json-missing' })
})

test('reads only the root package.json as UTF-8', async () => {
  const rootPath = join(temporaryRoot, 'node-project')
  const source = '{"scripts":{"dev":"opaque"}}'
  await mkdir(join(rootPath, 'packages', 'nested'), { recursive: true })
  await writeFile(join(rootPath, 'package.json'), source, 'utf8')
  await writeFile(join(rootPath, 'packages', 'nested', 'package.json'), 'nested-marker', 'utf8')

  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath))
    .resolves.toEqual({ kind: 'package-json', source })
  expect(vi.mocked(readFile)).toHaveBeenCalledOnce()
  expect(vi.mocked(readFile).mock.calls[0]![0]).toBe(join(rootPath, 'package.json'))
})

test.skipIf(process.platform === 'win32')('rejects a package.json symlink outside the canonical root', async () => {
  const rootPath = join(temporaryRoot, 'project')
  const outsidePath = join(temporaryRoot, 'outside-package.json')
  await mkdir(rootPath)
  await writeFile(outsidePath, '{"scripts":{"dev":"outside-body"}}', 'utf8')
  await symlink(outsidePath, join(rootPath, 'package.json'))

  const error = await new NodeHostRuntime().inspectPackageJsonDetection(rootPath).then(
    () => { throw new Error('Expected containment rejection.') },
    (value: unknown) => value
  )

  expect(error).toMatchObject({ detail: { code: 'PACKAGE_JSON_OUTSIDE_PROJECT' } })
  expect(JSON.stringify(error)).not.toContain(outsidePath)
  expect(JSON.stringify(error)).not.toContain('outside-body')
})

test.skipIf(process.platform === 'win32')('reads an internal package.json symlink through its contained resolved target', async () => {
  const rootPath = join(temporaryRoot, 'project')
  const internalTarget = join(rootPath, 'manifests', 'package-source.json')
  const packagePath = join(rootPath, 'package.json')
  const source = '{"scripts":{"dev":"internal-body"}}'
  await mkdir(join(rootPath, 'manifests'), { recursive: true })
  await writeFile(internalTarget, source, 'utf8')
  await symlink(internalTarget, packagePath)

  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath))
    .resolves.toEqual({ kind: 'package-json', source })
  expect(readFile).toHaveBeenCalledWith(await realpath(internalTarget), 'utf8')
})

test.skipIf(process.platform === 'win32')('does not follow a packagePath swap after realpath containment', async () => {
  const rootPath = join(temporaryRoot, 'project')
  const packagePath = join(rootPath, 'package.json')
  const internalTarget = join(rootPath, 'internal-package.json')
  const outsideTarget = join(temporaryRoot, 'outside-package.json')
  await mkdir(rootPath)
  await writeFile(internalTarget, '{"scripts":{"dev":"internal-body"}}', 'utf8')
  await writeFile(outsideTarget, '{"scripts":{"dev":"outside-body"}}', 'utf8')
  await symlink(internalTarget, packagePath)
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(stat).mockImplementationOnce(async (target) => {
    const details = await actual.stat(target)
    await unlink(packagePath)
    await symlink(outsideTarget, packagePath)
    return details
  })

  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath)).resolves.toEqual({
    kind: 'package-json', source: '{"scripts":{"dev":"internal-body"}}'
  })
  expect(readFile).toHaveBeenCalledWith(await realpath(internalTarget), 'utf8')
})

test('rejects a directory at package.json without reading it', async () => {
  const rootPath = join(temporaryRoot, 'project')
  await mkdir(join(rootPath, 'package.json'), { recursive: true })

  await expect(new NodeHostRuntime().inspectPackageJsonDetection(rootPath)).rejects.toMatchObject({
    detail: { code: 'PACKAGE_JSON_READ_FAILED', resource: { kind: 'project' } }
  })
  expect(readFile).not.toHaveBeenCalled()
})

test.each(['EACCES', 'EPERM'])('maps package manifest access error %s without raw details', async (code) => {
  vi.mocked(readFile).mockRejectedValueOnce(Object.assign(new Error('/outside/raw-path'), { code }))
  const rootPath = join(temporaryRoot, 'project')
  await mkdir(rootPath)
  await writeFile(join(rootPath, 'package.json'), '{}', 'utf8')

  const error = await new NodeHostRuntime().inspectPackageJsonDetection(rootPath).catch((value) => value)

  expect(error).toMatchObject({ detail: { code: 'PACKAGE_JSON_READ_FAILED' } })
  expect(JSON.stringify(error)).not.toContain('/outside/raw-path')
})

test('creates the complete project configuration as UTF-8', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  await mkdir(rootPath)
  const source = 'schema_version = 1\n\n[services.web]\nprogram = "pnpm"\n'

  await new NodeHostRuntime().createProjectConfiguration(rootPath, source)

  await expect(readFile(join(rootPath, '.devcontrol.toml'), 'utf8')).resolves.toBe(source)
  await expect(readdir(rootPath)).resolves.toEqual(['.devcontrol.toml'])
})

test('never changes an existing project configuration', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  const target = join(rootPath, '.devcontrol.toml')
  await mkdir(rootPath)
  await writeFile(target, 'existing-marker', 'utf8')

  await expect(
    new NodeHostRuntime().createProjectConfiguration(rootPath, 'replacement')
  ).rejects.toMatchObject({
    detail: {
      code: 'PROJECT_CONFIGURATION_ALREADY_EXISTS',
      resource: { kind: 'project_configuration' }
    }
  })
  await expect(readFile(target, 'utf8')).resolves.toBe('existing-marker')
  await expect(readdir(rootPath)).resolves.toEqual(['.devcontrol.toml'])
})

test('allows at most one concurrent creator and preserves its complete bytes', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  await mkdir(rootPath)
  const runtime = new NodeHostRuntime()

  const results = await Promise.allSettled([
    runtime.createProjectConfiguration(rootPath, 'first-complete\n'),
    runtime.createProjectConfiguration(rootPath, 'second-complete\n')
  ])

  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  const rejected = results.filter((result): result is PromiseRejectedResult =>
    result.status === 'rejected'
  )
  expect(rejected).toHaveLength(1)
  expect(rejected[0]!.reason).toMatchObject({
    detail: { code: 'PROJECT_CONFIGURATION_ALREADY_EXISTS' }
  })
  const stored = await readFile(join(rootPath, '.devcontrol.toml'), 'utf8')
  expect(['first-complete\n', 'second-complete\n']).toContain(stored)
  await expect(readdir(rootPath)).resolves.toEqual(['.devcontrol.toml'])
})

test('closes and removes only the staging file created by a failed write', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  const target = join(rootPath, '.devcontrol.toml')
  const staging = join(rootPath, '.devcontrol.toml.tmp-write-failure')
  await mkdir(rootPath)
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const handle = await actual.open(staging, 'wx')
  const close = vi.spyOn(handle, 'close')
  vi.spyOn(handle, 'writeFile').mockRejectedValueOnce(new Error('write sentinel'))
  vi.mocked(open).mockResolvedValueOnce(handle)

  await expect(
    new NodeHostRuntime(() => 'write-failure').createProjectConfiguration(rootPath, 'complete source')
  ).rejects.toThrow('write sentinel')

  expect(close).toHaveBeenCalledOnce()
  await expect(readFile(target, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(staging, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})

test('writes env file references without reading the referenced files', async () => {
  const rootPath = join(temporaryRoot, 'sample-project')
  await mkdir(rootPath)
  const source = 'schema_version = 1\nenv_files = ["missing-secret.env"]\n'

  await new NodeHostRuntime().createProjectConfiguration(rootPath, source)

  await expect(readFile(join(rootPath, '.devcontrol.toml'), 'utf8')).resolves.toBe(source)
  await expect(readFile(join(rootPath, 'missing-secret.env'), 'utf8')).rejects.toMatchObject({
    code: 'ENOENT'
  })
})

test.each(['sync', 'close'] as const)('does not publish when staging %s fails', async (method) => {
  const rootPath = join(temporaryRoot, `failure-${method}`)
  const staging = join(rootPath, `.devcontrol.toml.tmp-${method}-failure`)
  await mkdir(rootPath)
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const handle = await actual.open(staging, 'wx')
  const sentinel = new Error(`${method} sentinel`)
  if (method === 'sync') vi.spyOn(handle, 'sync').mockRejectedValueOnce(sentinel)
  if (method === 'close') {
    const actualClose = handle.close.bind(handle)
    vi.spyOn(handle, 'close').mockRejectedValueOnce(sentinel).mockImplementationOnce(actualClose)
  }
  vi.mocked(open).mockResolvedValueOnce(handle)

  await expect(
    new NodeHostRuntime(() => `${method}-failure`).createProjectConfiguration(rootPath, 'source')
  ).rejects.toBe(sentinel)

  await expect(readFile(join(rootPath, '.devcontrol.toml'), 'utf8')).rejects.toMatchObject({
    code: 'ENOENT'
  })
  await expect(readFile(staging, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})

test('preserves the write error when staging cleanup fails', async () => {
  const rootPath = join(temporaryRoot, 'cleanup-failure')
  const staging = join(rootPath, '.devcontrol.toml.tmp-cleanup-failure')
  await mkdir(rootPath)
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const handle = await actual.open(staging, 'wx')
  const sentinel = new Error('write sentinel')
  vi.spyOn(handle, 'writeFile').mockRejectedValueOnce(sentinel)
  vi.mocked(open).mockResolvedValueOnce(handle)
  vi.mocked(rm).mockRejectedValueOnce(new Error('cleanup sentinel'))

  await expect(
    new NodeHostRuntime(() => 'cleanup-failure').createProjectConfiguration(rootPath, 'source')
  ).rejects.toBe(sentinel)
})

test('keeps a successful published result when staging cleanup fails', async () => {
  const rootPath = join(temporaryRoot, 'published-cleanup-failure')
  await mkdir(rootPath)
  vi.mocked(rm).mockRejectedValueOnce(new Error('cleanup sentinel'))

  await expect(
    new NodeHostRuntime(() => 'published-cleanup-failure').createProjectConfiguration(
      rootPath,
      'complete source'
    )
  ).resolves.toBeUndefined()
  await expect(readFile(join(rootPath, '.devcontrol.toml'), 'utf8')).resolves.toBe('complete source')
  await expect(readdir(rootPath).then((entries) => entries.sort())).resolves.toEqual([
    '.devcontrol.toml',
    '.devcontrol.toml.tmp-published-cleanup-failure'
  ])
})

test.each(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'])('maps staging filesystem error %s', async (code) => {
  const rootPath = join(temporaryRoot, `filesystem-${code}`)
  await mkdir(rootPath)
  vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error('filesystem sentinel'), { code }))

  await expect(new NodeHostRuntime().createProjectConfiguration(rootPath, 'source')).rejects.toMatchObject({
    detail: { code: 'PROJECT_DIRECTORY_UNAVAILABLE' }
  })
  expect(link).not.toHaveBeenCalled()
})
