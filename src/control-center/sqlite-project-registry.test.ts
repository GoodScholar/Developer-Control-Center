import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test } from 'vitest'
import { SqliteProjectRegistry } from './sqlite-project-registry'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test.each(['id', 'name', 'root_path'] as const)(
  'rejects a legacy project row when $0 is not a string',
  async (invalidColumn) => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'developer-control-center-'))
    temporaryRoots.push(temporaryRoot)
    const databasePath = join(temporaryRoot, 'projects.sqlite')
    const database = new DatabaseSync(databasePath)
    database.exec('CREATE TABLE projects (id, name, root_path)')
    const row: Record<'id' | 'name' | 'root_path', string | number> = {
      id: 'project-1',
      name: 'sample-project',
      root_path: '/projects/sample-project'
    }
    row[invalidColumn] = 42
    database
      .prepare('INSERT INTO projects (id, name, root_path) VALUES (?, ?, ?)')
      .run(row.id, row.name, row.root_path)
    database.close()
    const registry = new SqliteProjectRegistry(databasePath)

    try {
      expect(() => registry.list()).toThrowError(
        'Invalid project registry row: id, name, and root_path must be strings.'
      )
    } finally {
      registry.close()
    }
  }
)
