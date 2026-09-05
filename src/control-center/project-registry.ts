export interface StoredProject {
  id: string
  name: string
  rootPath: string
}

export interface ProjectRegistry {
  list(): StoredProject[]
  get(projectId: string): StoredProject | null
  insert(project: StoredProject): void
  remove(projectId: string): void
  close(): void
}
