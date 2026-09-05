import { DatabaseSync } from 'node:sqlite'
import type { ProjectRegistry, StoredProject } from './project-registry'

interface ProjectRow {
  id: string
  name: string
  root_path: string
}

export class SqliteProjectRegistry implements ProjectRegistry {
  private readonly database: DatabaseSync

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath)
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE
      ) STRICT;
    `)
  }

  list(): StoredProject[] {
    const rows = this.database
      .prepare('SELECT id, name, root_path FROM projects ORDER BY rowid')
      .all() as unknown as ProjectRow[]

    return rows.map(({ id, name, root_path: rootPath }) => ({ id, name, rootPath }))
  }

  insert(project: StoredProject): void {
    this.database
      .prepare('INSERT INTO projects (id, name, root_path) VALUES (?, ?, ?)')
      .run(project.id, project.name, project.rootPath)
  }

  remove(projectId: string): void {
    this.database.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
  }

  close(): void {
    this.database.close()
  }
}
