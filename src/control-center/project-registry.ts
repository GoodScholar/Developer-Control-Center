export interface StoredProject {
  id: string
  name: string
  rootPath: string
}

export interface ProjectRegistry {
  list(): StoredProject[]
  insert(project: StoredProject): void
  remove(projectId: string): void
  close(): void
}
