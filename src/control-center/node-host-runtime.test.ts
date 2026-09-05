import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { NodeHostRuntime } from './node-host-runtime'

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
