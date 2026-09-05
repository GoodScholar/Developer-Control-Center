import { DatabaseSync } from 'node:sqlite'
import type { ProjectRegistry, StoredProject } from './project-registry'

export class SqliteProjectRegistry implements ProjectRegistry {
  private readonly database: DatabaseSync

  constructor(databasePath: string) {
    const database = new DatabaseSync(databasePath)
    try {
      database.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          root_path TEXT NOT NULL UNIQUE
        ) STRICT;
      `)
    } catch (error) {
      database.close()
      throw error
    }
    this.database = database
  }

  list(): StoredProject[] {
    const rows = this.database
      .prepare('SELECT id, name, root_path FROM projects ORDER BY rowid')
      .all()

    return rows.map((row) => {
      const { id, name, root_path: rootPath } = row
      if (typeof id !== 'string' || typeof name !== 'string' || typeof rootPath !== 'string') {
        throw new TypeError(
          'Invalid project registry row: id, name, and root_path must be strings.'
        )
      }
      return { id, name, rootPath }
    })
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
