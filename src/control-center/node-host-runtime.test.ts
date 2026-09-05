import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { NodeHostRuntime } from './node-host-runtime'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, realpath: vi.fn(actual.realpath) }
})

let temporaryRoot: string

beforeEach(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'developer-control-center-'))
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
