import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import type { ProjectRegistry } from './project-registry'
import { SqliteProjectRegistry } from './sqlite-project-registry'
import { TestProjectRegistry } from './testing/test-project-registry'

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action()
})

async function registryFactories(): Promise<Array<[string, ProjectRegistry]>> {
  const root = await mkdtemp(join(tmpdir(), 'dcc-registry-contract-'))
  const sqlite = new SqliteProjectRegistry(join(root, 'projects.sqlite'))
  const memory = new TestProjectRegistry()
  cleanup.push(
    async () => rm(root, { recursive: true, force: true }),
    async () => sqlite.close(),
    async () => memory.close()
  )
  return [['sqlite', sqlite], ['memory', memory]]
}

test('get returns the matching project and null without touching project files', async () => {
  for (const [name, registry] of await registryFactories()) {
    const first = { id: 'project-1', name: 'first', rootPath: '/registered/first' }
    const second = { id: 'project-2', name: 'second', rootPath: '/registered/second' }
    registry.insert(first)
    registry.insert(second)

    expect(registry.get('project-2'), name).toEqual(second)
    expect(registry.get('unknown-project'), name).toBeNull()
  }
})
